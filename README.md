# Knox Ambience

An immersion modpack for Project Zomboid Build 42, built around
[Project Viewpoint](https://steamcommunity.com/workshop/filedetails/?id=3809306528) (first/third-person
renderer) and [ZombieBuddy](https://github.com/zed-0xff/ZombieBuddy) (Java mod loader).

This repo holds our own work:

| Path | What |
|------|------|
| `mods/KnoxAmbience/` | Performance mod: small ZombieBuddy method patches aimed at smoother frames under Viewpoint |
| `shaderpacks/KnoxAmbience/` | Original native Viewpoint shader pack (built on Viewpoint's Default): natural grade, fog, nights, glow. The Java mod installs it at startup |
| `mods/KnoxAmbienceTest/` | Developer test mode: plays a recorded walk and drive by itself for perf tests |
| `tools/` | Frame-time stats and the one-command perf test ([docs/perf-test.md](docs/perf-test.md)) |
| `docs/` | Plan, launcher settings, mod list, measuring, perf test |

Viewpoint is proprietary: we depend on it as a normal Workshop item and never bundle or modify it.
Everything in this repo is our own code under the MIT licence.

Start with [docs/PLAN.md](docs/PLAN.md).

## Status

Runs in game on Build 42.21 with ZombieBuddy 2.3.4.

- Java mod: the chunk-streamer wake and hot-save limit are confirmed in game and measured (walking
  1% low 58 to 77 fps, worst spike 147 to 21 ms). The house-alarm patches still need a test.
- Shader pack: works in game; the look is still being tuned.

Install and build steps are in [mods/KnoxAmbience/README.md](mods/KnoxAmbience/README.md).
