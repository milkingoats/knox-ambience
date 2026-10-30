package knoxautotest;

/**
 * Entry point, run by ZombieBuddy when the mod loads.
 *
 * The test mode is driven by tools/perftest/perf-test.ps1, which writes a config file before it starts
 * the game. Without that file (or once it has expired) every patch here does nothing, so the mod is
 * safe to leave enabled.
 */
public class Main {
    public static final String TAG = "[KnoxAmbienceTest] ";

    public static void main(String[] args) {
        System.out.println(TAG + "loaded. test run "
                + (AutoTest.active() ? "ACTIVE (" + AutoTest.configFile() + ")" : "not requested, staying idle"));
    }
}
