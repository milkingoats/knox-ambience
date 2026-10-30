package knoxambience;

import me.zed_0xff.zombie_buddy.Patch;

/**
 * (d) Keep Rolling Hills' hills on under native shader packs built on Viewpoint's own looks.
 *
 * Rolling Hills turns its hills off for any native pack whose folder name isn't on its fixed list
 * (normal, default, vivid), plus True Weathers via TrueWeatherCompat.supports(pack), which gets the
 * active ShaderPack. It is asked
 * again every time Viewpoint links a pack. Knox Ambience is built on default, so it's off.
 *
 * Shim: when supports() says no, ask ShaderPackBase whether the active pack's base= chain reaches
 * one of Viewpoint's built-in looks, and if so answer yes. Rolling Hills then takes its normal
 * "supported" path. This class only forwards; the decision lives in ShaderPackBase.
 *
 * Target (Rolling Hills, checked 2026-10-30): public static boolean
 * wt.rollinghills.TrueWeatherCompat.supports(java.lang.Object). If a Rolling Hills update renames
 * it, this patch simply doesn't bind and the hills switch off as before.
 */
@Patch(className = "wt.rollinghills.TrueWeatherCompat", methodName = "supports")
public class Patch_RollingHills_supports {
    @Patch.OnExit
    public static void exit(@Patch.Argument(0) Object pack, @Patch.Return(readOnly = false) boolean supported) {
        if (!supported && Main.rollingHillsCompat && ShaderPackBase.builtOnViewpointLook(pack)) supported = true;
    }
}
