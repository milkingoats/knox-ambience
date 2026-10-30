-- Knox Ambience test mode: runs a scripted perf test, started by tools/perftest/perf-test.ps1.
--
-- The script writes Zomboid/Lua/knoxambience_autotest.txt (key=value lines) before it starts the game
-- and deletes it afterwards. Without that file, or once its "expires" time has passed, this file does
-- nothing. Progress goes to Zomboid/Lua/knoxambience_autotest_status.txt, one "<epoch ms> <event>"
-- line per step; the script reads it to start and stop PresentMon for each phase.
--
-- mode=run:    load the save, settle, walk the route, drive the route (the Java half steers), quit.
-- mode=record: load the save and record where the player walks and drives, for a new route.
--
-- newgame=1 (baseline runs): instead of loading a save, start a fresh sandbox world with the player at
-- spawn=x,y,z. Then take the screenshots listed in shots=, walk a loop around the spawn, spawn a car on
-- the nearest road and drive along that road (the route is worked out from the road tiles as it goes).

KnoxAutoTest = KnoxAutoTest or {}
local T = KnoxAutoTest

local CONFIG = "knoxambience_autotest.txt"
local STATUS = "knoxambience_autotest_status.txt"
local RECORDING = "knoxambience_route_recording.txt"

local WALK_POINT_TILES = 5    -- record mode: new walk point every 5 tiles
local DRIVE_POINT_TILES = 15  -- record mode: new drive point every 15 tiles
local REACH_TILES = 1.5       -- walk point counts as reached within this distance
local ROAD_STEP_TILES = 12    -- newgame drive: distance between generated road waypoints
local ROAD_SEARCH_TILES = 40  -- newgame drive: how far from the player to look for a road

-- ClimateManager float ids (ClimateManager.FLOAT_*), for screenshot weather.
local CLIMATE_PRECIPITATION = 3
local CLIMATE_FOG = 5
local CLIMATE_CLOUD = 8

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
    if T.cfg.newgame == "1" then
        T.startNewGame()
        return
    end
    local mode, name = string.match(T.cfg.save or "", "^([^/\\]+)[/\\](.+)$")
    if not mode then
        status("error bad save= value: " .. tostring(T.cfg.save))
        return
    end
    status("load_requested " .. mode .. "/" .. name)
    MainScreen.continueLatestSave(mode, name)
end

-- Fresh world with the player at spawn=. IsoWorld places the player at selectedDebugScenario.startLoc
-- when that global is set, the same hook the game's own debug scenarios use, and that works without -debug.
function T.startNewGame()
    local spawn = parsePoints(T.cfg.spawn)[1]
    if not spawn then
        status("error bad spawn= value: " .. tostring(T.cfg.spawn))
        return
    end
    local world = T.cfg.world or ("KA-baseline-" .. string.format("%.0f", now()))
    status(string.format("load_requested newgame %s at %d,%d,%d", world, spawn.x, spawn.y, spawn.z))
    selectedDebugScenario = { name = "Knox Ambience baseline", startLoc = { x = spawn.x, y = spawn.y, z = spawn.z } }
    SandboxVars.VehicleEasyUse = true
    getWorld():setGameMode("Sandbox")
    getWorld():setMap(T.cfg.map or "Muldraugh, KY")
    if MainScreen.instance and MainScreen.instance.desc then
        getWorld():setLuaPlayerDesc(MainScreen.instance.desc)
    end
    getWorld():getLuaTraits():clear()
    createWorld(world)
    GameWindow.doRenderEvent(false)
    forceChangeState(LoadingQueueState.new())
end

---------------------------------------------------------------------------------------------------
-- In game: screenshots (newgame runs). Same spot, fixed time of day and weather for each.

-- "name@hour@weather;..." -> { {name=, hour=, weather=}, ... }
local function parseShots(text)
    local shots = {}
    for part in string.gmatch(text or "", "[^;]+") do
        local name, hour, weather = string.match(part, "^%s*([%w_%-]+)@([%d%.]+)@(%a+)%s*$")
        if name then table.insert(shots, { name = name, hour = tonumber(hour), weather = weather }) end
    end
    return shots
end

local function setWeather(kind)
    local climate = ClimateManager.getInstance()
    local values = {
        clear = { [CLIMATE_PRECIPITATION] = 0, [CLIMATE_FOG] = 0, [CLIMATE_CLOUD] = 0.1 },
        rain = { [CLIMATE_PRECIPITATION] = 1, [CLIMATE_FOG] = 0.1, [CLIMATE_CLOUD] = 1 },
        fog = { [CLIMATE_PRECIPITATION] = 0, [CLIMATE_FOG] = 1, [CLIMATE_CLOUD] = 0.6 },
    }
    for id, value in pairs(values[kind] or values.clear) do
        local f = climate:getClimateFloat(id)
        f:setEnableAdmin(true)
        f:setAdminValue(value)
    end
