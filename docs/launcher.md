# Launcher settings

## Java memory

**Advice: raise the heap to 6 GB and keep the stock collector (ZGC),** as long as Windows has commit
headroom for it (see below). Measured on 42.21 below.

What the game does today (42.21, checked 2026-10-30):

- The heap is `-Xmx3072m` (3 GB). The collector is ZGC on Windows 10 1803 and newer, G1 only on
  Windows 7.
- With ZombieBuddy installed, the game starts through `ProjectZomboid64.bat` in the game folder
  (Steam launch options point at it), not through `ProjectZomboid64.json`. **Edit the `.bat`**: the
  json is ignored. The `.bat` has two `java.exe` lines (the second is a fallback); change both.

To raise the heap: back up `ProjectZomboid64.bat`, then replace `-Xmx3072m` with `-Xmx6g` on both
lines. A ZombieBuddy reinstall or update may rewrite the `.bat`, so re-check it afterwards.

### Measurement (2026-10-30)

Same save and road, 2 minutes driving each, debug mode off, KnoxAmbience on, fresh game start for
each run, PresentMon capture (first 5 s skipped). RTX 4070 Ti, i7-13700KF, 32 GB RAM.

| | 3 GB | 6 GB |
|---|---|---|
| Average | 131.6 fps | 135.6 fps |
| 1% low | 43.7 fps | 52.6 fps |
| 0.1% low | 33.5 fps | 38.6 fps |
| p99 frame time | 18.6 ms | 14.6 ms |
| Worst frame | 46.6 ms | 32.3 ms |
| GC cycles in the session | 484 | 154 |

At 3 GB the heap was 92–94% full before each collection and 76–83% after, so ZGC ran almost
continuously alongside Viewpoint's threads. At 6 GB it drops to about 45% after each collection. One
run each, so treat small differences as noise; the 1% low and p99 changes are well beyond it.

### Check the system's commit headroom

The heap is only part of the game's memory. With Viewpoint and a large mod list, the game process
committed about 15 GB with a 6 GB heap: the rest is uncompressed textures (7.5 GB reported by
Viewpoint, more with texture-heavy mods), Viewpoint's caches and its 2 GB mesh arena. Windows limits
committed memory to RAM plus page file, not RAM alone. In that session Viewpoint logged as little
as 1.2 GB of the system's commit left (`process memory jumped ... of the system's commit left` in
`console.txt`), and a 0.7 s freeze, video-memory evictions and missing world rendering followed.

Before raising the heap, or after adding many mods:

- Look for that `console.txt` line. Keep at least 3–4 GB of commit left while playing.
- Let Windows manage the page file size (System > Advanced system settings > Performance >
  Advanced > Virtual memory), or set it to 16 GB or more. This raises the commit limit without
  using RAM.
- If it is still tight, use `-Xmx5g`, close browsers and other large apps, or lower the game's
  texture settings (texture compression also frees video memory).

G1 (PZ_Optimization's suggestion) has not been compared with ZGC on 42.21. ZGC pauses were under
0.1 ms in every run, so there is little reason to switch.

## ZombieBuddy

ZombieBuddy runs as a Java agent. Use its Windows installer, or add `-javaagent:ZombieBuddy.jar --` to
the launch options. See the [ZombieBuddy installation guide](https://github.com/zed-0xff/ZombieBuddy/blob/master/doc/Installation.md).
