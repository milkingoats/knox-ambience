package knoxautotest;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import zombie.ZomboidFileSystem;

/**
 * Whether a scripted test run was requested, and the loading-screen skip.
 *
 * perf-test.ps1 writes {@code Zomboid/Lua/knoxambience_autotest.txt} (key=value lines) and deletes it
 * when the run ends. The file carries {@code expires=<epoch ms>}, so a file left behind by a crashed run
 * stops counting after a few minutes and a normal game start is never hijacked. The Lua half of the mod
 * reads the same file (Lua's getFileReader reads from Zomboid/Lua).
 */
public final class AutoTest {
    public static final String CONFIG_NAME = "knoxambience_autotest.txt";

    /**
     * True while the loading screen of a test run is up. Patch_Mouse_isButtonDown then reports the left
     * button as held, which answers the "click to start" prompt.
     * Public: advice code is copied into game classes and reads it from there.
     */
    public static volatile boolean clickThroughLoading;

    private static Boolean active;

    private AutoTest() {}

    /** Whether a test run was requested for this game session. Read once, then cached. */
    public static boolean active() {
        if (active == null) active = readActive();
        return active;
    }

    public static Path configFile() {
        return Path.of(ZomboidFileSystem.instance.getCacheDir(), "Lua", CONFIG_NAME);
    }

    // Called by Patch_GameLoadingState_enter / _exit.
    public static void onLoadingEnter() {
        if (active()) {
            clickThroughLoading = true;
            System.out.println(Main.TAG + "test run: will skip the click-to-start prompt");
        }
    }

    public static void onLoadingExit() {
        clickThroughLoading = false;
    }

    private static boolean readActive() {
        try {
            Path file = configFile();
            if (!Files.isRegularFile(file)) return false;
            List<String> lines = Files.readAllLines(file, StandardCharsets.UTF_8);
            for (String line : lines) {
                line = line.trim();
                if (line.startsWith("expires=")) {
                    long expires = Long.parseLong(line.substring("expires=".length()).trim());
                    if (System.currentTimeMillis() > expires) {
                        System.out.println(Main.TAG + "ignoring expired " + file);
                        return false;
                    }
                    return true;
                }
            }
            System.out.println(Main.TAG + "ignoring " + file + ": no expires= line");
        } catch (IOException | RuntimeException e) {
            System.out.println(Main.TAG + "cannot read test config: " + e);
        }
        return false;
    }
}
