package knoxambience;

import java.lang.invoke.MethodHandle;
import java.lang.invoke.MethodHandles;
import java.lang.invoke.MethodType;

import me.zed_0xff.zombie_buddy.Patch;
import zombie.iso.ChunkSaveWorker;
import zombie.network.GameClient;
import zombie.network.GameServer;

/**
 * (b) Second half of the hot save limit: run a delayed hot save once it is due.
 *
 * The World Streamer thread calls ChunkSaveWorker.Update(null) on each pass, at least every 140 ms.
 * After each call we check: is a skipped hot save pending, have 30 s passed, and is the save queue
 * empty? The stock code makes the same queue check before a hot save. If yes, we call the game's own
 * HotsaveAncilliarySystems(). Its throttle advice then lets it run.
 */
@Patch(className = "zombie.iso.ChunkSaveWorker", methodName = "Update")
public class Patch_ChunkSaveWorker_Update {
    // HotsaveAncilliarySystems is private. A MethodHandle calls it without copying any game code.
    // It is looked up once, on first use.
    private static MethodHandle hotsave;
    private static boolean lookupFailed;

    @Patch.OnExit
    public static void exit(@Patch.This Object self) {
        if (!Main.hotsaveThrottle || !Patch_ChunkSaveWorker_HotsaveAncilliarySystems.pendingDue()) return;

        // Same conditions as the stock caller: single player only, and nothing left in the queue.
        if (GameClient.client || GameServer.server) return;
        ChunkSaveWorker worker = (ChunkSaveWorker) self;
        if (!worker.toSaveQueue.isEmpty()) return;

        MethodHandle h = handle();
        if (h == null) return;
        try {
            h.invoke(worker);
        } catch (Throwable t) {
            System.out.println(Main.TAG + "delayed hot save failed: " + t);
        }
    }

    // Public: exit() is copied into ChunkSaveWorker, and from there it cannot call our private methods.
    public static MethodHandle handle() {
        if (hotsave != null || lookupFailed) return hotsave;
        try {
            MethodHandles.Lookup lookup =
                    MethodHandles.privateLookupIn(ChunkSaveWorker.class, MethodHandles.lookup());
            hotsave = lookup.findVirtual(ChunkSaveWorker.class, "HotsaveAncilliarySystems",
                    MethodType.methodType(void.class));
        } catch (ReflectiveOperationException | RuntimeException e) {
            // Without the handle a delayed save only runs at the next queue drain or on exit.
            // Turn the throttle off so no save waits longer than in the stock game.
            lookupFailed = true;
            Main.hotsaveThrottle = false;
            System.out.println(Main.TAG + "hot save throttle disabled, cannot reach HotsaveAncilliarySystems: " + e);
        }
        return hotsave;
    }
}
