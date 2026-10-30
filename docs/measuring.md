# Measuring frame times

How we measure whether a patch helps: the same route, before and after, compared on average FPS,
1% and 0.1% lows, and spikes. Three sources, all optional and off for normal players.

## 1. PresentMon (what the screen shows)

[PresentMon](https://github.com/GameTechDev/PresentMon) records the time between presented frames.
Use the console build (`PresentMon-<version>-x64.exe`), run from an admin terminal while in game:

```
PresentMon-<version>-x64.exe --process_name ProjectZomboid64.exe --timed 120 --terminate_after_timed --output_file C:\Users\<you>\Zomboid\Logs\pm-before.csv
```

If nothing is captured, the game process may be named differently; check Task Manager and pass that
name. [CapFrameX](https://www.capframex.com/) uses the same capture engine and has graphs and
side-by-side comparisons if you prefer a GUI.

## 2. GC log (garbage-collection pauses)

With ZombieBuddy the game starts through `ProjectZomboid64.bat` in the game folder, and the json's
`vmArgs` are ignored (see [launcher.md](launcher.md)). Back up the `.bat`, then add this flag next to
`-Xmx` on both `java.exe` lines. Keep the heap and GC flags the same across runs so they stay
comparable. In a `.bat`, `%` must be written `%%`:

```
-Xlog:gc*:file=C:/Users/<you>/Zomboid/Logs/gc-%%t.log:time,uptime,level,tags:filecount=5,filesize=20m
```

**The folder must already exist**, or the JVM refuses to start ("Invalid -Xlog option") and the game
won't launch. Each pause is logged with its length, so a spike can be matched to a GC pause by time.
It works with any collector (the launcher's default is ZGC; Viewpoint's launcher may pick another).

## 3. KnoxAmbience frame log (why a frame was slow)

Add `-Dknoxambience.framelog=true` to both `java.exe` lines in `ProjectZomboid64.bat`. The mod then writes
`Zomboid/Logs/knoxambience-frames-<time>.csv`, one row per frame: frame time, GC count and time during
the frame, and tags that patches mark. Patches report with `FrameLog.mark("<tag>")`; it does nothing
when the log is off. Current tags: `stream.request`, `stream.wake`, `save.hotsave`,
`save.hotsave.deferred`, `save.chunk`. Set
`-Dknoxambience.framelog.dir=...` to write somewhere else.

## Comparing runs

```
python tools/frame_stats.py before.csv after.csv --skip 20
```

Works with both PresentMon CSVs and frame logs. `--skip` drops the first seconds (loading). It prints
average FPS, 1% and 0.1% lows (average FPS of the slowest 1% / 0.1% of frames), p99 frame time,
spikes over 50 ms (`--spike`), the worst frames with their tags, and the change between two files.

## Test route

Use the same save, time of day and weather for every run. Walk a fixed loop for two minutes, then drive
the same road for two minutes, and capture each separately. Note the build, mod list and settings with
the numbers.

[perf-test.md](perf-test.md) automates all of this: one command restores the test save, starts the
game, walks and drives the recorded route by itself, captures each part and prints the summary.
