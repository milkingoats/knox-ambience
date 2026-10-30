<#
.SYNOPSIS
    One-command Knox Ambience perf test: mod preset, test save, game launch, PresentMon capture,
    log collection and a 1% / 0.1% low summary.

.DESCRIPTION
    Needs the KnoxAmbienceTest mod (mods/KnoxAmbienceTest) in Zomboid\mods, a test save and a route,
    made once with -Record. See docs/perf-test.md.

    Each run starts the game fresh, so ZombieBuddy patches from an earlier run can't leak in.
    The test mod loads the save, waits, walks the route, drives the route, then quits. PresentMon
    records each phase on its own. Results go to <MeasureDir>\runs\<time>-<label>\.

.EXAMPLE
    .\perf-test.ps1 -Label after
    One run with the perf base preset.

.EXAMPLE
    .\perf-test.ps1 -Label before -Without KnoxAmbience
    One run with Knox Ambience switched off.

.EXAMPLE
    .\perf-test.ps1 -AB -Repeat 2
    Before/after set: off, on, off, on (a full game restart each), then a comparison.

.EXAMPLE
    .\perf-test.ps1 -Record -FromSave Outbreak\2026-10-30_16-02-45
    Copy that save as the test save, start it, and record the route while you walk and drive it once.

.EXAMPLE
    .\perf-test.ps1 -NewGame -Mods ZombieBuddy,KnoxAmbience -AB -Phases walk,drive,shots
    Baseline with no test save or recorded route: each session starts a fresh world at -Spawn, takes
    the -Shots screenshots, walks a loop there, then drives a car along the nearest road.
    baseline.bat runs exactly this.

.EXAMPLE
    .\perf-test.ps1 -Compare 20261030-190000-before, 20261030-190800-after
#>
[CmdletBinding(DefaultParameterSetName = 'Run')]
param(
    [Parameter(ParameterSetName = 'Run')][string]$Label = 'run',
    # Mod ids to leave out of the preset for this run, e.g. KnoxAmbience for a "before" run.
    [Parameter(ParameterSetName = 'Run')][string[]]$Without = @(),
    # Before/after set: alternates runs without and with the -Toggle mods.
    [Parameter(ParameterSetName = 'Run')][switch]$AB,
    [Parameter(ParameterSetName = 'Run')][string[]]$Toggle = @('KnoxAmbience'),
    [Parameter(ParameterSetName = 'Run')][int]$Repeat = 1,
    [Parameter(ParameterSetName = 'Run')][string[]]$Phases = @('walk', 'drive'),
    [Parameter(ParameterSetName = 'Run')][int]$WalkSeconds = 120,
    [Parameter(ParameterSetName = 'Run')][int]$DriveSeconds = 120,
    [Parameter(ParameterSetName = 'Run')][int]$DriveSpeed = 60,
    # Seconds to wait in game before the walk starts (streaming, shader warm-up).
    [Parameter(ParameterSetName = 'Run')][int]$Settle = 20,
    # Seconds of each capture to ignore at the start.
    [Parameter(ParameterSetName = 'Run')][double]$Skip = 3,
    [Parameter(ParameterSetName = 'Run')][switch]$KeepWalking,
    # Fresh world instead of the test save: spawn point (x,y,z), map, and the start time of day.
    [Parameter(ParameterSetName = 'Run')][switch]$NewGame,
    [Parameter(ParameterSetName = 'Run')][string]$Spawn = '10620,9550,0',
    [Parameter(ParameterSetName = 'Run')][string]$Map = 'Muldraugh, KY',
    [Parameter(ParameterSetName = 'Run')][double]$StartHour = 12,
    # Screenshots for the 'shots' phase (new game only): name@hour@weather, weather clear, rain or fog.
    [Parameter(ParameterSetName = 'Run')][string]$Shots = 'noon@12@clear;afternoon@17@clear;golden@19.5@clear;sunset@20.5@clear;dusk@21.25@clear;night@23.5@clear;rain@15@rain;fog@8@fog',
    # Base mod list for this run instead of the perf base preset file, e.g. ZombieBuddy,KnoxAmbience.
    [Parameter(ParameterSetName = 'Run')][string[]]$Mods = @(),

    [Parameter(ParameterSetName = 'Record', Mandatory = $true)][switch]$Record,
    # Save to copy as the test save, relative to Zomboid\Saves, e.g. Outbreak\2026-10-30_16-02-45.
    # Leave out to re-record the route on the existing test save.
    [Parameter(ParameterSetName = 'Record')][string]$FromSave,

    [Parameter(ParameterSetName = 'Compare', Mandatory = $true)][string[]]$Compare,

    # 'steam' starts the game through Steam (uses the Steam launch options, i.e. the ZombieBuddy .bat).
    # 'bat' runs ProjectZomboid64.bat directly.
    [ValidateSet('steam', 'bat')][string]$Launch = 'steam',
    [string]$ZomboidDir = (Join-Path $env:USERPROFILE 'Zomboid'),
    [string]$GameDir = 'C:\Program Files (x86)\Steam\steamapps\common\ProjectZomboid',
    [string]$PerfDir = (Join-Path $env:USERPROFILE 'dev\_perf'),
    [string]$MeasureDir = (Join-Path $env:USERPROFILE 'dev\_measure'),
    [string]$PresentMon = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2

# Lists may arrive as one "a,b" string when called through perf-test.bat (powershell -File).
function Split-List([string[]]$list) { @($list | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ }) }
$Without = Split-List $Without
$Toggle = Split-List $Toggle
$Phases = Split-List $Phases
$Mods = Split-List $Mods
if ($Compare) { $Compare = Split-List $Compare }
foreach ($p in $Phases) { if ('walk', 'drive', 'shots' -notcontains $p) { throw "Unknown phase '$p' (use walk, drive, shots)" } }
if ($Phases -contains 'shots' -and -not $NewGame) { throw "The shots phase needs -NewGame." }

