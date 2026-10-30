package knoxautotest;

import me.zed_0xff.zombie_buddy.Patch;

/** Disarm the click-to-start skip as soon as the loading screen closes, so play is never affected. */
@Patch(className = "zombie.gameStates.GameLoadingState", methodName = "exit")
public class Patch_GameLoadingState_exit {
    @Patch.OnEnter
    public static void enter() {
        AutoTest.onLoadingExit();
    }
}
