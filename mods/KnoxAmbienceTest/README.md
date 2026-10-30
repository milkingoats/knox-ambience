# Knox Ambience Test Mode (developer tool)

Plays a recorded walk and drive by itself so perf tests need no hand play. Started by
`tools/perftest/perf-test.ps1`; see [../../docs/perf-test.md](../../docs/perf-test.md).

Without the test config that script writes (`Zomboid/Lua/knoxambience_autotest.txt`, which expires after
15 minutes), the mod does nothing, so it is safe to leave enabled. It is not part of the player modpack.

| File | What |
|------|------|
| `42/media/lua/client/KnoxAutoTest.lua` | Loads the test save, walks the route, gets in the car, records routes |
| `java/src/knoxautotest/AutoDrive.java` | Autopilot: steering, throttle and brake toward the next waypoint |
| `java/src/knoxautotest/Patch_CarController_updateControls.java` | Hands the car's controls to AutoDrive |
| `java/src/knoxautotest/Patch_Mouse_isButtonDown.java` (+ `Patch_GameLoadingState_*`) | Answers "click to start" during a test load only |

The jar is built by the Knox Ambience Gradle project (`gradlew install` builds both mods).
