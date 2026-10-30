package knoxambience;

import java.io.PrintStream;

import static net.bytebuddy.matcher.ElementMatchers.isDeclaredBy;
import static net.bytebuddy.matcher.ElementMatchers.named;
import static net.bytebuddy.matcher.ElementMatchers.takesArguments;

/**
 * (c) Remove the alarm's leftover debug print.
 *
 * Stock: Alarm.updateSound() restarts the FMOD event whenever it is not playing. After each restart
 * it prints the raw playback state number to the console with System.out.println(int). It is a
 * leftover debug line, and with several alarms it can print many times per second.
 *
 * Patch: the println(int) call inside updateSound becomes {@link #println(PrintStream, int)}, which
 * prints nothing while the switch is on. Any other print in the game is untouched.
 */
public final class Patch_Alarm_updateSound {
    private Patch_Alarm_updateSound() {}

    static boolean install() {
        try {
            return CallSwap.replace("alarm println", "zombie.iso.Alarm", "updateSound",
                    named("println").and(isDeclaredBy(PrintStream.class)).and(takesArguments(int.class)),
                    Patch_Alarm_updateSound.class.getMethod("println", PrintStream.class, int.class));
        } catch (NoSuchMethodException e) {
            System.out.println(Main.TAG + "alarm println: " + e);
            return false;
        }
    }

    /** Replacement for out.println(state). The receiver comes first, as CallSwap requires. */
    public static void println(PrintStream out, int state) {
        if (!Main.alarmQuietLog) out.println(state);
    }
}
