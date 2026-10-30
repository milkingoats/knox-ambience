package knoxambience;

import me.zed_0xff.zombie_buddy.annotations.Patch;

/** Per-frame tick for {@link FrameLog}. Core.EndFrameUI runs once at the end of each frame. */
@Patch(className = "zombie.core.Core", methodName = "EndFrameUI")
public class Patch_Core_EndFrameUI {
    @Patch.OnEnter
    public static void enter() {
        FrameLog.endFrame();
    }
}
