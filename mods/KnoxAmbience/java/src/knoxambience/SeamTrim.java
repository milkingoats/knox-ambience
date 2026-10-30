package knoxambience;

import java.io.InputStream;
import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.util.IdentityHashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;

/**
 * Adds a thin strip along the top of every wall face in a Viewpoint chunk recipe, so the jagged line
 * where walls meet the ceiling disappears (issue #25). Called by Patch_WorldMesher_gather.
 *
 * Why the line is jagged: Viewpoint makes each wall a flat full-height quad (its WALL_N, WALL_W and
 * WALL_NW tile meshes) and paints it with the wall's 2D tile art. The art's top edge is a slanted pixel
 * staircase, so the quad's top rows are partly see-through and show as teeth under the ceiling.
 *
 * The strip is a copy of the wall's face op with its own mesh: the top HEIGHT of the wall, lifted a few
 * millimetres off the face towards the viewer side, sampling the art from just below the teeth. The
 * wallpaper then runs right up to the ceiling. It sits on the wall itself, so it doesn't matter whether
 * the ceiling is an upper floor or a roof underside. Only faces using those three wall meshes get a
 * strip; anything else (tile geometry, caps, roofs) is left alone. Viewpoint's own ops are never edited.
 *
 * Viewpoint's recipe classes are package-private, so they are read by reflection. Built against
 * Viewpoint 0.1.6.1; on any other version, or if a field is missing, it logs once and does nothing.
 *
 * Must stay public: the advice body is copied into WorldMesher and calls add() from there.
 */
public final class SeamTrim {
    static final String VIEWPOINT_VERSION = "0.1.6.1";

    /** Strip height in world units (a storey is 2.449). The art's teeth are 1 to 3 pixels, about 0.03 to 0.08. */
    static final float HEIGHT = floatProperty("knoxambience.seamtrim.height", 0.08f, 0.02f, 0.3f);
    /** Distance off the wall face, enough to win the depth test against the wall without a visible step. */
    static final float OFF_WALL = 0.004f;

    private static final int STRIDE = 8;      // TileMesh: x, y, z, u, v, nx, ny, nz
    private static final int KIND_FACE = 1;   // Recipe.Op.FACE
    private static final int FACE_BACK = 1;   // Recipe.FACE_FRONT = 0, FACE_BACK = 1, FACE_CAPS = 2
    private static final String[] WALL_MESHES = {"WALL_N", "WALL_W", "WALL_NW"};

    /** 0 = not set up yet, 1 = on, -1 = off for this session. */
    private static volatile int state;
    private static volatile boolean seen;

    // Set once in setUp(), then only read. state is written last, so a reader that sees 1 sees these.
    private static Field batches, ops;
    private static Field kind, face, flags, lift, owner, mesh, map, dx, dy, height, dirX, dirZ, fill;
    private static Constructor<?> newOp;
    /** Viewpoint wall mesh -> {front strip, back strip}. */
    private static Map<Object, Object[]> strips;

    private SeamTrim() {}

    public static void add(Object recipe) {
        if (recipe == null || state < 0) return;
        if (state == 0 && !setUp(recipe.getClass())) return;
        try {
            int added = 0;
            for (Object batch : (List<?>) batches.get(recipe)) {
                @SuppressWarnings("unchecked")
                List<Object> list = (List<Object>) ops.get(batch);
                // Strips go in the same batch as their wall, so they share its texture page and add no draw calls.
                for (int i = 0, n = list.size(); i < n; i++) {
                    Object op = list.get(i);
                    if (kind.getInt(op) != KIND_FACE) continue;
                    int side = face.getInt(op);
                    if (side > FACE_BACK) continue;
                    Object[] pair = strips.get(mesh.get(op));
                    if (pair == null) continue;
                    list.add(copy(op, pair[side]));
                    added++;
                }
            }
            if (!seen && added > 0) seen = Main.once("seam trim (Viewpoint " + VIEWPOINT_VERSION + ", strip " + HEIGHT + ")");
        } catch (ReflectiveOperationException | RuntimeException e) {
            off("seam trim off, Viewpoint's recipe changed: " + e);
        }
    }

    private static Object copy(Object op, Object stripMesh) throws ReflectiveOperationException {
        Object s = newOp.newInstance();
        kind.setInt(s, kind.getInt(op));
        face.setInt(s, face.getInt(op));
        flags.setInt(s, flags.getInt(op));
        lift.setInt(s, lift.getInt(op));
        owner.setInt(s, owner.getInt(op)); // same owner, so the strip hides with its wall in cutaways
        map.set(s, map.get(op));
        dx.setFloat(s, dx.getFloat(op));
        dy.setFloat(s, dy.getFloat(op));
        height.setFloat(s, height.getFloat(op));
        dirX.setFloat(s, dirX.getFloat(op));
        dirZ.setFloat(s, dirZ.getFloat(op));
        fill.setFloat(s, fill.getFloat(op));
        mesh.set(s, stripMesh);
        return s;
    }

