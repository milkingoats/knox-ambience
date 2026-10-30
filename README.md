# Knox Ambience

An immersion modpack for Project Zomboid Build 42, built around
[Project Viewpoint](https://steamcommunity.com/workshop/filedetails/?id=3809306528) (first/third-person
renderer) and [ZombieBuddy](https://github.com/zed-0xff/ZombieBuddy) (Java mod loader).

This repo holds our own work:

| Path | What |
|------|------|
| `mods/KnoxAmbience/` | Performance mod: small ZombieBuddy method patches aimed at smoother frames under Viewpoint |
| `shaderpacks/KnoxAmbience/` | Original Iris-format shader pack for Viewpoint: overcast light, fog, dark nights, muted grading |
| `mods/KnoxAmbienceTest/` | Developer test mode: plays a recorded walk and drive by itself for perf tests |
| `tools/` | Frame-time stats and the one-command perf test ([docs/perf-test.md](docs/perf-test.md)) |
| `docs/` | Plan, launcher settings, mod list, measuring |

Viewpoint is proprietary: we depend on it as a normal Workshop item and never bundle or modify it.
Everything in this repo is our own code under the MIT licence.

Start with [docs/PLAN.md](docs/PLAN.md).

## Status

Skeletons only. Nothing here has been built or run in game yet.
