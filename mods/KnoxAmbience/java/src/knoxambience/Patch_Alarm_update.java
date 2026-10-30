package knoxambience;

import me.zed_0xff.zombie_buddy.Patch;

/**
 * (c) Update house alarms every 250 ms, not every frame.
 *
 * Stock: each frame, each active alarm:
 *  - adds a new world sound with radius 600 (WorldSoundManager.addSound),
 *  - asks FMOD for the playback state up to 3 times (native calls),
 *  - looks up its sound settings by name,
 *  - looks up two grid squares and buildings to compute occlusion.
 * At 120 fps that is about 120 world sounds per second per alarm.
 *
 * Patch: skip Alarm.update() on frames that are not an alarm tick
 * (see Patch_AmbientStreamManager_update). The alarm still adds its sound, updates volume and
 * occlusion, and checks its end time, 4 times per second. The FMOD sound plays on by itself
 * between updates, so you hear no difference.
 *
 * Gameplay check: zombies now get a fresh alarm sound every 250 ms, not every frame. Test that
 * alarms still pull zombies the same way.
 */
@Patch(className = "zombie.iso.Alarm", methodName = "update")
public class Patch_Alarm_update {
    public static volatile boolean seen;

    /** Returns true to skip the stock update on this frame. */
    @Patch.OnEnter(skipOn = true)
    public static boolean enter() {
        if (!Main.alarmThrottle) return false;
        if (!seen) seen = Main.once("alarm update throttle (250 ms)");
        return !Patch_AmbientStreamManager_update.alarmTickDue;
    }
}
