package knoxambience;

import java.lang.reflect.Field;
import java.util.Set;

/**
 * Answers "is this Viewpoint shader pack built on one of Viewpoint's own looks?" for shims into other
 * mods (Patch_RollingHills_supports).
 *
 * Reads Viewpoint's active pack by reflection, through public fields only, so nothing here is compiled
 * against Viewpoint: ShaderPacks$Active.pack, then ShaderPack.id and ShaderPack.base up the chain.
 * If those fields are missing after a Viewpoint update, it logs once and answers no, which leaves the
 * other mod's own behaviour unchanged.
 *
 * Must stay public: advice bodies are copied into the patched class and call these methods from there.
 */
public final class ShaderPackBase {
    /** Viewpoint's built-in looks: Vanilla (normal), Default and Vivid. */
    private static final Set<String> BUILT_IN = Set.of("normal", "default", "vivid");
    /** A base chain longer than this is treated as a loop. */
    private static final int MAX_DEPTH = 16;

    private static volatile boolean broken;
    private static volatile String lastReported;

    private ShaderPackBase() {}

    public static boolean builtOnViewpointLook(Object active) {
        if (active == null || broken) return false;
        try {
            Object pack = field(active, "pack");
            String id = pack == null ? null : (String) field(pack, "id");
            for (int depth = 0; pack != null && depth < MAX_DEPTH; depth++) {
                Object packId = field(pack, "id");
                if (packId instanceof String s && BUILT_IN.contains(s)) {
                    report(id, s);
                    return true;
                }
                pack = field(pack, "base");
            }
            return false;
        } catch (ReflectiveOperationException | ClassCastException | SecurityException e) {
            broken = true;
            System.out.println(Main.TAG + "pack base check disabled, Viewpoint's pack fields changed: " + e);
            return false;
        }
    }

    // The fields are public, but their classes may not be (ShaderPacks$Active is a nested class), so
    // allow access explicitly. Viewpoint runs on the class path, so this needs no module opens.
    private static Object field(Object owner, String name) throws ReflectiveOperationException {
        Field f = owner.getClass().getField(name);
        f.setAccessible(true);
        return f.get(owner);
    }

    /** One line per pack, so console.txt shows why Rolling Hills (or another mod) now accepts it. */
    private static void report(String id, String look) {
        if (id != null && id.equals(lastReported)) return;
        lastReported = id;
        System.out.println(Main.TAG + "pack '" + id + "' is built on Viewpoint's '" + look + "': told Rolling Hills it's supported");
    }
}
