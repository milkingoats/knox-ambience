# One-command perf test

`tools/perftest/perf-test.ps1` runs a whole measurement with no hand play:

1. Sets the game's mod list to the **perf base** preset (minus any mods you switch off for this run),
   plus the test mode mod.
2. Copies the **test save** over `Saves\<mode>\KA-perftest`, so every run starts from the same state
   (same time of day, weather, zombies).
3. Starts the game. The test mode mod (`mods/KnoxAmbienceTest`) loads the save and skips the
   "click to start" prompt.
4. Waits 20 s, then **walks** the recorded loop for 120 s and **drives** the recorded road for 120 s.
   The player is invisible to zombies and can't be hurt. The car steers itself along the waypoints at a
   steady 60 km/h.
5. Records each part with PresentMon (game process only), then quits the game.
6. Collects `console.txt`, the Knox Ambience frame log, GC logs, the Viewpoint settings and the mod list,
   and prints average FPS, 1% and 0.1% lows, p99, worst frame and spike counts for each part.
7. Puts your own mod list and "Continue" save back.

Every run is a fresh game start, so ZombieBuddy patches from one run can't leak into the next.

## Baseline on a fresh world (no save, no recording)

`tools/perftest/baseline.bat` needs no test save and no recorded route. Each session starts a new
sandbox world with the player at `-Spawn` (default `10620,9550,0`, Muldraugh), then:

1. takes screenshots at fixed times and weather (`-Shots`, default noon, afternoon, golden hour, sunset,
   dusk, night, rain and fog), with the UI hidden;
2. walks a 14-tile loop next to the spawn for 120 s (measured);
3. spawns a fuelled car on the nearest road and drives along that road for 120 s (measured). The
   route is worked out from the road tiles as the car goes, straight on at junctions, turning back once
   at a dead end.

It runs two sessions, Knox Ambience off then on, with only ZombieBuddy and the test mod otherwise, and
writes the usual results plus a `shots` folder per run. The worlds are saved as
`Saves\Sandbox\KA-baseline-<time>`; delete them when done. Pass `-Spawn x,y,z` for another spot, or
`-Mods` for another mod list.

## One-time setup

