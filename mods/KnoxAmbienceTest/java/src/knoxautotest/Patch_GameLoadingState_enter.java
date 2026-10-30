package knoxautotest;

import me.zed_0xff.zombie_buddy.Patch;

/** Test runs only: arm the click-to-start skip when the loading screen opens. */
@Patch(className = "zombie.gameStates.GameLoadingState", methodName = "enter")
public class Patch_GameLoadingState_enter {
    @Patch.OnExit
    public static void exit() {
        AutoTest.onLoadingEnter();
    }
}
