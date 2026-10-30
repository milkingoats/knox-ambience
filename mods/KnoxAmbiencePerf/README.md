# Knox Ambience Perf

A ZombieBuddy Java mod with small, targeted patches for smoother frame times under Project Viewpoint.
See [../../docs/PLAN.md](../../docs/PLAN.md) for what we patch, what we avoid, and why.

## Build

Needs JDK 25, Gradle, the game's `projectzomboid.jar` and `ZombieBuddy.jar`.

```
cd java
gradle install -PpzJar=/path/to/projectzomboid.jar -PzbJar=/path/to/ZombieBuddy.jar
```

`install` builds the jar and copies it to `42/media/java/`. Then link or copy this folder
(`mods/KnoxAmbiencePerf`) into `Zomboid/mods/` and enable it with ZombieBuddy and Viewpoint.

## Patches

None yet. Planned first patches:

| Patch | Target | Status |
|-------|--------|--------|
| Wake the chunk streamer as soon as a chunk is requested | chunk loader thread | to do |
| Limit autosave frequency | world save | to do |
| Fix the house-alarm sound check | alarm sound update | to do |

Rules: one patch class per file, named `Patch_<GameClass>_<method>`; never patch code that Viewpoint
patches (line of sight, culling/LOD, light prefetch, vsync/frame pacing); never copy code from
PZ_Optimization or decompiled game code.
