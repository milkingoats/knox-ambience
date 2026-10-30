package knoxambience;

import me.zed_0xff.zombie_buddy.Patch;

/**
 * (a) Second half of the streamer wake: when the game queues a chunk, wake the streamer thread.
 *
 * Only addJob is hooked. That is the normal in-game path. addJobInstant, addJobConvert and
 * addJobWipe are tool and debug paths, so they keep the stock behaviour (picked up within 140 ms).
 */
@Patch(className = "zombie.iso.WorldStreamer", methodName = "addJob")
public class Patch_WorldStreamer_addJob {
    public static volatile boolean seen;

    @Patch.OnExit
    public static void exit() {
        FrameLog.mark("stream.request");
        if (!Main.streamerWake) return;
        if (!seen) seen = Main.once("addJob -> streamer wake");
        Patch_WorldStreamer_threadLoop.wake();
    }
}
