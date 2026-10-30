-- Knox Ambience test mode: runs a scripted perf test, started by tools/perftest/perf-test.ps1.
--
-- The script writes Zomboid/Lua/knoxambience_autotest.txt (key=value lines) before it starts the game
-- and deletes it afterwards. Without that file, or once its "expires" time has passed, this file does
-- nothing. Progress goes to Zomboid/Lua/knoxambience_autotest_status.txt, one "<epoch ms> <event>"
-- line per step; the script reads it to start and stop PresentMon for each phase.
--
-- mode=run:    load the save, settle, walk the route, drive the route (the Java half steers), quit.
-- mode=record: load the save and record where the player walks and drives, for a new route.

KnoxAutoTest = KnoxAutoTest or {}
local T = KnoxAutoTest

local CONFIG = "knoxambience_autotest.txt"
local STATUS = "knoxambience_autotest_status.txt"
local RECORDING = "knoxambience_route_recording.txt"

local WALK_POINT_TILES = 5    -- record mode: new walk point every 5 tiles
local DRIVE_POINT_TILES = 15  -- record mode: new drive point every 15 tiles
local REACH_TILES = 1.5       -- walk point counts as reached within this distance

local function now()
    return getTimestampMs()
end

local function readConfig()
    local reader = getFileReader(CONFIG, false)
    if not reader then return nil end
    local cfg = {}
    local line = reader:readLine()
    while line do
        local key, value = string.match(line, "^%s*([%w_]+)%s*=%s*(.-)%s*$")
        if key then cfg[key] = value end
        line = reader:readLine()
    end
    reader:close()
    local expires = tonumber(cfg.expires)
    if not expires or now() > expires then return nil end
    return cfg
end

local function status(event)
    local writer = getFileWriter(STATUS, true, true)
    writer:write(string.format("%.0f %s\n", now(), event))
    writer:close()
    print("[KnoxAmbienceTest] " .. event)
end

local function statusHas(word)
    local reader = getFileReader(STATUS, false)
    if not reader then return false end
    local found = false
    local line = reader:readLine()
    while line do
        if string.find(line, word, 1, true) then found = true end
        line = reader:readLine()
    end
    reader:close()
    return found
end

-- "x,y,z;x,y,z;..." -> { {x=,y=,z=}, ... }
local function parsePoints(text)
    local points = {}
    for part in string.gmatch(text or "", "[^;]+") do
        local x, y, z = string.match(part, "^%s*([%d%.%-]+)%s*,%s*([%d%.%-]+)%s*,?%s*([%d%.%-]*)")
        if x then
            table.insert(points, { x = tonumber(x), y = tonumber(y), z = tonumber(z) or 0 })
        end
    end
    return points
end

local function num(value, default)
    return tonumber(value) or default
end

local function dist(ax, ay, bx, by)
    return math.sqrt((ax - bx) ^ 2 + (ay - by) ^ 2)
end

---------------------------------------------------------------------------------------------------
-- Main menu: load the test save.

local menuTicks = 0

local function onFETick()
    if not T.cfg or T.loadRequested then return end
    menuTicks = menuTicks + 1
    if menuTicks < 120 then return end  -- let the menu finish building (about 2 s)
    T.loadRequested = true
    -- After a Lua reset the main menu comes back; never ask twice in one run.
    if statusHas("load_requested") then return end
    local mode, name = string.match(T.cfg.save or "", "^([^/\\]+)[/\\](.+)$")
    if not mode then
        status("error bad save= value: " .. tostring(T.cfg.save))
        return
    end
    status("load_requested " .. mode .. "/" .. name)
    MainScreen.continueLatestSave(mode, name)
end

---------------------------------------------------------------------------------------------------
-- In game: run mode.

local function findVehicle(player)
    local vehicle = player:getNearVehicle()
    if vehicle then return vehicle end
    local cell = getCell()
    local px, py, pz = math.floor(player:getX()), math.floor(player:getY()), math.floor(player:getZ())
    local best, bestDist = nil, 1e9
    for dx = -12, 12 do
        for dy = -12, 12 do
            local square = cell:getGridSquare(px + dx, py + dy, pz)
            local v = square and square:getVehicleContainer()
            if v then
                local d = dist(px, py, v:getX(), v:getY())
                if d < bestDist then best, bestDist = v, d end
            end
        end
    end
    return best
end

