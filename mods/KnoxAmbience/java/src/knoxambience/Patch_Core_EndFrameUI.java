package knoxambience;

// ZombieBuddy 2.3.x keeps Patch here; 3.0 (beta) moves it to ...zombie_buddy.annotations.
import me.zed_0xff.zombie_buddy.Patch;

/** Per-frame tick for {@link FrameLog}. Core.EndFrameUI runs once at the end of each frame. */
@Patch(className = "zombie.core.Core", methodName = "EndFrameUI")
public class Patch_Core_EndFrameUI {
    @Patch.OnEnter
    public static void enter() {
        FrameLog.endFrame();
    }
}
