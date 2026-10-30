package knoxambience;

import static net.bytebuddy.matcher.ElementMatchers.isDeclaredBy;
import static net.bytebuddy.matcher.ElementMatchers.named;
import static net.bytebuddy.matcher.ElementMatchers.takesArguments;

/**
 * (a) Wake the chunk streamer as soon as a chunk is requested.
 *
 * Stock: the "World Streamer" thread runs WorldStreamer.threadLoop() over and over. In single player,
 * each pass ends with Thread.sleep(140). A chunk requested just after that sleep starts waits up to
 * 140 ms before the thread even looks at it.
 *
 * Patch: every Thread.sleep(ms) call inside threadLoop becomes {@link #sleep(long)}. That method
 * waits for at most the same ms, but returns early when {@link #wake()} is called.
 * Patch_WorldStreamer_addJob calls wake() when the game requests a chunk.
 *
 * The upper bound stays the same, so work that runs on each pass (ChunkSaveWorker.Update, PlayerDB,
 * VehiclesDB2) still runs at least as often as in the stock game.
 */
public final class Patch_WorldStreamer_threadLoop {
    private Patch_WorldStreamer_threadLoop() {}

    // Monitor that the streamer thread waits on. wakeRequested is only written while holding LOCK.
    // It is volatile so wake() can skip the lock when a request is already pending.
    private static final Object LOCK = new Object();
    private static volatile boolean wakeRequested;

    private static volatile boolean seen;

    /** The call swap for Main to install. Null if our replacement method is missing. */
    static CallSwap.Swap swap() {
        try {
            return new CallSwap.Swap("streamer wake", "zombie.iso.WorldStreamer", "threadLoop",
                    named("sleep").and(isDeclaredBy(Thread.class)).and(takesArguments(long.class)),
                    Patch_WorldStreamer_threadLoop.class.getMethod("sleep", long.class));
        } catch (NoSuchMethodException e) {
            System.out.println(Main.TAG + "streamer wake: " + e);
            return null;
        }
    }

    /**
     * Replacement for Thread.sleep(ms) inside threadLoop. It runs on the World Streamer thread.
     * It throws InterruptedException like the original, so the game's error handling is unchanged.
     */
    public static void sleep(long ms) throws InterruptedException {
        // sleep(0) is a yield in the stock code. LOCK.wait(0) would mean "wait forever",
        // so keep the stock call for 0. Also keep it when the patch is switched off.
        if (ms <= 0 || !Main.streamerWake) {
            Thread.sleep(ms);
            return;
        }
        if (!seen) seen = Main.once("streamer wake (sleep -> wait)");

        long deadline = System.nanoTime() + ms * 1_000_000L;
        synchronized (LOCK) {
            // Loop because wait() can return early without a reason ("spurious wakeup").
            while (!wakeRequested) {
                long left = deadline - System.nanoTime();
                if (left <= 0) break;
                LOCK.wait(left / 1_000_000L, (int) (left % 1_000_000L));
            }
            if (wakeRequested) FrameLog.mark("stream.wake");
            // Use up the request. A request that came in while the thread was busy also ends up
            // here: the next sleep returns at once, because new work is waiting.
            wakeRequested = false;
        }
    }

    /**
     * Called from the main thread when a chunk is requested. When a request is already pending this is one
     * field read; otherwise one short lock. Skipping is safe: the pending request was set before this chunk
     * was queued, and the streamer clears it only before its next pass, which then sees this chunk too.
     */
    public static void wake() {
        if (wakeRequested) return;
        synchronized (LOCK) {
            wakeRequested = true;
            LOCK.notifyAll();
        }
    }
}
