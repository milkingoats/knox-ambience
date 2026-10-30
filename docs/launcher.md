# Launcher settings

## Java memory: G1 with a 4 GB heap

With stock memory settings, Viewpoint sessions stalled on garbage collection 25–94 times per run
(PZ_Optimization's measurements). Switching to G1 with a fixed 4 GB heap removes most of those stalls.

On Windows, edit `ProjectZomboid64.json` in the game folder
(`Steam\steamapps\common\ProjectZomboid`). Back it up first. In the `vmArgs` list:

- replace the existing `-Xmx...` entry with `-Xmx4g`
- add `-Xms4g` so the heap doesn't grow and shrink mid-game
- add `-XX:+UseG1GC` if no other `-XX:+Use...GC` flag is present (remove any other collector flag)
- optionally add `-XX:MaxGCPauseMillis=8` to bias G1 towards short pauses

Steam updates can overwrite this file, so re-check it after a game update.

> Not yet verified on Build 42.21. Measure before and after (frame-time capture while walking and
> driving) and record the numbers here.

## ZombieBuddy

ZombieBuddy runs as a Java agent. Use its Windows installer, or add `-javaagent:ZombieBuddy.jar --` to
the launch options. See the [ZombieBuddy installation guide](https://github.com/zed-0xff/ZombieBuddy/blob/master/doc/Installation.md).
