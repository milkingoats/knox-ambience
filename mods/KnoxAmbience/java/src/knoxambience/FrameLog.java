package knoxambience;

import java.io.BufferedWriter;
import java.io.IOException;
import java.lang.management.GarbageCollectorMXBean;
import java.lang.management.ManagementFactory;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.TimeUnit;

/**
 * Debug-only per-frame timing log, written as CSV for before/after comparisons of our patches.
 *
 * Off unless the game is started with {@code -Dknoxambience.framelog=true} in vmArgs.
 * Output goes to {@code <user.home>/Zomboid/Logs/knoxambience-frames-<time>.csv}, or to the
 * folder given by {@code -Dknoxambience.framelog.dir=...}.
 *
 * The first line is a comment, {@code # start_epoch_ms=<wall-clock ms at t_ms 0>}.
 * Columns: frame, t_ms (since logging started), frame_ms (time since the previous frame ended),
 * gc_count and gc_ms (GC pauses and pause time during the frame, all collectors summed),
 * tags (what {@link #mark} reported during the frame, separated by '|').
 *
 * Patches call {@link #mark(String)} when something expensive happens, e.g. a chunk save, so a slow
 * frame can be traced to its cause. mark() is safe from any thread and does nothing when logging is off.
 */
public final class FrameLog {
    public static final boolean ENABLED = Boolean.getBoolean("knoxambience.framelog");

    private static final int QUEUE_SIZE = 4096;
    private static final int MAX_TAG_CHARS = 512;

    private static final Object tagLock = new Object();
    private static final StringBuilder tags = new StringBuilder();

    private static final BlockingQueue<String> rows = new ArrayBlockingQueue<>(QUEUE_SIZE);
    private static volatile boolean started = false;
    private static long dropped = 0;

    private static long startNanos;
    private static long startEpochMs;
    private static long lastNanos;
    private static long frame;
    private static long lastGcCount;
    private static long lastGcMs;
    private static List<GarbageCollectorMXBean> gcBeans;

    private FrameLog() {}

    /** Records that {@code tag} happened during the current frame. */
    public static void mark(String tag) {
        if (!ENABLED || tag == null) return;
        synchronized (tagLock) {
            if (tags.length() >= MAX_TAG_CHARS) return;
            if (tags.length() > 0) tags.append('|');
            tags.append(tag);
        }
    }

    /** Called once per frame from the main thread (see {@link Patch_Core_EndFrameUI}). */
    // Public: Patch_Core_EndFrameUI's advice is copied into zombie.core.Core and calls this from there.
    public static void endFrame() {
        if (!ENABLED) return;
        long now = System.nanoTime();
        if (!started) {
            start(now);
            return;
        }

        long gcCount = 0;
        long gcMs = 0;
        for (GarbageCollectorMXBean bean : gcBeans) {
            gcCount += Math.max(0, bean.getCollectionCount());
            gcMs += Math.max(0, bean.getCollectionTime());
        }

        String frameTags;
        synchronized (tagLock) {
            frameTags = tags.toString();
            tags.setLength(0);
        }

        frame++;
        String row = frame + ","
                + ms(now - startNanos) + ","
                + ms(now - lastNanos) + ","
                + (gcCount - lastGcCount) + ","
                + (gcMs - lastGcMs) + ","
                + frameTags;
        if (!rows.offer(row)) dropped++;

        lastNanos = now;
        lastGcCount = gcCount;
        lastGcMs = gcMs;
    }

    private static void start(long now) {
        started = true;
        startNanos = now;
        startEpochMs = System.currentTimeMillis();
        lastNanos = now;
        gcBeans = pauseBeans();
        for (GarbageCollectorMXBean bean : gcBeans) {
            lastGcCount += Math.max(0, bean.getCollectionCount());
            lastGcMs += Math.max(0, bean.getCollectionTime());
        }

        Path file = outputDir().resolve("knoxambience-frames-"
                + LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss")) + ".csv");
        Thread writer = new Thread(() -> writeLoop(file), "KnoxAmbience FrameLog");
        writer.setDaemon(true);
        writer.setPriority(Thread.MIN_PRIORITY);
        writer.start();
        System.out.println(Main.TAG + "frame log: " + file);
    }

    // File I/O stays off the main thread so the log doesn't cause the spikes it measures.
    private static void writeLoop(Path file) {
        try {
            Files.createDirectories(file.getParent());
            try (BufferedWriter out = Files.newBufferedWriter(file, StandardCharsets.UTF_8)) {
                // Wall-clock time of t_ms = 0, so tools can line the log up with other captures.
                out.write("# start_epoch_ms=" + startEpochMs + "\n");
                out.write("frame,t_ms,frame_ms,gc_count,gc_ms,tags\n");
                Runtime.getRuntime().addShutdownHook(new Thread(() -> drain(out)));
                // Flush at most once a second, not after every row: at 60 fps the queue is empty
                // between most frames, which would mean one flush per frame.
                long lastFlush = System.nanoTime();
                while (true) {
                    String row = rows.poll(1, TimeUnit.SECONDS);
                    if (row != null) out.write(row + "\n");
                    if (System.nanoTime() - lastFlush >= 1_000_000_000L) {
                        out.flush();
                        lastFlush = System.nanoTime();
                    }
                }
            }
        } catch (IOException | InterruptedException e) {
            System.out.println(Main.TAG + "frame log stopped: " + e);
        }
    }

    private static void drain(BufferedWriter out) {
        try {
            String row;
            while ((row = rows.poll()) != null) out.write(row + "\n");
            if (dropped > 0) out.write("# dropped " + dropped + " rows\n");
            out.flush();
        } catch (IOException ignored) {
        }
    }

    // ZGC and Shenandoah report pauses and concurrent cycles as separate beans. Count only the
    // pause beans when there are any, since concurrent work doesn't stop the game thread.
    private static List<GarbageCollectorMXBean> pauseBeans() {
        List<GarbageCollectorMXBean> all = ManagementFactory.getGarbageCollectorMXBeans();
        List<GarbageCollectorMXBean> pauses = all.stream()
                .filter(bean -> bean.getName().contains("Pauses"))
                .toList();
        return pauses.isEmpty() ? all : pauses;
    }

    private static Path outputDir() {
        String dir = System.getProperty("knoxambience.framelog.dir");
        if (dir != null && !dir.isEmpty()) return Path.of(dir);
        return Path.of(System.getProperty("user.home"), "Zomboid", "Logs");
    }

    private static String ms(long nanos) {
        return String.format(java.util.Locale.ROOT, "%.3f", nanos / 1_000_000.0);
    }
}
