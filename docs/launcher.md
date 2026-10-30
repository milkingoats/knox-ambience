# Launcher settings

## Java memory

**Current advice: raise the heap to 4 GB only.** Keep the stock garbage collector until we have
measured.

What the game does today (42.21, read from `ProjectZomboid64.json` on 2026-10-30):

- The base `vmArgs` set `-Xmx3072m` (3 GB heap).
- On Windows 10 1803 (`10.0.17134`) and newer, including Windows 11, the game adds `-XX:+UseZGC`.
  Only Windows 7 (`6.1`) gets `-XX:+UseG1GC`.

So the stock collector on a current PC is already ZGC, not the old default. The PZ_Optimization
numbers below may come from a different setup. The G1 advice is **unverified** until we compare ZGC
with G1 on 42.21 ourselves.

To raise the heap: in the `vmArgs` list, replace `-Xmx3072m` with `-Xmx4g`. Back up the file first.

### Not yet verified: G1 with a 4 GB heap

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
