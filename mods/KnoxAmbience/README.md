# Knox Ambience (Java mod)

A ZombieBuddy Java mod with small, targeted patches for smoother frame times under Project Viewpoint.
See [../../docs/PLAN.md](../../docs/PLAN.md) for what we patch, what we avoid, and why.

## Build

Needs JDK 25, the game's `projectzomboid.jar` and `ZombieBuddy.jar`. Gradle is not needed: the
wrapper (`gradlew`) downloads Gradle 9.8.2 on first use and checks its SHA-256.

```
cd java
gradlew install -PpzJar=/path/to/projectzomboid.jar -PzbJar=/path/to/ZombieBuddy.jar
```

On Windows, if Java 25 is not your default `java`, set `JAVA_HOME` to the JDK 25 folder first.

- `pzJar`: `Steam/steamapps/common/ProjectZomboid/projectzomboid.jar`
- `zbJar`: `Steam/steamapps/workshop/content/108600/3619862853/mods/ZombieBuddy/libs/ZombieBuddy.jar`

`install` builds the jar and copies it to `42/media/java/`. It also builds the perf-test mode jar into
`../KnoxAmbienceTest/42/media/java/` (see [../../docs/perf-test.md](../../docs/perf-test.md)). Then link or copy this folder
(`mods/KnoxAmbience`) into `Zomboid/mods/` and enable it with ZombieBuddy and Viewpoint.

Built against ZombieBuddy 2.3.4, the current Workshop release. ZombieBuddy 3.0 moves the
annotations to another package, so `mod.info` limits the jar to ZombieBuddy 2.x.

## Patches

| Patch | Hooks | How | Status |
|-------|-------|-----|--------|
| (a) Wake the chunk streamer as soon as a chunk is requested | `WorldStreamer.threadLoop`, `WorldStreamer.addJob` | CallSwap: `Thread.sleep(ms)` → wait of at most `ms` that `addJob` (OnExit advice) ends early | to test in game |
| (b) At most one hot save per 30 s | `ChunkSaveWorker.HotsaveAncilliarySystems`, `ChunkSaveWorker.Update` | OnEnter skipOn advice delays the save; OnExit advice on `Update` runs the delayed save once it is due | to test in game |
| (c) House alarm update every 250 ms, not every frame | `AmbientStreamManager.update`, `Alarm.update` | OnEnter advice sets a 250 ms tick; OnEnter skipOn advice skips `Alarm.update` between ticks | to test in game |
| (c) Drop the alarm's debug print | `Alarm.updateSound` | CallSwap: `PrintStream.println(int)` → no-op | to test in game |

Each patch has a switch in `Main` (`streamerWake`, `hotsaveThrottle`, `alarmThrottle`,
`alarmQuietLog`). Set a switch to `false` to get the stock behaviour back.

### What to look for in `Zomboid/console.txt`

- On load: `[KnoxAmbience] loaded. call swaps: streamer wake=applied, alarm println=applied ...`
- On first use, one line for each patch: `[KnoxAmbience] patch active: <name>`.
  - The hot save and streamer lines appear in the first minute of play.
  - The alarm line appears only when a house alarm goes off.
- If a line says `NOT applied`, `skipped` or `disabled`, that patch runs the stock code. The rest of
  the mod still works.

### Known issues (game bugs, not fixed yet)

- `Alarm` keeps its FMOD event instance in a static field, so all alarms share one sound. When two
  alarms are active, they move the same sound back and forth. The first alarm to end stops the sound
  for all of them. A real fix needs a sound instance for each alarm and is out of scope for these
  patches.

## Foundations

- **CallSwap** (`CallSwap.java`): replaces one method call inside one game method with a call to a
  static method of ours, through ByteBuddy `MemberSubstitution` and ZombieBuddy's Instrumentation.
  Use it when advice is not enough, because the change is in the middle of a method. Used by (a) and
  (c). Limit: it reads a package-private ZombieBuddy field (`Loader.g_instrumentation`). If a
  ZombieBuddy update renames that field, CallSwap logs it and the game keeps its stock code.
- **Advice visibility rule**: ZombieBuddy copies advice code into the game class. Any field or method
  that an advice body touches must be `public`, or the game throws `IllegalAccessError` at run time.

## Frame log (debug)

`FrameLog` writes per-frame timings to CSV when the game runs with `-Dknoxambience.framelog=true`.
Patches call `FrameLog.mark("Tag")` when they do something expensive so slow frames can be traced.
See [../../docs/measuring.md](../../docs/measuring.md).

## Rules

One patch class per file, named `Patch_<GameClass>_<method>`. Never patch code that Viewpoint
patches (line of sight, culling/LOD, light prefetch, vsync/frame pacing). Never copy code from
PZ_Optimization or decompiled game code.
