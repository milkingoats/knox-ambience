package knoxambience;

import me.zed_0xff.zombie_buddy.Patch;

/**
 * (e) Hide the jagged line where interior walls meet the ceiling (Viewpoint geometry, issue #25).
 *
 * Thin hook only: when Viewpoint has gathered one chunk level's mesh recipe, hand it to SeamTrim,
 * which adds a strip along the top of each wall face. Nothing Viewpoint built is changed.
 *
 * Target (Viewpoint 0.1.6.1, checked 2026-10-30): static viewpoint.world.Recipe
 * viewpoint.world.WorldMesher.gather(IsoChunk, int, int, boolean, boolean, boolean). It runs when a
 * chunk level is rebuilt, not every frame. If an update renames it, this patch doesn't bind; if the
 * recipe's insides change, SeamTrim logs and turns itself off.
 */
@Patch(className = "viewpoint.world.WorldMesher", methodName = "gather")
public class Patch_WorldMesher_gather {
    @Patch.OnExit
    public static void exit(@Patch.Return Object recipe) {
        if (Main.seamTrim) SeamTrim.add(recipe);
    }
}
