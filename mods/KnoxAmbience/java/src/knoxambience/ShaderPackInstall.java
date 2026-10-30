package knoxambience;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Copies the Knox Ambience shader pack, bundled inside our jar, into {@code Zomboid/viewpoint-shaderpacks/}
 * at startup, so players don't have to install it by hand. Main runs this before Viewpoint scans for packs.
 *
 * The build puts the pack under {@code shaderpack/KnoxAmbience/} in the jar, plus {@code shaderpack/KnoxAmbience.index}
 * with one relative path per line. After an install we write {@value #MARKER} into the pack folder: the SHA-256 and
 * path of each file we wrote. That lets the next launch tell our own old copy (safe to update) from a copy someone
 * edited or put there by hand (left alone).
 *
 * - No folder: install.
 * - Folder matches our marker: update it if the bundled pack changed, and remove files the new pack dropped.
 * - Folder edited, or no marker and it differs from ours: leave it and say so in the log. Deleting the folder
 *   hands it back to us.
 *
 * {@code -Dknoxambience.shaderpack.install=false} turns this off. {@code -Dknoxambience.shaderpack.dir=...} sets the
 * viewpoint-shaderpacks folder. Any error is logged and skipped; the rest of the mod loads as usual.
 */
public final class ShaderPackInstall {
    static final String PACK = "KnoxAmbience";
    static final String RESOURCE_DIR = "/shaderpack/" + PACK + "/";
    static final String INDEX = "/shaderpack/" + PACK + ".index";
    static final String MARKER = ".knoxambience-install";

    private ShaderPackInstall() {}

    /** Returns a one-line result for Main's load report. */
    public static String run() {
        if ("false".equalsIgnoreCase(System.getProperty("knoxambience.shaderpack.install"))) {
            return "off (-Dknoxambience.shaderpack.install=false)";
        }
        try {
            Map<String, byte[]> bundled = readBundled();
            if (bundled == null) return "not in this jar (built without the pack)";
            return install(bundled, packsDir().resolve(PACK));
        } catch (Exception e) {
            return "failed (" + e + "), pack left as it was";
        }
    }

    static String install(Map<String, byte[]> bundled, Path target) throws IOException {
        Map<String, String> want = new LinkedHashMap<>();
        for (Map.Entry<String, byte[]> e : bundled.entrySet()) want.put(e.getKey(), sha256(e.getValue()));

        if (!Files.exists(target)) {
            writeAll(bundled, target, Map.of());
            writeMarker(target, want);
            return "installed to " + target;
        }

        Map<String, String> marker = readMarker(target);
        if (marker == null) {
            // Someone copied the pack here by hand. Take it over only if it's exactly ours.
            if (!matches(target, want)) {
                return "left as is: " + target + " differs from the bundled pack and wasn't installed by us"
                        + " (delete the folder to get the bundled one)";
            }
            writeMarker(target, want);
            return "up to date (" + target + ")";
        }

        String changed = firstChange(target, marker);
        if (changed != null) {
            return "left as is: " + changed + " in " + target + " since we installed it"
                    + " (delete the folder to get the bundled one)";
        }
        if (marker.equals(want)) return "up to date (" + target + ")";

        writeAll(bundled, target, marker);
        writeMarker(target, want);
        return "updated " + target;
    }

    /** Writes every bundled file, then removes files we installed earlier that the new pack no longer has. */
    private static void writeAll(Map<String, byte[]> bundled, Path target, Map<String, String> old) throws IOException {
        for (Map.Entry<String, byte[]> e : bundled.entrySet()) {
            Path file = resolveInside(target, e.getKey());
            Files.createDirectories(file.getParent());
            Path tmp = file.resolveSibling(file.getFileName() + ".tmp");
            Files.write(tmp, e.getValue());
            Files.move(tmp, file, StandardCopyOption.REPLACE_EXISTING);
        }
        for (String rel : old.keySet()) {
            if (!bundled.containsKey(rel)) Files.deleteIfExists(resolveInside(target, rel));
        }
    }

    /** True when every listed file exists with the listed hash. Extra files in the folder don't count. */
    private static boolean matches(Path target, Map<String, String> files) throws IOException {
        return firstChange(target, files) == null;
    }

    /** Says how the first listed file that differs has changed ("x was deleted", "x was edited"), or null if none. */
    private static String firstChange(Path target, Map<String, String> files) throws IOException {
        for (Map.Entry<String, String> e : files.entrySet()) {
            Path file = resolveInside(target, e.getKey());
            if (!Files.isRegularFile(file)) return e.getKey() + " was deleted";
            if (!sha256(Files.readAllBytes(file)).equals(e.getValue())) return e.getKey() + " was edited";
        }
        return null;
    }

    private static Map<String, String> readMarker(Path target) throws IOException {
        Path file = target.resolve(MARKER);
        if (!Files.isRegularFile(file)) return null;
        Map<String, String> files = new LinkedHashMap<>();
        for (String line : Files.readAllLines(file, StandardCharsets.UTF_8)) {
            if (line.isBlank() || line.startsWith("#")) continue;
            int space = line.indexOf(' ');
            if (space <= 0) return null;  // unreadable marker: treat the folder as not ours
            files.put(line.substring(space + 1), line.substring(0, space));
        }
        return files;
    }

    private static void writeMarker(Path target, Map<String, String> files) throws IOException {
        StringBuilder sb = new StringBuilder("# Written by the Knox Ambience mod. Lists the files it installed here.\n"
                + "# Edit any of them and the mod stops updating this folder; delete the folder to reinstall.\n");
        for (Map.Entry<String, String> e : files.entrySet()) sb.append(e.getValue()).append(' ').append(e.getKey()).append('\n');
        Files.writeString(target.resolve(MARKER), sb, StandardCharsets.UTF_8);
    }

    /** Reads the pack out of our jar, in index order. Null when the jar has no pack. */
    private static Map<String, byte[]> readBundled() throws IOException {
        String index = readResource(INDEX);
        if (index == null) return null;
        Map<String, byte[]> files = new LinkedHashMap<>();
        for (String rel : index.split("\n")) {
            rel = rel.strip();
            if (rel.isEmpty()) continue;
            try (InputStream in = ShaderPackInstall.class.getResourceAsStream(RESOURCE_DIR + rel)) {
                if (in == null) throw new IOException("index lists " + rel + " but the jar doesn't have it");
                files.put(rel, in.readAllBytes());
            }
        }
        if (files.isEmpty()) return null;
        return files;
    }

    private static String readResource(String name) throws IOException {
        try (InputStream in = ShaderPackInstall.class.getResourceAsStream(name)) {
            return in == null ? null : new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    /** viewpoint-shaderpacks inside the game's user folder (the one holding console.txt). */
    static Path packsDir() {
        String dir = System.getProperty("knoxambience.shaderpack.dir");
        if (dir != null && !dir.isBlank()) return Path.of(dir);
        return zomboidDir().resolve("viewpoint-shaderpacks");
    }

    /**
     * The game's own cache dir when it already knows it (it honours -cachedir). Before that, the -cachedir
     * launch argument if there is one, else {@code <user.home>/Zomboid}.
     * Read by reflection so a renamed game method costs us the fallback, not a crash.
     */
    private static Path zomboidDir() {
        try {
            Class<?> fs = Class.forName("zombie.ZomboidFileSystem");
            Object instance = fs.getField("instance").get(null);
            Object cache = fs.getMethod("getCacheDir").invoke(instance);
            if (cache instanceof String s && !s.isBlank() && Files.isDirectory(Path.of(s))) return Path.of(s);
        } catch (Throwable ignored) {
            // fall through
        }
        Path fromArgs = cacheDirArg(System.getProperty("sun.java.command"));
        if (fromArgs != null) return fromArgs;
        return Path.of(System.getProperty("user.home"), "Zomboid");
    }

    /**
     * The value of {@code -cachedir=...} in the launch command line, or null. The JVM gives us the command
     * line as one string with arguments joined by spaces, so a path with spaces runs up to the next " -".
     */
    static Path cacheDirArg(String commandLine) {
        if (commandLine == null) return null;
        String key = "-cachedir=";
        int at = commandLine.indexOf(" " + key);
        if (at < 0) return null;
        int from = at + 1 + key.length();
        int to = commandLine.indexOf(" -", from);
        String dir = (to < 0 ? commandLine.substring(from) : commandLine.substring(from, to)).strip();
        if (dir.length() >= 2 && dir.startsWith("\"") && dir.endsWith("\"")) dir = dir.substring(1, dir.length() - 1);
        if (dir.isEmpty()) return null;
        try {
            return Path.of(dir);
        } catch (RuntimeException e) {
            return null;
        }
    }

    /** Keeps index entries like "../x" from writing outside the pack folder. */
    private static Path resolveInside(Path target, String rel) throws IOException {
        Path file = target.resolve(rel).normalize();
        if (!file.startsWith(target.normalize()) || file.equals(target.normalize())) {
            throw new IOException("bad path in pack: " + rel);
        }
        return file;
    }

    private static String sha256(byte[] data) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(data));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