1. **Install the test mode mod.** Build it with Knox Ambience (`gradlew install`, see
   `mods/KnoxAmbience/README.md`; this builds both jars). Then copy or link `mods/KnoxAmbienceTest`
   into `Zomboid\mods\`, next to `KnoxAmbience`. On its first start, ZombieBuddy asks you to approve the
   new jar: start the game once by hand, approve it, and quit.
2. **Pick the test save.** Any save with a car that has its key (in the ignition or in your inventory),
   parked near the start of a road you can drive for 2+ minutes. Stand next to the car and save.
   Turn shaders and new mods off unless they are what you are testing.
3. **Record the route** (game must be closed):

   ```
   tools\perftest\perf-test.bat -Record -FromSave Outbreak\2026-10-30_16-02-45
   ```

   This copies the save to `dev\_perf\testsave`, writes `dev\_perf\perf-base.txt` from the save's mod
   list (first time only), and starts the game on the copy. Then:
   - walk your loop for about 2 minutes and **end next to the car** (the walk is replayed back and
     forth, then the test walks to its end and gets in the car);
   - get in the driver's seat and drive your road, steadily, for 2+ minutes;
   - quit the game.

   The route is saved to `dev\_perf\route.txt` (a walk point every 5 tiles, a drive point every 15).
   The script warns if the road is too short for the drive time. To re-record on the same test save,
   leave out `-FromSave`.

`perf-base.txt` is one mod id per line. Edit it when the base mod list changes, then re-record the
baseline.

## Running tests

Double-click `tools\perftest\perf-test.bat`, or from a terminal:

| Command | What it does |
|---|---|
| `perf-test.bat -Label after` | One run with the perf base preset |
| `perf-test.bat -Label before -Without KnoxAmbience` | One run with Knox Ambience off |
| `perf-ab.bat` | Before/after set: off, on, off, on (`-Repeat 2`), then medians and the change |
| `perf-test.bat -AB -Repeat 3 -Toggle KnoxAmbience` | Same with three pairs |
| `perf-test.bat -Phases drive` | Drive only |
| `perf-test.bat -Compare 20261030-190000-before,20261030-190800-after` | Compare two finished runs |

The script asks for administrator rights once (PresentMon needs them) and continues in a new window.
The game itself starts through Steam with normal rights, using your Steam launch options (the
ZombieBuddy `.bat`). Steam must be running. `-Launch bat` starts `ProjectZomboid64.bat` directly
instead.

Other options: `-WalkSeconds`, `-DriveSeconds`, `-DriveSpeed` (km/h), `-Settle` (seconds before the
walk), `-Skip` (seconds ignored at the start of each capture, default 3), `-PresentMon <exe>`.
Paths default to Mattias's layout (`%USERPROFILE%\Zomboid`, `dev\_perf`, `dev\_measure`, `dev\_tools`)
and can be changed with `-ZomboidDir`, `-GameDir`, `-PerfDir`, `-MeasureDir`.

Leave the PC alone during a run: don't alt-tab or use other heavy apps. A run takes about 6 minutes,
mostly loading.

## Results

Each run gets `dev\_measure\runs\<time>-<label>\`:

- `summary.txt`: the numbers, the Knox Ambience patch lines from `console.txt`, any Viewpoint
  "commit left" memory warning, and errors.
- `summary.json`: the same, for `-Compare`.
- `pm-walk.csv`, `pm-drive.csv`: PresentMon captures. They also work with `tools/frame_stats.py`.
- `knoxambience-frames-*.csv`: the frame log (only when Knox Ambience is on). The summary lists which
  tags show up on frames of 25 ms or more in each part.
- `console.txt`, `gc-*.log`, `viewpoint-live.properties`, `mods.txt`, the test config and its status log.

A/B sets also write `runs\<time>-<label>-ab.txt` with the comparison.

## When something goes wrong

The status log (`knoxambience_autotest_status.txt` in the run folder) shows how far the run got.

- **The game sits at the main menu.** The test mod isn't loaded: check it is in `Zomboid\mods` and
  approved in ZombieBuddy.
- **"autopilot did not start".** `KnoxAmbienceTest.jar` isn't loaded (Lua half only). Rebuild with
  `gradlew install` and approve the jar.
- **"could not get into a car" / "engine would not start".** The walk must end within 12 tiles of the
  car, and the car needs its key and fuel.
- **"stuck N" in the drive line.** The car hit something and backed up N times. Re-record the road with
  smoother corners or lower `-DriveSpeed`. A run with `stuck` > 0 is less comparable.
- **"route_finished" in the drive line.** The road ended before the drive time; the capture is cut at
  that point. Record a longer road.

If the script is stopped half way, it may leave `Zomboid\Lua\knoxambience_autotest.txt` behind. That
file expires after 15 minutes, so a normal game start is never taken over, but you can delete it.
Your `mods\default.txt` is backed up in the run folder as `default.txt.before`.

## How it works

- `mods/KnoxAmbienceTest/42/media/lua/client/KnoxAutoTest.lua` reads the test config the script writes
  to `Zomboid\Lua`, loads the save from the main menu, runs the walk with the game's own walk-to action,
  gets in the car, starts it, and switches the autopilot on. It writes each step with a timestamp to the
  status log, which the script follows to start PresentMon for each part. In record mode it writes the
  player's path instead.
- The Java half (ZombieBuddy patches) answers the "click to start" prompt during a test load only, and
  `AutoDrive` sets the car's steering, throttle and brake each frame toward the next waypoint
  (`CarController.updateControls`). It does nothing unless the test config is present and not expired.
- The test mod is loaded in both "before" and "after" runs, so it doesn't bias the comparison.

Viewpoint's own debug keys complement this: **Record a camera trace** writes the camera path of a run to
`Zomboid\viewpoint-camera-traces\` (handy to check two runs followed the same path), and
**Next effect off** turns renderer effects off one at a time for per-effect cost checks.