local function walkTo(player, point)
    local square = getCell():getGridSquare(math.floor(point.x), math.floor(point.y), math.floor(point.z))
    if not square then return false end
    ISTimedActionQueue.add(ISWalkToTimedAction:new(player, square))
    return true
end

local function finish(reason)
    T.state = "quitting"
    T.quitAt = now() + 3000
    status(reason)
end

local function fail(message)
    status("error " .. message)
    ISTimedActionQueue.clear(getPlayer())
    if KnoxAutoDrive then KnoxAutoDrive.active = false end
    finish("done failed")
end

local function startWalk(player)
    if #T.walk < 2 or T.walkSeconds <= 0 then
        status("walk skipped")
        T.state = "approach"
        return
    end
    if player:getVehicle() then
        status("walk skipped (player is in a vehicle)")
        T.state = "drive_prepare"
        return
    end
    -- Start from the route point nearest to the player, normally the first.
    T.walkIndex, T.walkStep = 1, 1
    T.state = "walk"
    T.phaseStart = now()
    status(string.format("phase_start walk %d", T.walkSeconds))
    walkTo(player, T.walk[T.walkIndex])
end

-- Walk back and forth along the route until the time is up.
local function updateWalk(player)
    local point = T.walk[T.walkIndex]
    if dist(player:getX(), player:getY(), point.x, point.y) <= REACH_TILES
            or not ISTimedActionQueue.isPlayerDoingAction(player) then
        if T.walkIndex == #T.walk then T.walkStep = -1 elseif T.walkIndex == 1 then T.walkStep = 1 end
        T.walkIndex = T.walkIndex + T.walkStep
        ISTimedActionQueue.clear(player)
        walkTo(player, T.walk[T.walkIndex])
    end
    if now() - T.phaseStart >= T.walkSeconds * 1000 then
        status("phase_end walk")
        T.state = "approach"
        ISTimedActionQueue.clear(player)
        T.walkStep = 1
        T.approachStart = now()
    end
end

