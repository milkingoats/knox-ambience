package knoxambience;

import me.zed_0xff.zombie_buddy.Patch;

/**
 * (c) Clock for the house alarm limit.
 *
 * AmbientStreamManager.update() runs once per frame on the main thread. It calls Alarm.update() for
 * each active alarm. Here we decide once per frame whether this frame is an "alarm tick". Then all
 * alarms update together on the same tick, and no alarm needs a timer of its own.
 */
@Patch(className = "zombie.AmbientStreamManager", methodName = "update")
public class Patch_AmbientStreamManager_update {
    /** Time between two alarm updates. */
    public static final long ALARM_INTERVAL_NS = 250L * 1_000_000L;

    // Main thread only. All public: enter() is copied into AmbientStreamManager, and from there it
    // cannot reach private fields of this class.
    public static boolean alarmTickDue = true;
    public static boolean started;
    public static long lastTickNs;

    @Patch.OnEnter
    public static void enter() {
        long now = System.nanoTime();
        if (!started || now - lastTickNs >= ALARM_INTERVAL_NS) {
            started = true;
            lastTickNs = now;
            alarmTickDue = true;
        } else {
            alarmTickDue = false;
        }
    }
}