end

local function setScene(hour, weather)
    getGameTime():setTimeOfDay(hour)
    setWeather(weather)
end

local function startShots()
    T.shots = parseShots(T.cfg.shots)
    if #T.shots == 0 then
        T.state = "walk_prepare"
        return
    end
    status(string.format("shots_start %d zoom %.2f", #T.shots, getCore():getZoom(0)))
    T.shotIndex = 1
    T.shotStep = "scene"
    T.state = "shots"
end

-- Per shot: set the scene, let lighting and weather catch up, hide the UI, capture, show the UI.
local function updateShots()
    local shot = T.shots[T.shotIndex]
    if T.shotStep == "scene" then
        setScene(shot.hour, shot.weather)
        T.shotAt = now() + num(T.cfg.shot_wait, 12) * 1000
        T.shotStep = "wait"
    elseif T.shotStep == "wait" and now() >= T.shotAt then
        pcall(function() UIManager.setVisibleAllUI(false) end)
        T.shotAt = now() + 1000
        T.shotStep = "capture"
    elseif T.shotStep == "capture" and now() >= T.shotAt then
        local file = (T.cfg.shot_prefix or "ka_") .. shot.name .. ".png"
        takeScreenshot(file)
        status("shot " .. file)
        T.shotAt = now() + 1000
        T.shotStep = "done"
    elseif T.shotStep == "done" and now() >= T.shotAt then
        pcall(function() UIManager.setVisibleAllUI(true) end)
        T.shotIndex = T.shotIndex + 1
        T.shotStep = "scene"
        if T.shotIndex > #T.shots then
            status("shots_end")
            -- Back to the run's own conditions before the measured parts.
            setScene(num(T.cfg.start_hour, 12), "clear")
            T.settleUntil = now() + num(T.cfg.shot_wait, 12) * 1000
            T.state = "walk_prepare"
        end
    end
end

---------------------------------------------------------------------------------------------------
-- In game: road following (newgame runs).

local function isRoad(x, y)
    local square = getCell():getGridSquare(math.floor(x), math.floor(y), 0)
    local floor = square and square:getFloor()
    local sprite = floor and floor:getSprite()
    local name = sprite and sprite:getName()
    if not name then return false end
    return string.find(name, "blends_street", 1, true) ~= nil
        or string.find(name, "floors_exterior_street", 1, true) ~= nil
end

local function nearestRoad(px, py)
    for r = 0, ROAD_SEARCH_TILES do
        for dx = -r, r do
            for dy = -r, r do
                if (math.abs(dx) == r or math.abs(dy) == r) and isRoad(px + dx, py + dy) then
                    return math.floor(px + dx) + 0.5, math.floor(py + dy) + 0.5
                end
            end
        end
    end
    return nil
end

-- Direction (radians, world x/y) with the longest straight run of road from (x, y).
local function roadHeading(x, y)
    local best, bestRun = nil, 0
    for i = 0, 7 do
        local h = i * math.pi / 4
        local run = 0
        while run < 40 and isRoad(x + math.cos(h) * (run + 1), y + math.sin(h) * (run + 1)) do run = run + 1 end
        if run > bestRun then best, bestRun = h, run end
    end
    return best, bestRun
end

-- Move a point sideways to the middle of the road it is on.
local function centre(x, y, h)
    local px, py = -math.sin(h), math.cos(h)
    local left, right = 0, 0
    while left < 10 and isRoad(x + px * (left + 1), y + py * (left + 1)) do left = left + 1 end
    while right < 10 and isRoad(x - px * (right + 1), y - py * (right + 1)) do right = right + 1 end
    local shift = (left - right) / 2
    return x + px * shift, y + py * shift
end

-- Next waypoint along the road, preferring straight on at junctions.
local function nextRoadPoint(last, h)
    for _, deg in ipairs({ 0, 10, -10, 20, -20, 30, -30, 45, -45, 60, -60, 80, -80 }) do
        local a = h + math.rad(deg)
        local cx, cy = math.cos(a), math.sin(a)
        local nx, ny = last.x + cx * ROAD_STEP_TILES, last.y + cy * ROAD_STEP_TILES
        if isRoad(nx, ny) and isRoad(last.x + cx * ROAD_STEP_TILES / 2, last.y + cy * ROAD_STEP_TILES / 2) then
            nx, ny = centre(nx, ny, a)
            return { x = nx, y = ny, z = 0 }, a
        end
    end
    return nil
end

-- Keep the route a few waypoints ahead of the car. Turns around once at a dead end.
local function extendRoad(ahead)
    while #T.drive < ahead and not T.roadEnded do
        local last = T.drive[#T.drive]
        local point, h = nextRoadPoint(last, T.roadHeading)
        if not point and not T.turnedAround then
            T.turnedAround = true
            status("road ends near " .. math.floor(last.x) .. "," .. math.floor(last.y) .. ", turning around")
            point, h = nextRoadPoint(last, T.roadHeading + math.pi)
        end
        if not point then
            T.roadEnded = true
            return
        end
        T.roadHeading = h
        table.insert(T.drive, point)
    end
end

-- Spawn a fuelled car on the nearest road, facing along it, and put the player next to it.
local function spawnCarOnRoad(player)
    local rx, ry = nearestRoad(player:getX(), player:getY())
    if not rx then return false, "no road within " .. ROAD_SEARCH_TILES .. " tiles of the walk" end
    local h, run = roadHeading(rx, ry)
    if not h or run < 8 then return false, "road near " .. math.floor(rx) .. "," .. math.floor(ry) .. " is too short" end
    rx, ry = centre(rx, ry, h)
    local dirs = { [0] = IsoDirections.E, [2] = IsoDirections.S, [4] = IsoDirections.W, [6] = IsoDirections.N }
    local quarter = (math.floor((h / (math.pi / 2)) + 0.5) % 4) * 2
    local car = addVehicleDebug(T.cfg.car or "Base.CarNormal", dirs[quarter], nil,
        getCell():getGridSquare(math.floor(rx), math.floor(ry), 0))
    if not car then return false, "could not spawn a car" end
    pcall(function() car:repair() end)
    pcall(function()
        local tank = car:getPartById("GasTank")
        tank:setContainerContentAmount(tank:getContainerCapacity())
    end)
    pcall(function() player:getInventory():AddItem(car:createVehicleKey()) end)
    -- Stand beside the car, off its side.
    local sx, sy = rx - math.sin(h) * 3, ry + math.cos(h) * 3
    player:teleportTo(sx, sy, 0)
    T.roadHeading = h
    T.drive = { { x = rx, y = ry, z = 0 } }
    extendRoad(4)
    status(string.format("car spawned at %d,%d heading %d deg, %d road tiles straight ahead",
        math.floor(rx), math.floor(ry), math.floor(math.deg(T.roadHeading)), run))
    return true
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
    if T.cfg.newgame == "1" and T.driveSeconds > 0 then
        local ok, err = spawnCarOnRoad(player)
        if not ok then
            fail(err)
            return
        end
        T.state = "drive_prepare"
        return
    end
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
    if T.cfg.newgame == "1" then
        local before = #T.drive
        extendRoad((KnoxAutoDrive.index or 1) + 3)
        -- The Java side stops at the last waypoint; once the road has ended, let it.
        if KnoxAutoDrive.finished and #T.drive > before then KnoxAutoDrive.finished = nil end
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
                if T.cfg.newgame == "1" then startShots() else startWalk(player) end
            end
        elseif T.state == "shots" then
            updateShots()
        elseif T.state == "walk_prepare" then
            if now() >= (T.settleUntil or 0) then startWalk(player) end
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
    if T.cfg.newgame == "1" then
        local player = getPlayer()
        pcall(function() player:Dressup(MainScreen.instance.desc) end)
        setScene(num(T.cfg.start_hour, 12), "clear")
        if #T.walk == 0 then
            -- A square loop next to the spawn; the walk action paths around anything in the way.
            local x, y = math.floor(player:getX()), math.floor(player:getY())
            local size = num(T.cfg.walk_loop, 14)
            T.walk = { { x = x, y = y, z = 0 }, { x = x + size, y = y, z = 0 }, { x = x + size, y = y + size, z = 0 },
                { x = x, y = y + size, z = 0 }, { x = x, y = y, z = 0 } }
        end
        status(string.format("newgame at %d,%d", math.floor(player:getX()), math.floor(player:getY())))
    end
    T.walkSeconds = num(T.cfg.walk_seconds, 120)
    T.driveSeconds = num(T.cfg.drive_seconds, 120)
    T.driveSpeed = num(T.cfg.drive_speed, 50)
    T.state = "settle"
    T.settleUntil = now() + num(T.cfg.settle, 20) * 1000
    status(string.format("settling %d s; walk %d points, drive %d points", num(T.cfg.settle, 20), #T.walk, #T.drive))
end

T.cfg = readConfig()
-- T outlives a Lua reload in the same session, so the flag stops a reload registering the handlers twice.
if T.cfg and not T.registered then
    T.registered = true
    print("[KnoxAmbienceTest] test run requested: mode=" .. tostring(T.cfg.mode) .. " save=" .. tostring(T.cfg.save))
    Events.OnFETick.Add(onFETick)
    Events.OnGameStart.Add(onGameStart)
    Events.OnTick.Add(onTick)
    Events.OnPlayerUpdate.Add(onPlayerUpdate)
end
