package knoxambience;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Entry point, run by ZombieBuddy when the mod loads.
 *
 * ZombieBuddy finds every class in this package that has a @Patch annotation and applies it by itself.
 * Two patches change a single call inside a game method. Advice cannot do that, so they go through
 * CallSwap. Main installs those two, copies our shader pack into viewpoint-shaderpacks (ShaderPackInstall)
 * and prints the load report.
 */
public class Main {
    public static final String TAG = "[KnoxAmbience] ";

    // One switch per patch. Set a switch to false to get the stock game behaviour back.
    // The patch code reads these switches at run time, so a change takes effect at once.
    public static volatile boolean streamerWake = true;     // (a) wake the chunk streamer on request
    public static volatile boolean hotsaveThrottle = true;  // (b) at most one hot save per 30 s
    public static volatile boolean alarmThrottle = true;    // (c) house alarm update every 250 ms
    public static volatile boolean alarmQuietLog = true;    // (c) drop the alarm's println on restart
    public static volatile boolean rollingHillsCompat = true; // (d) Rolling Hills accepts packs built on default/vivid
    // (e) strip over the jagged wall-ceiling line in Viewpoint's mesh. Off: -Dknoxambience.seamtrim=false
    public static volatile boolean seamTrim = !"false".equalsIgnoreCase(System.getProperty("knoxambience.seamtrim"));

    public static void main(String[] args) {
        // Viewpoint scans viewpoint-shaderpacks after we load, so the pack is in place for that scan.
        String shaderPack = ShaderPackInstall.run();

        // These two patches swap one call inside a game method, so they need CallSwap.
        // Both go in one call, so they share one class-file transformer.
        CallSwap.Swap streamerSwap = Patch_WorldStreamer_threadLoop.swap();
        CallSwap.Swap alarmSwap = Patch_Alarm_updateSound.swap();
        List<CallSwap.Swap> swaps = new ArrayList<>();
        if (streamerSwap != null) swaps.add(streamerSwap);
        if (alarmSwap != null) swaps.add(alarmSwap);
        Map<String, Boolean> swapped = CallSwap.install(swaps);
        boolean streamer = streamerSwap != null && swapped.get(streamerSwap.label());
        boolean alarmLog = alarmSwap != null && swapped.get(alarmSwap.label());

        // ZombieBuddy applies the @Patch classes. We cannot see the result from here, so each one
        // prints "active" the first time it runs (see once()).
        System.out.println(TAG + "loaded. call swaps: streamer wake=" + ok(streamer)
                + ", alarm println=" + ok(alarmLog)
                + ". advice patches report 'active' on first use: addJob, hot save throttle, alarm tick, Rolling Hills compat, seam trim.");
        System.out.println(TAG + "shader pack: " + shaderPack);
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
