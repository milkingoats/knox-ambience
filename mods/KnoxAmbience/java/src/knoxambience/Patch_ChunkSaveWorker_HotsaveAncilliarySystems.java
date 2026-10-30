package knoxambience;

import me.zed_0xff.zombie_buddy.Patch;

/**
 * (b) Limit the single-player "hot save" to one per 30 s.
 *
 * Stock: each time the chunk save queue becomes empty, ChunkSaveWorker calls
 * HotsaveAncilliarySystems(). That method serializes the meta grid, animals, game time, world map,
 * map-visited data and entities on the main thread, and saves players. When you travel, chunks unload
 * all the time, so this full save runs again and again.
 *
 * Patch: if the last hot save was less than 30 s ago, skip this call and mark it "pending".
 * Patch_ChunkSaveWorker_Update runs the pending save as soon as 30 s have passed, so a save is
 * delayed, never dropped.
 *
 * Exit: quitting calls GameWindow.save(), which saves the meta grid, animals, world map and the rest
 * directly (through IsoCell.save -> IsoMetaGrid.save). A delayed hot save loses nothing on a clean
 * exit. After a crash, at most about 30 s of this data can be lost.
 */
@Patch(className = "zombie.iso.ChunkSaveWorker", methodName = "HotsaveAncilliarySystems")
public class Patch_ChunkSaveWorker_HotsaveAncilliarySystems {
    /** Minimum time between two hot saves. */
    public static final long MIN_INTERVAL_NS = 30L * 1_000_000_000L;

    // Read and written by the save code, which normally runs on the World Streamer thread.
    // volatile because the main thread can also reach ChunkSaveWorker.Update.
    public static volatile boolean ranOnce;
    public static volatile long lastRunNs;
    public static volatile boolean pending;
    public static volatile boolean seen;

    /** Returns true to skip the stock method (ZombieBuddy skipOn). */
    @Patch.OnEnter(skipOn = true)
    public static boolean enter() {
        if (!Main.hotsaveThrottle) {
            FrameLog.mark("save.hotsave");
            return false;
        }
        if (!seen) seen = Main.once("hot save throttle (30 s)");

        long now = System.nanoTime();
        if (ranOnce && now - lastRunNs < MIN_INTERVAL_NS) {
            pending = true;  // too soon: run it later
            FrameLog.mark("save.hotsave.deferred");
            return true;
        }
        ranOnce = true;
        lastRunNs = now;
        pending = false;
        FrameLog.mark("save.hotsave");
        return false;        // run the stock hot save now
    }

    /**
     * True if a skipped save is waiting and 30 s have passed since the last save.
     * Public because advice code is copied into the game class, so private members cannot be called from it.
     */
    public static boolean pendingDue() {
        return pending && System.nanoTime() - lastRunNs >= MIN_INTERVAL_NS;
    }
}
