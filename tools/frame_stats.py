#!/usr/bin/env python3
"""Frame-time statistics for KnoxAmbience frame logs and PresentMon captures.

Usage:
    python frame_stats.py capture.csv [more.csv ...] [--skip SECONDS] [--spike MS] [--top N]

Reads the frame-time column from each CSV (frame_ms from the KnoxAmbience frame log, or
MsBetweenPresents / FrameTime from PresentMon) and prints average FPS, 1% and 0.1% lows,
percentile frame times and the worst spikes. For KnoxAmbience logs, spikes also show GC time
and the tags patches marked during that frame. Pass two files to compare a before and after run.

"1% low" here is the average FPS over the slowest 1% of frames (the CapFrameX definition).
"""

import argparse
import csv
import statistics
import sys

FRAME_COLUMNS = ("frame_ms", "MsBetweenPresents", "FrameTime", "msBetweenPresents")


def load(path, skip_s):
    with open(path, newline="", encoding="utf-8-sig") as f:
        lines = (line for line in f if not line.startswith("#"))
        reader = csv.DictReader(lines)
        column = next((c for c in FRAME_COLUMNS if c in (reader.fieldnames or [])), None)
        if column is None:
            sys.exit(f"{path}: no frame-time column (looked for {', '.join(FRAME_COLUMNS)})")
        frames = []
        elapsed = 0.0
        for row in reader:
            try:
                ms = float(row[column])
            except (TypeError, ValueError):
                continue
            elapsed += ms
            if elapsed / 1000.0 < skip_s or ms <= 0:
                continue
            frames.append((ms, row))
    return column, frames


def low_fps(times, fraction):
    worst = sorted(times, reverse=True)
    n = max(1, int(len(worst) * fraction))
    return 1000.0 / statistics.fmean(worst[:n])


def percentile(times, p):
    ordered = sorted(times)
    return ordered[min(len(ordered) - 1, int(len(ordered) * p))]


def summarise(path, args):
    column, frames = load(path, args.skip)
    if not frames:
        print(f"{path}: no frames")
        return None
    times = [ms for ms, _ in frames]
    total_s = sum(times) / 1000.0
    stats = {
        "frames": len(times),
        "seconds": total_s,
        "avg_fps": len(times) / total_s,
        "low1_fps": low_fps(times, 0.01),
        "low01_fps": low_fps(times, 0.001),
        "p99_ms": percentile(times, 0.99),
        "p999_ms": percentile(times, 0.999),
        "max_ms": max(times),
        "spikes": sum(1 for t in times if t >= args.spike),
    }
    print(f"\n{path}  ({column})")
    print(f"  {stats['frames']} frames over {stats['seconds']:.1f} s")
    print(f"  avg {stats['avg_fps']:.1f} fps | 1% low {stats['low1_fps']:.1f} fps | "
          f"0.1% low {stats['low01_fps']:.1f} fps")
    print(f"  p99 {stats['p99_ms']:.2f} ms | p99.9 {stats['p999_ms']:.2f} ms | max {stats['max_ms']:.2f} ms")
    print(f"  frames >= {args.spike:g} ms: {stats['spikes']}")

    if args.top:
        print(f"  worst {args.top}:")
        for ms, row in sorted(frames, key=lambda f: f[0], reverse=True)[:args.top]:
            where = f"t={float(row['t_ms']) / 1000:.1f}s" if "t_ms" in row else ""
            gc = f"gc {row['gc_ms']} ms" if row.get("gc_count") not in (None, "", "0") else ""
            tags = row.get("tags") or ""
            print(f"    {ms:8.2f} ms  {where:>10}  {gc:>10}  {tags}")
    return stats


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("files", nargs="+")
    parser.add_argument("--skip", type=float, default=0.0, help="ignore the first N seconds (loading)")
    parser.add_argument("--spike", type=float, default=50.0, help="spike threshold in ms (default 50)")
    parser.add_argument("--top", type=int, default=10, help="list the N worst frames (default 10)")
    args = parser.parse_args()

    results = [summarise(path, args) for path in args.files]
    if len(results) == 2 and all(results):
        before, after = results
        print("\nchange (second vs first):")
        for key, label in (("avg_fps", "avg fps"), ("low1_fps", "1% low fps"),
                           ("low01_fps", "0.1% low fps"), ("p99_ms", "p99 ms"), ("max_ms", "max ms")):
            delta = after[key] - before[key]
            pct = 100.0 * delta / before[key] if before[key] else 0.0
            print(f"  {label:>13}: {before[key]:8.2f} -> {after[key]:8.2f}  ({pct:+.1f}%)")
        print(f"  {'spikes':>13}: {before['spikes']:8d} -> {after['spikes']:8d}")


if __name__ == "__main__":
    main()
