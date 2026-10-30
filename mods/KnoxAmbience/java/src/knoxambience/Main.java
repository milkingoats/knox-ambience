package knoxambience;

/**
 * Entry point, run by ZombieBuddy when the mod loads.
 *
 * ZombieBuddy finds every class in this package that has a @Patch annotation and applies it by itself.
 * Two patches change a single call inside a game method. Advice cannot do that, so they go through
 * CallSwap. Main installs those two and prints one load report.
 */
public class Main {
    public static final String TAG = "[KnoxAmbience] ";

    // One switch per patch. Set a switch to false to get the stock game behaviour back.
    // The patch code reads these switches at run time, so a change takes effect at once.
    public static volatile boolean streamerWake = true;     // (a) wake the chunk streamer on request
    public static volatile boolean hotsaveThrottle = true;  // (b) at most one hot save per 30 s
    public static volatile boolean alarmThrottle = true;    // (c) house alarm update every 250 ms
    public static volatile boolean alarmQuietLog = true;    // (c) drop the alarm's println on restart

    public static void main(String[] args) {
        // These two patches swap one call inside a game method, so they need CallSwap.
        boolean streamer = Patch_WorldStreamer_threadLoop.install();
        boolean alarmLog = Patch_Alarm_updateSound.install();

        // ZombieBuddy applies the @Patch classes. We cannot see the result from here, so each one
        // prints "active" the first time it runs (see once()).
        System.out.println(TAG + "loaded. call swaps: streamer wake=" + ok(streamer)
                + ", alarm println=" + ok(alarmLog)
                + ". advice patches report 'active' on first use: addJob, hot save throttle, alarm tick.");
    }

    private static String ok(boolean b) {
        return b ? "applied" : "NOT applied (stock behaviour)";
    }

    /**
     * Prints one "active" line per patch. The caller passes a flag that it owns.
     * Use: if (!seen) seen = Main.once("name");
     * The check at the call site costs one field read, so it is safe in per-frame code.
     */
    public static boolean once(String patchName) {
        System.out.println(TAG + "patch active: " + patchName);
        return true;
    }
}