    private static synchronized boolean setUp(Class<?> recipeClass) {
        if (state != 0) return state > 0;
        ClassLoader cl = recipeClass.getClassLoader();
        String version = viewpointVersion(cl);
        if (!VIEWPOINT_VERSION.equals(version)) {
            off("seam trim skipped: Viewpoint " + version + ", built for " + VIEWPOINT_VERSION);
            return false;
        }
        try {
            Class<?> batchClass = Class.forName("viewpoint.world.Recipe$Batch", false, cl);
            Class<?> opClass = Class.forName("viewpoint.world.Recipe$Op", false, cl);
            Class<?> meshClass = Class.forName("viewpoint.world.TileMesh", false, cl);
            Class<?> meshesClass = Class.forName("viewpoint.world.TileMeshes", true, cl);
            batches = field(recipeClass, "batches");
            ops = field(batchClass, "ops");
            kind = field(opClass, "kind");
            face = field(opClass, "face");
            flags = field(opClass, "flags");
            lift = field(opClass, "lift");
            owner = field(opClass, "owner");
            mesh = field(opClass, "mesh");
            map = field(opClass, "map");
            dx = field(opClass, "dx");
            dy = field(opClass, "dy");
            height = field(opClass, "height");
            dirX = field(opClass, "dirX");
            dirZ = field(opClass, "dirZ");
            fill = field(opClass, "fill");
            newOp = opClass.getDeclaredConstructor();
            newOp.setAccessible(true);
            Constructor<?> newMesh = meshClass.getDeclaredConstructor(float[].class);
            newMesh.setAccessible(true);
            Field data = meshClass.getField("data");

            Map<Object, Object[]> made = new IdentityHashMap<>();
            for (String name : WALL_MESHES) {
                Object wall = field(meshesClass, name).get(null);
                float[] src = (float[]) data.get(wall);
                float[] front = strip(src, 1f);
                float[] back = strip(src, -1f);
                if (front == null || back == null) {
                    off("seam trim off, Viewpoint's " + name + " mesh isn't a plain wall quad");
                    return false;
                }
                made.put(wall, new Object[] {newMesh.newInstance((Object) front), newMesh.newInstance((Object) back)});
            }
            strips = made;
            state = 1;
            return true;
        } catch (ReflectiveOperationException | RuntimeException e) {
            off("seam trim off, Viewpoint's classes changed: " + e);
            return false;
        }
    }

    /**
     * The strip version of a wall mesh: each top vertex stays put, each bottom vertex moves up to
     * HEIGHT below its top, and both sample the art HEIGHT lower than where they now sit. sign is +1
     * for the front face (lift along the mesh normal) and -1 for the back. Returns null unless every
     * vertex has a partner straight above or below it on the same face, which is how Viewpoint's wall
     * quads are built.
     */
    static float[] strip(float[] src, float sign) {
        if (src.length == 0 || src.length % STRIDE != 0) return null;
        float lo = Float.MAX_VALUE, hi = -Float.MAX_VALUE;
        for (int o = 0; o < src.length; o += STRIDE) {
            lo = Math.min(lo, src[o + 1]);
            hi = Math.max(hi, src[o + 1]);
        }
        float tall = hi - lo;
        if (tall < 4f * HEIGHT) return null;
        float[] out = src.clone();
        for (int o = 0; o < src.length; o += STRIDE) {
            int p = partner(src, o, tall);
            if (p < 0) return null;
            int t = src[o + 1] > src[p + 1] ? o : p;
            int b = t == o ? p : o;
            float y = t == o ? src[t + 1] : src[t + 1] - HEIGHT;
            float k = (y - HEIGHT - src[b + 1]) / (src[t + 1] - src[b + 1]);
            out[o + 1] = y;
            out[o + 3] = src[b + 3] + (src[t + 3] - src[b + 3]) * k;
            out[o + 4] = src[b + 4] + (src[t + 4] - src[b + 4]) * k;
            for (int c = 0; c < 3; c++) out[o + c] += src[o + 5 + c] * OFF_WALL * sign;
        }
        return out;
    }

    /** The vertex at the same x, z and normal as vertex o, at the other end of the wall's height. */
    private static int partner(float[] d, int o, float tall) {
        final float eps = 1e-4f;
        for (int q = 0; q < d.length; q += STRIDE) {
            if (q == o || Math.abs(d[q + 1] - d[o + 1]) < 0.5f * tall) continue;
            if (Math.abs(d[q] - d[o]) > eps || Math.abs(d[q + 2] - d[o + 2]) > eps) continue;
            if (Math.abs(d[q + 5] - d[o + 5]) > eps || Math.abs(d[q + 6] - d[o + 6]) > eps
                    || Math.abs(d[q + 7] - d[o + 7]) > eps) continue;
            return q;
        }
        return -1;
    }

    private static String viewpointVersion(ClassLoader cl) {
        try (InputStream in = cl == null ? null : cl.getResourceAsStream("viewpoint/build.properties")) {
            if (in == null) return "unknown";
            Properties p = new Properties();
            p.load(in);
            return p.getProperty("version", "unknown");
        } catch (Exception e) {
            return "unknown";
        }
    }

    private static Field field(Class<?> owner, String name) throws NoSuchFieldException {
        Field f = owner.getDeclaredField(name);
        f.setAccessible(true);
        return f;
    }

    private static void off(String why) {
        state = -1;
        System.out.println(Main.TAG + why);
    }

    private static float floatProperty(String key, float fallback, float min, float max) {
        try {
            String s = System.getProperty(key);
            return s == null ? fallback : Math.max(min, Math.min(max, Float.parseFloat(s)));
        } catch (NumberFormatException e) {
            return fallback;
        }
    }
}
