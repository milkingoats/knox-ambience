package knoxautotest;

import me.zed_0xff.zombie_buddy.Patch;

/**
 * Test runs only: answer the loading screen's "click to start" prompt.
 *
 * The loading screen waits for the left mouse button once the world is ready. While
 * {@link AutoTest#clickThroughLoading} is set (loading screen of a test run), report button 0 as held.
 * The flag is cleared when the loading screen closes, so in-game clicks are untouched.
 */
@Patch(className = "zombie.input.Mouse", methodName = "isButtonDown")
public class Patch_Mouse_isButtonDown {
    @Patch.OnExit
    public static void exit(@Patch.Argument(0) int button, @Patch.Return(readOnly = false) boolean down) {
        if (AutoTest.clickThroughLoading && button == 0) down = true;
    }
}