-- After the walk, carry on to the last walk point (next to the car). Not measured.
local function updateApproach(player)
    if not T.drive or #T.drive < 2 or T.driveSeconds <= 0 then
        finish("done")
        return
    end
    if #T.walk == 0 or player:getVehicle() then
        T.state = "drive_prepare"
        return
    end
    local last = T.walk[#T.walk]
    if dist(player:getX(), player:getY(), last.x, last.y) <= REACH_TILES * 2 then
        ISTimedActionQueue.clear(player)
        T.state = "drive_prepare"
        return
    end
    if not ISTimedActionQueue.isPlayerDoingAction(player) then
        T.walkIndex = math.min(#T.walk, (T.walkIndex or 1) + 1)
        walkTo(player, T.walk[T.walkIndex])
    end
    if now() - T.approachStart > 180000 then fail("could not walk back to the car") end
end

local function updateDrivePrepare(player)
    local vehicle = player:getVehicle()
    T.prepareStart = T.prepareStart or now()
    if now() - T.prepareStart > 60000 then
        fail(vehicle and "engine would not start" or "could not get into a car")
        return
    end
    if not vehicle then
        if not T.nextTry or now() > T.nextTry then
            local car = findVehicle(player)
            if not car then
                fail("no car within 12 tiles of the end of the walk")
                return
            end
            ISVehicleMenu.onEnter(player, car, 0)
            T.nextTry = now() + 10000
        end
        return
    end
    if not vehicle:isDriver(player) then
        fail("player is in a car but not in the driver's seat")
        return
    end
    if not vehicle:isEngineRunning() then
        if not T.nextEngine or now() > T.nextEngine then
            ISVehicleMenu.onStartEngine(player)
            T.nextEngine = now() + 5000
        end
        return
    end
    pcall(function() vehicle:setRegulator(false) end)
    KnoxAutoDrive = { active = true, speed = T.driveSpeed, route = T.drive, index = 1, stuck = 0 }
    T.state = "drive"
    T.phaseStart = now()
    status(string.format("phase_start drive %d", T.driveSeconds))
end

local function updateDrive(player)
    local elapsed = now() - T.phaseStart
    if elapsed > 5000 and not KnoxAutoDrive.javaSeen then
        fail("autopilot did not start (is KnoxAmbienceTest.jar loaded?)")
        return
    end
    if not player:getVehicle() then
        fail("player left the car")
        return
    end
    if KnoxAutoDrive.finished or elapsed >= T.driveSeconds * 1000 then
        status(string.format("phase_end drive%s waypoint %d/%d stuck %d",
            KnoxAutoDrive.finished and " route_finished" or "",
            math.min(KnoxAutoDrive.index or 1, #T.drive), #T.drive, KnoxAutoDrive.stuck or 0))
        KnoxAutoDrive.active = false
        finish("done")
    end
end

local function setupPlayer(player)
    -- Same conditions every run: zombies ignore the player and nothing can hurt them.
    if T.cfg.ghost ~= "0" then
        pcall(function() player:setGhostMode(true) end)
        pcall(function() player:setInvisible(true) end)
        pcall(function() player:setGodMod(true) end)
    end
    if T.cfg.walk_run == "1" then
        pcall(function() player:setRunning(true) end)
    end
    setGameSpeed(1)
end

local function onTick()
    local player = getPlayer()
    if not player or not T.state then return end
    local ok, err = pcall(function()
        if T.state == "settle" then
            if now() >= T.settleUntil then
                setupPlayer(player)
                startWalk(player)
            end
        elseif T.state == "walk" then
            if T.cfg.walk_run == "1" then player:setRunning(true) end
            updateWalk(player)
        elseif T.state == "approach" then
            updateApproach(player)
        elseif T.state == "drive_prepare" then
            updateDrivePrepare(player)
        elseif T.state == "drive" then
            updateDrive(player)
        elseif T.state == "quitting" then
            if now() >= T.quitAt and T.cfg.quit ~= "0" then
                T.state = nil
                getCore():quitToDesktop()
            end
        end
    end)
    if not ok then
        T.state = nil
        status("error lua: " .. tostring(err))
        getCore():quitToDesktop()
    end
end

---------------------------------------------------------------------------------------------------
-- In game: record mode.

local function record(kind, x, y, z)
    local writer = getFileWriter(RECORDING, true, true)
    writer:write(string.format("%s %.1f,%.1f,%d\n", kind, x, y, z))
    writer:close()
end

local function onPlayerUpdate(player)
    if not T.recording or player ~= getPlayer() then return end
    local vehicle = player:getVehicle()
    if vehicle then
        if not vehicle:isDriver(player) then return end
        local x, y = vehicle:getX(), vehicle:getY()
        if not T.lastDrive or dist(x, y, T.lastDrive.x, T.lastDrive.y) >= DRIVE_POINT_TILES then
            T.lastDrive = { x = x, y = y }
            record("drive", x, y, 0)
        end
    elseif not T.lastDrive then
        -- Walk points are only recorded before the first drive, so the walk ends at the car.
        local x, y, z = player:getX(), player:getY(), math.floor(player:getZ())
        if not T.lastWalk or dist(x, y, T.lastWalk.x, T.lastWalk.y) >= WALK_POINT_TILES then
            T.lastWalk = { x = x, y = y }
            record("walk", x, y, z)
        end
    end
end

---------------------------------------------------------------------------------------------------

local function onGameStart()
    if not T.cfg then return end
    status("game_started")
    if T.cfg.mode == "record" then
        T.recording = true
        local player = getPlayer()
        record("walk", player:getX(), player:getY(), math.floor(player:getZ()))
        T.lastWalk = { x = player:getX(), y = player:getY() }
        status("recording")
        return
    end
    T.walk = parsePoints(T.cfg.walk)
    T.drive = parsePoints(T.cfg.drive)
    T.walkSeconds = num(T.cfg.walk_seconds, 120)
    T.driveSeconds = num(T.cfg.drive_seconds, 120)
    T.driveSpeed = num(T.cfg.drive_speed, 50)
    T.state = "settle"
    T.settleUntil = now() + num(T.cfg.settle, 20) * 1000
    status(string.format("settling %d s; walk %d points, drive %d points", num(T.cfg.settle, 20), #T.walk, #T.drive))
end

T.cfg = readConfig()
if T.cfg then
    print("[KnoxAmbienceTest] test run requested: mode=" .. tostring(T.cfg.mode) .. " save=" .. tostring(T.cfg.save))
    Events.OnFETick.Add(onFETick)
    Events.OnGameStart.Add(onGameStart)
    Events.OnTick.Add(onTick)
    Events.OnPlayerUpdate.Add(onPlayerUpdate)
end