$TestSaveName = 'KA-perftest'
$ConfigName = 'knoxambience_autotest.txt'
$StatusName = 'knoxambience_autotest_status.txt'
$RecordingName = 'knoxambience_route_recording.txt'
$TestModId = 'KnoxAmbienceTest'

$LuaDir = Join-Path $ZomboidDir 'Lua'
$ConfigFile = Join-Path $LuaDir $ConfigName
$StatusFile = Join-Path $LuaDir $StatusName
$RecordingFile = Join-Path $LuaDir $RecordingName
$PresetFile = Join-Path $PerfDir 'perf-base.txt'
$RouteFile = Join-Path $PerfDir 'route.txt'
$PristineSave = Join-Path $PerfDir 'testsave'
$RunsDir = Join-Path $MeasureDir 'runs'

# ------------------------------------------------------------------------------------------------
# Helpers

function Test-Admin {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    return (New-Object Security.Principal.WindowsPrincipal $id).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# PresentMon needs admin rights. Re-run this script elevated with the same arguments.
# -Command rather than -File, so array arguments such as -Phases walk,drive survive the hop.
function Restart-Elevated($boundParams) {
    $quote = { param($v) "'" + ([string]$v -replace "'", "''") + "'" }
    $call = "& " + (& $quote $PSCommandPath)
    foreach ($key in $boundParams.Keys) {
        $value = $boundParams[$key]
        if ($value -is [switch]) {
            if ($value.IsPresent) { $call += " -$key" }
        } elseif ($value -is [array]) {
            $call += " -$key " + (($value | ForEach-Object { & $quote $_ }) -join ',')
        } else {
            $call += " -$key " + (& $quote $value)
        }
    }
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($call))
    Write-Host 'PresentMon needs administrator rights: approve the prompt to continue in a new window.'
    Start-Process powershell.exe -Verb RunAs -ArgumentList @('-NoProfile', '-NoExit', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', $encoded) | Out-Null
    exit 0
}

function Read-ModList([string]$path) {
    if (-not (Test-Path $path)) { throw "Mod preset not found: $path (see docs/perf-test.md)" }
    return @(Get-Content $path | ForEach-Object { $_.Trim() } | Where-Object { $_ -and -not $_.StartsWith('#') })
}

function Write-ModsFile([string]$path, [string[]]$mods) {
    $lines = @('VERSION = 1,', '', 'mods', '{')
    foreach ($m in $mods) { $lines += "    mod = $m," }
    $lines += @('}', '', 'maps', '{', '}', '')
    # The game writes these files without a BOM.
    [IO.File]::WriteAllText($path, ($lines -join "`r`n"), (New-Object Text.UTF8Encoding $false))
}

function Read-KeyValues([string]$path) {
    $map = [ordered]@{}
    if (Test-Path $path) {
        foreach ($line in Get-Content $path) {
            if ($line -match '^\s*([\w]+)\s*=\s*(.*?)\s*$') { $map[$Matches[1]] = $Matches[2] }
        }
    }
    return $map
}

function Write-Text([string]$path, [string]$text) {
    [IO.File]::WriteAllText($path, $text, (New-Object Text.UTF8Encoding $false))
}

function Get-EpochMs { [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }

function Find-PresentMon {
    if ($PresentMon) { return $PresentMon }
    $found = Get-ChildItem (Join-Path $env:USERPROFILE 'dev\_tools') -Recurse -Filter 'PresentMon*.exe' -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $found) { throw 'PresentMon not found under dev\_tools. Pass -PresentMon <path to exe>.' }
    return $found.FullName
}

function Get-GameProcess([datetime]$since) {
    Get-CimInstance Win32_Process -Filter "Name='java.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like '*zombie.gameStates.MainScreenState*' -and $_.CreationDate -ge $since.AddSeconds(-5) } |
        Sort-Object CreationDate | Select-Object -First 1
}

function Test-GameRunning {
    return [bool](Get-CimInstance Win32_Process -Filter "Name='java.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like '*zombie.gameStates.MainScreenState*' })
}

function Start-Game {
    if ($Launch -eq 'steam') {
        if (-not (Get-Process steam -ErrorAction SilentlyContinue)) {
            throw 'Steam is not running. Start Steam first (not as administrator), then run this again.'
        }
        # Steam starts the game itself, so the game runs with normal rights even though this
        # script is elevated.
        Start-Process 'steam://rungameid/108600'
    } else {
        Start-Process -FilePath (Join-Path $GameDir 'ProjectZomboid64.bat') -WorkingDirectory $GameDir -WindowStyle Minimized
    }
}

# Copies the pristine test save over Saves\<mode>\KA-perftest and writes its mod list.
function Restore-TestSave([string]$gameMode, [string[]]$mods) {
    if (-not (Test-Path $PristineSave)) { throw "No test save at $PristineSave. Make one with -Record -FromSave <save>." }
    $target = Join-Path $ZomboidDir "Saves\$gameMode\$TestSaveName"
    New-Item -ItemType Directory -Force -Path $target | Out-Null
    & robocopy $PristineSave $target /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "Copying the test save failed (robocopy exit $LASTEXITCODE)" }
    Write-ModsFile (Join-Path $target 'mods.txt') $mods
}

# ------------------------------------------------------------------------------------------------
# Frame statistics. Same definitions as tools/frame_stats.py: "1% low" is the average FPS over the
# slowest 1% of frames.

function Get-Stats([double[]]$times) {
    if (-not $times -or $times.Count -eq 0) { return $null }
    $sorted = [double[]]$times.Clone()
    [Array]::Sort($sorted)
    $n = $sorted.Count
    $total = 0.0; foreach ($t in $sorted) { $total += $t }
    $lowMean = {
        param($fraction)
        $k = [Math]::Max(1, [int][Math]::Floor($n * $fraction))
        $sum = 0.0; for ($i = $n - $k; $i -lt $n; $i++) { $sum += $sorted[$i] }
        1000.0 / ($sum / $k)
    }
    $pct = { param($p) $sorted[[Math]::Min($n - 1, [int][Math]::Floor($n * $p))] }
    [ordered]@{
        frames    = $n
        seconds   = [Math]::Round($total / 1000.0, 1)
        avg_fps   = [Math]::Round($n / ($total / 1000.0), 1)
        low1_fps  = [Math]::Round((& $lowMean 0.01), 1)
        low01_fps = [Math]::Round((& $lowMean 0.001), 1)
        p99_ms    = [Math]::Round((& $pct 0.99), 2)
        max_ms    = [Math]::Round($sorted[$n - 1], 2)
        over25    = @($sorted | Where-Object { $_ -ge 25 }).Count
        over50    = @($sorted | Where-Object { $_ -ge 50 }).Count
    }
}

# PresentMon CSV -> frame times, minus the first $Skip seconds and anything after $maxSeconds.
function Read-PresentMon([string]$path, [double]$maxSeconds) {
    if (-not (Test-Path $path)) { return @() }
    $times = New-Object System.Collections.Generic.List[double]
    $elapsed = 0.0
    foreach ($row in (Import-Csv $path)) {
        $ms = 0.0
        if (-not [double]::TryParse($row.MsBetweenPresents, [Globalization.NumberStyles]::Float,
                [Globalization.CultureInfo]::InvariantCulture, [ref]$ms) -or $ms -le 0) { continue }
        $elapsed += $ms
        if ($elapsed / 1000.0 -lt $Skip) { continue }
        if ($maxSeconds -gt 0 -and $elapsed / 1000.0 -gt $maxSeconds) { break }
        $times.Add($ms)
    }
    return $times.ToArray()
}

# Knox Ambience frame log rows between two wall-clock times (needs the start_epoch_ms line).
function Read-FrameLog([string]$path, [long]$fromMs, [long]$toMs) {
    $result = @{ times = @(); gc_ms = 0; tags = @{} }
    if (-not $path -or -not (Test-Path $path)) { return $result }
    $first = Get-Content $path -TotalCount 1
    if ($first -notmatch 'start_epoch_ms=(\d+)') { return $result }
    $start = [long]$Matches[1]
    $times = New-Object System.Collections.Generic.List[double]
    $inv = [Globalization.CultureInfo]::InvariantCulture
    foreach ($row in (Get-Content $path | Where-Object { -not $_.StartsWith('#') } | ConvertFrom-Csv)) {
        $at = $start + [double]::Parse($row.t_ms, $inv)
        if ($at -lt $fromMs + $Skip * 1000 -or $at -gt $toMs) { continue }
        $ms = [double]::Parse($row.frame_ms, $inv)
        $times.Add($ms)
        $result.gc_ms += [double]::Parse($row.gc_ms, $inv)
        if ($ms -ge 25 -and $row.tags) {
            foreach ($tag in ($row.tags -split '\|' | Select-Object -Unique)) { $result.tags[$tag] = 1 + [int]$result.tags[$tag] }
        }
    }
    $result.times = $times.ToArray()
    return $result
}

function Format-Stats($s) {
    if (-not $s) { return 'no frames' }
    '{0,7:N1} avg | {1,6:N1} 1% low | {2,6:N1} 0.1% low | p99 {3,6:N2} ms | max {4,6:N1} ms | >=25 ms {5,4} | >=50 ms {6,3}' -f `
        $s.avg_fps, $s.low1_fps, $s.low01_fps, $s.p99_ms, $s.max_ms, $s.over25, $s.over50
}

# ------------------------------------------------------------------------------------------------
# One game session

function Invoke-Session([string]$runLabel, [string[]]$without, [string]$mode) {
    if (Test-GameRunning) { throw 'Project Zomboid is already running. Quit it first: each test needs a fresh game start.' }

    if ($NewGame) {
        $route = @{}
        $gameMode = 'Sandbox'
    } else {
        $route = Read-KeyValues $RouteFile
        $gameMode = $route['gamemode']
        if (-not $gameMode) { throw "No route at $RouteFile. Make one with -Record." }
    }

    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $runDir = Join-Path $RunsDir "$stamp-$runLabel"
    New-Item -ItemType Directory -Force -Path $runDir | Out-Null

    # Mod list: the preset (or -Mods), minus -Without, plus the test mod.
    $base = $(if ($Mods.Count) { $Mods } else { Read-ModList $PresetFile })
    $mods = @($base | Where-Object { $without -notcontains $_ -and $_ -ne $TestModId })
    $mods += $TestModId
    Set-Content (Join-Path $runDir 'mods.txt') $mods

    $defaultMods = Join-Path $ZomboidDir 'mods\default.txt'
    $latestSave = Join-Path $ZomboidDir 'latestSave.ini'
    Copy-Item $defaultMods (Join-Path $runDir 'default.txt.before') -ErrorAction SilentlyContinue
    Copy-Item $latestSave (Join-Path $runDir 'latestSave.ini.before') -ErrorAction SilentlyContinue
    $viewpointProps = Join-Path $ZomboidDir 'viewpoint-live.properties'
    Copy-Item $viewpointProps $runDir -ErrorAction SilentlyContinue

    $info = [ordered]@{
        label = $runLabel; started = (Get-Date).ToString('s'); mode = $mode; mods = $mods; without = $without
        phases = $Phases; walk_seconds = $WalkSeconds; drive_seconds = $DriveSeconds; drive_speed = $DriveSpeed
        settle = $Settle; skip = $Skip; launch = $Launch; result = 'failed'; errors = @(); phase = [ordered]@{}
    }

    $proc = $null
    $pmProcs = @{}
    try {
        # Main-menu mods must match the save's, or the game reloads Lua before loading it.
        Write-ModsFile $defaultMods $mods
        if (-not $NewGame) { Restore-TestSave $gameMode $mods }

        $config = [ordered]@{
            expires = (Get-EpochMs) + 15 * 60 * 1000
            mode = $mode
            save = "$gameMode/$TestSaveName"
            settle = $Settle
            walk_seconds = $(if ($Phases -contains 'walk') { $WalkSeconds } else { 0 })
            drive_seconds = $(if ($Phases -contains 'drive') { $DriveSeconds } else { 0 })
            drive_speed = $DriveSpeed
            walk = $route['walk']
            drive = $route['drive']
        }
        if ($NewGame) {
            $config.newgame = 1
            $config.save = ''
            $config.world = "KA-baseline-$stamp"
            $config.spawn = $Spawn
            $config.map = $Map
            $config.start_hour = $StartHour
            $config.shots = $(if ($Phases -contains 'shots') { $Shots } else { '' })
            $config.shot_prefix = "ka_$runLabel`_"
        }
        if ($mode -eq 'record') { $config.expires = (Get-EpochMs) + 10 * 60 * 1000 }
        Write-Text $ConfigFile ((($config.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join "`r`n") + "`r`n")
        Copy-Item $ConfigFile $runDir
        Remove-Item $StatusFile -ErrorAction SilentlyContinue
        if ($mode -eq 'record') { Remove-Item $RecordingFile -ErrorAction SilentlyContinue }

        $launchTime = Get-Date
        $launchMs = Get-EpochMs
        Write-Host "[$runLabel] starting the game ($Launch)..."
        Start-Game

        $deadline = $launchTime.AddMinutes(3)
        while (-not $proc) {
            if ((Get-Date) -gt $deadline) { throw 'The game did not start within 3 minutes.' }
            Start-Sleep -Milliseconds 500
            $proc = Get-GameProcess $launchTime
        }
        $gamePid = [int]$proc.ProcessId
        Write-Host "[$runLabel] game process $gamePid"

        $pm = Find-PresentMon
        $seen = 0
        $doneAt = $null
        $started = $false
        $limit = $(if ($mode -eq 'record') { $launchTime.AddMinutes(60) } else { $launchTime.AddMinutes(20) })
        while ($true) {
            Start-Sleep -Milliseconds 250
            $alive = Get-Process -Id $gamePid -ErrorAction SilentlyContinue
            $lines = @()
            if (Test-Path $StatusFile) { $lines = @(Get-Content $StatusFile -ErrorAction SilentlyContinue) }
            for (; $seen -lt $lines.Count; $seen++) {
                $line = $lines[$seen]
                if ($line -notmatch '^(\d+) (.*)$') { continue }
                $at = [long]$Matches[1]; $evt = $Matches[2]
                Write-Host "[$runLabel] $evt"
                if ($evt -eq 'game_started') { $started = $true }
                if ($evt -match '^phase_start (\w+) (\d+)') {
                    $phase = $Matches[1]; $secs = [int]$Matches[2]
                    $csv = Join-Path $runDir "pm-$phase.csv"
                    $pmProcs[$phase] = Start-Process -FilePath $pm -WindowStyle Hidden -PassThru -ArgumentList @(
                        '--process_id', $gamePid, '--timed', $secs, '--terminate_after_timed',
                        '--stop_existing_session', '--session_name', "KnoxPerf_$phase", '--output_file', "`"$csv`"")
                    $info.phase[$phase] = [ordered]@{ start_ms = $at; end_ms = $null; pm_started_ms = (Get-EpochMs); note = '' }
                }
                if ($evt -match '^phase_end (\w+)\s*(.*)$') {
                    if ($info.phase.Contains($Matches[1])) {
                        $info.phase[$Matches[1]].end_ms = $at
                        $info.phase[$Matches[1]].note = $Matches[2]
                    }
                }
                if ($evt -like 'error*') { $info.errors += $evt }
                if ($evt -like 'done*') { $doneAt = Get-Date }
            }
            if (-not $alive) { break }
            if (-not $started -and $mode -ne 'record' -and (Get-Date) -gt $launchTime.AddMinutes(8)) {
                $info.errors += 'error: never reached the game (no game_started after 8 minutes). Check console.txt.'
                break
            }
            if ($doneAt -and (Get-Date) -gt $doneAt.AddSeconds(90)) { break }
            if ((Get-Date) -gt $limit) { $info.errors += 'error: run took too long'; break }
        }

        foreach ($p in $pmProcs.Values) { if (-not $p.HasExited) { $p.WaitForExit(15000) | Out-Null } }
        if (Get-Process -Id $gamePid -ErrorAction SilentlyContinue) {
            Write-Host "[$runLabel] the game did not quit by itself; closing it."
            Stop-Process -Id $gamePid -Force
            Start-Sleep -Seconds 3
        }
        if ($info.errors.Count -eq 0 -and $doneAt) { $info.result = 'ok' }
        if ($mode -eq 'record') { $info.result = 'recorded' }

        # Collect logs.
        Copy-Item (Join-Path $ZomboidDir 'console.txt') $runDir -ErrorAction SilentlyContinue
        Copy-Item $StatusFile $runDir -ErrorAction SilentlyContinue
        $shotFiles = @(Get-ChildItem (Join-Path $ZomboidDir 'Screenshots') -Filter 'ka_*' -ErrorAction SilentlyContinue |
            Where-Object { $_.LastWriteTime -ge $launchTime })
        if ($shotFiles) {
            $shotDir = Join-Path $runDir 'shots'
            New-Item -ItemType Directory -Force -Path $shotDir | Out-Null
            foreach ($f in $shotFiles) { Copy-Item $f.FullName $shotDir }
            $info.shots = $shotFiles.Count
        }
        $frameLogs = @(Get-ChildItem (Join-Path $ZomboidDir 'Logs') -Filter 'knoxambience-frames-*.csv' -ErrorAction SilentlyContinue |
            Where-Object { $_.LastWriteTime -ge $launchTime })
        foreach ($f in $frameLogs) { Copy-Item $f.FullName $runDir }
        Get-ChildItem $MeasureDir -Filter 'gc-*.log*' -ErrorAction SilentlyContinue |
            Where-Object { $_.LastWriteTime -ge $launchTime } | ForEach-Object { Copy-Item $_.FullName $runDir }

        $console = Join-Path $runDir 'console.txt'
        if (Test-Path $console) {
            $info.knoxambience = @(Select-String -Path $console -Pattern '\[KnoxAmbience\] (loaded|patch active)' |
                ForEach-Object { $_.Line.Trim() } | Select-Object -Unique)
            $commit = Select-String -Path $console -Pattern "of the system's commit left" | Select-Object -Last 1
            if ($commit) { $info.commit_warning = $commit.Line.Trim() }
        }

        if ($mode -ne 'record') {
            $frameLog = $(if ($frameLogs) { Join-Path $runDir ($frameLogs | Sort-Object LastWriteTime | Select-Object -Last 1).Name } else { $null })
            foreach ($phase in @($info.phase.Keys)) {
                $ph = $info.phase[$phase]
                $length = $(if ($ph.end_ms) { ($ph.end_ms - $ph.start_ms) / 1000.0 } else { 0 })
                $ph.presentmon = Get-Stats (Read-PresentMon (Join-Path $runDir "pm-$phase.csv") $length)
                if ($frameLog -and $ph.end_ms) {
                    $fl = Read-FrameLog $frameLog $ph.start_ms $ph.end_ms
                    $ph.framelog = Get-Stats $fl.times
                    $ph.gc_ms = $fl.gc_ms
                    $ph.slow_frame_tags = $fl.tags
                }
            }
        }
    } catch {
        $info.errors += "error: $($_.Exception.Message)"
        Write-Host "[$runLabel] $($_.Exception.Message)" -ForegroundColor Red
        if ($proc -and (Get-Process -Id $proc.ProcessId -ErrorAction SilentlyContinue)) { Stop-Process -Id $proc.ProcessId -Force }
    } finally {
        # Put the player's own setup back.
        Remove-Item $ConfigFile -ErrorAction SilentlyContinue
        $backup = Join-Path $runDir 'default.txt.before'
        if (Test-Path $backup) { Copy-Item $backup $defaultMods -Force }
        $backup = Join-Path $runDir 'latestSave.ini.before'
        if (Test-Path $backup) { Copy-Item $backup $latestSave -Force }
        $info.finished = (Get-Date).ToString('s')
        $info | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $runDir 'summary.json')
    }

    Write-Summary $info $runDir
    return [pscustomobject]@{ dir = $runDir; info = $info }
}

function Write-Summary($info, [string]$runDir) {
    $out = @()
    $out += "Run $($info.label)  [$($info.result)]  $($info.started)"
    $out += "Mods: $($info.mods -join ', ')"
    foreach ($phase in @($info.phase.Keys)) {
        $ph = $info.phase[$phase]
        $out += ''
        $out += "$phase  $($ph.note)"
        $out += "  PresentMon: $(Format-Stats $ph.presentmon)"
        if ($ph.Contains('framelog') -and $ph.framelog) {
            $out += "  Frame log:  $(Format-Stats $ph.framelog)  | GC $([Math]::Round($ph.gc_ms)) ms"
            if ($ph.slow_frame_tags.Count -gt 0) {
                $tags = ($ph.slow_frame_tags.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 6 |
                    ForEach-Object { "$($_.Key) x$($_.Value)" }) -join ', '
                $out += "  Tags on frames >= 25 ms: $tags"
            }
        }
    }
    if ($info.Contains('knoxambience') -and $info.knoxambience) { $out += ''; $out += ($info.knoxambience | ForEach-Object { "  $_" }) }
    if ($info.Contains('shots')) { $out += "  Screenshots: $($info.shots) in $(Join-Path $runDir 'shots')" }
    if ($info.Contains('commit_warning')) { $out += "  Memory: $($info.commit_warning)" }
    foreach ($e in $info.errors) { $out += "  $e" }
    $out += "Files: $runDir"
    $out | Set-Content (Join-Path $runDir 'summary.txt')
    Write-Host ''
    $out | ForEach-Object { Write-Host $_ }
}

# Medians per variant and phase, and the change from the first variant to the second.
function Write-Comparison($groups, [string]$path) {
    $metrics = @('avg_fps', 'low1_fps', 'low01_fps', 'p99_ms', 'max_ms', 'over25', 'over50')
    $names = @($groups.Keys)
    $out = @("Comparison (median of each variant's runs, PresentMon)", '')
    foreach ($phase in @($Phases | Where-Object { $_ -ne 'shots' })) {
        $out += $phase
        $out += ('  {0,-10}' -f 'metric') + (($names | ForEach-Object { '{0,14}' -f $_ }) -join '') + '    change'
        foreach ($m in $metrics) {
            $vals = @()
            foreach ($name in $names) {
                $xs = @($groups[$name] | ForEach-Object {
                        if ($_.info.phase.Contains($phase) -and $_.info.phase[$phase].presentmon) { [double]$_.info.phase[$phase].presentmon[$m] } } |
                    Sort-Object)
                $vals += $(if ($xs.Count) { $xs[[int][Math]::Floor(($xs.Count - 1) / 2)] } else { [double]::NaN })
            }
            $change = ''
            if ($vals.Count -eq 2 -and $vals[0] -ne 0 -and -not [double]::IsNaN($vals[0]) -and -not [double]::IsNaN($vals[1])) {
                $change = '{0,8:+0.0;-0.0}%' -f (100.0 * ($vals[1] - $vals[0]) / $vals[0])
            }
            $out += ('  {0,-10}' -f $m) + (($vals | ForEach-Object { '{0,14:N2}' -f $_ }) -join '') + "  $change"
        }
        $out += ''
    }
    $out += 'Runs:'
    foreach ($name in $names) { foreach ($r in $groups[$name]) { $out += "  $name  [$($r.info.result)]  $($r.dir)" } }
    if ($path) { $out | Set-Content $path }
    $out | ForEach-Object { Write-Host $_ }
}

# ------------------------------------------------------------------------------------------------
# Main

if ($PSCmdlet.ParameterSetName -eq 'Compare') {
    $groups = [ordered]@{}
    foreach ($name in $Compare) {
        $dir = $(if (Test-Path $name) { $name } else { Join-Path $RunsDir $name })
        $json = Get-Content (Join-Path $dir 'summary.json') -Raw | ConvertFrom-Json
        # Back to the ordered-dictionary shape that Write-Comparison reads.
        $phase = [ordered]@{}
        foreach ($p in $json.phase.PSObject.Properties) {
            $pm = $null
            if ($p.Value.presentmon) { $pm = @{}; foreach ($q in $p.Value.presentmon.PSObject.Properties) { $pm[$q.Name] = $q.Value } }
            $phase[$p.Name] = [ordered]@{ presentmon = $pm }
        }
        $groups[(Split-Path $dir -Leaf)] = @([pscustomobject]@{ dir = $dir; info = @{ result = $json.result; phase = $phase } })
    }
    Write-Comparison $groups $null
    exit 0
}

if (-not (Test-Admin)) { Restart-Elevated $PSBoundParameters }
New-Item -ItemType Directory -Force -Path $RunsDir, $PerfDir | Out-Null

if ($PSCmdlet.ParameterSetName -eq 'Record') {
    if ($FromSave) {
        $source = Join-Path $ZomboidDir "Saves\$FromSave"
        if (-not (Test-Path (Join-Path $source 'map_t.bin'))) { throw "Not a save folder: $source" }
        $gameMode = Split-Path (Split-Path $source -Parent) -Leaf
        Write-Host "Copying $FromSave as the test save..."
        New-Item -ItemType Directory -Force -Path $PristineSave | Out-Null
        & robocopy $source $PristineSave /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
        if ($LASTEXITCODE -ge 8) { throw "Copying the save failed (robocopy exit $LASTEXITCODE)" }
        if (-not (Test-Path $PresetFile)) {
            # First time: use the save's own mod list as the perf base preset.
            $saveMods = @(Get-Content (Join-Path $source 'mods.txt') | Where-Object { $_ -match '^\s*mod\s*=\s*(.+?),?\s*$' } |
                ForEach-Object { ($_ -replace '^\s*mod\s*=\s*', '').TrimEnd(',', ' ') })
            Set-Content $PresetFile (@("# Perf base mod preset, one mod id per line. Made from $FromSave on $(Get-Date -Format s).") + $saveMods)
            Write-Host "Wrote $PresetFile from the save's mod list."
        }
        Write-Text $RouteFile "gamemode=$gameMode`r`n"
    }
    Write-Host ''
    Write-Host 'The game will load the test save. Then, once:'
    Write-Host '  1. Walk your loop on foot (about 2 minutes) and end next to the car.'
    Write-Host '  2. Get in the driver''s seat and drive your road (2+ minutes at a steady speed).'
    Write-Host '  3. Quit the game. The route is saved when the game closes.'
    $result = Invoke-Session 'record' @() 'record'
    if (-not (Test-Path $RecordingFile)) { throw "Nothing was recorded ($RecordingFile is missing)." }
    $walk = @(); $drive = @()
    foreach ($line in Get-Content $RecordingFile) {
        if ($line -match '^walk (.+)$') { $walk += $Matches[1] }
        if ($line -match '^drive (.+)$') { $drive += $Matches[1] }
    }
    $route = Read-KeyValues $RouteFile
    $route['walk'] = $walk -join ';'
    $route['drive'] = $drive -join ';'
    Write-Text $RouteFile ((($route.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join "`r`n") + "`r`n")
    Copy-Item $RecordingFile $result.dir
    $length = {
        param($pts)
        $sum = 0.0
        for ($i = 1; $i -lt $pts.Count; $i++) {
            $a = $pts[$i - 1] -split ','; $b = $pts[$i] -split ','
            $sum += [Math]::Sqrt([Math]::Pow([double]$a[0] - [double]$b[0], 2) + [Math]::Pow([double]$a[1] - [double]$b[1], 2))
        }
        $sum
    }
    $walkLen = & $length $walk
    $driveLen = & $length $drive
    Write-Host ''
    Write-Host ("Route saved to {0}: walk {1} points ({2:N0} tiles), drive {3} points ({4:N0} tiles)." -f $RouteFile, $walk.Count, $walkLen, $drive.Count, $driveLen)
    $driveTime = $driveLen / ($DriveSpeed / 3.6)
    if ($drive.Count -ge 2 -and $driveTime -lt $DriveSeconds) {
        Write-Host ("The drive takes about {0:N0} s at {1} km/h, less than -DriveSeconds {2}. Record a longer road, or pass a shorter -DriveSeconds." -f $driveTime, $DriveSpeed, $DriveSeconds) -ForegroundColor Yellow
    }
    exit 0
}

$runs = @()
if ($AB) {
    $groups = [ordered]@{ off = @(); on = @() }
    for ($i = 1; $i -le $Repeat; $i++) {
        $groups['off'] += Invoke-Session "$Label-off$i" $Toggle 'run'
        $groups['on'] += Invoke-Session "$Label-on$i" @() 'run'
    }
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    Write-Host ''
    Write-Comparison $groups (Join-Path $RunsDir "$stamp-$Label-ab.txt")
} else {
    for ($i = 1; $i -le $Repeat; $i++) {
        $name = $(if ($Repeat -gt 1) { "$Label$i" } else { $Label })
        $runs += Invoke-Session $name $Without 'run'
    }
}
