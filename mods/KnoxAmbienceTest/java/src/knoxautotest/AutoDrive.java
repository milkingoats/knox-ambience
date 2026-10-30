package knoxautotest;

import org.joml.Vector3f;

import se.krka.kahlua.vm.KahluaTable;
import zombie.Lua.LuaManager;
import zombie.characters.IsoPlayer;
import zombie.core.physics.CarController;
import zombie.network.GameServer;
import zombie.vehicles.BaseVehicle;

/**
 * Autopilot for the drive part of a test run: follows a list of waypoints at a set speed.
 *
 * The Lua side (KnoxAutoTest.lua) owns the run. It switches the autopilot on by setting the global
 * table {@code KnoxAutoDrive} to
 * {@code { active = true, speed = <km/h>, route = { {x=..,y=..}, ... }, index = 1 }}.
 * Each frame this class reads that table and writes the car's controls. It writes back:
 * {@code index} (next waypoint), {@code javaSeen = true}, {@code finished = true} at the last waypoint,
 * and {@code stuck} (how many times it had to back out of something).
 *
 * Only runs on the main thread, from Patch_CarController_updateControls, so Lua tables are safe to touch.
 */
public final class AutoDrive {
    /** Waypoint counts as reached within this many tiles (more at speed, see reachRadius). */
    private static final float REACH_TILES = 6f;
    /** Heading error, in radians, that gives full steering lock. */
    private static final float FULL_LOCK_RAD = 0.6f;
    /** Above this heading error the car slows for the turn. */
    private static final float SHARP_TURN_RAD = 0.7f;
    private static final float TURN_SPEED_KMH = 25f;
    /** Slower than this for STUCK_MS counts as stuck; the car then reverses for REVERSE_MS. */
    private static final float STUCK_KMH = 2f;
    private static final long STUCK_MS = 5000;
    private static final long REVERSE_MS = 2500;

    private static final Vector3f forward = new Vector3f();

    private static long slowSinceMs;
    private static long reverseUntilMs;
    private static float reverseSteer;
    private static boolean wasActive;

    private AutoDrive() {}

    public static void control(CarController controller) {
        if (GameServer.server) return;
        KahluaTable t = table();
        boolean on = t != null && Boolean.TRUE.equals(t.rawget("active"));
        if (!on) {
            wasActive = false;
            return;
        }
        BaseVehicle vehicle = controller.vehicleObject;
        IsoPlayer player = IsoPlayer.getInstance();
        if (player == null || !vehicle.isDriver(player)) return;

        long now = System.currentTimeMillis();
        if (!wasActive) {
            wasActive = true;
            slowSinceMs = now;
            reverseUntilMs = 0;
            t.rawset("javaSeen", Boolean.TRUE);
            System.out.println(Main.TAG + "autopilot on");
        }

        CarController.ClientControls controls = controller.clientControls;
        controls.shift = false;
        controls.brake = false;

        KahluaTable route = t.rawget("route") instanceof KahluaTable r ? r : null;
        int count = route == null ? 0 : route.len();
        int index = Math.max(1, (int) number(t.rawget("index"), 1));
        float speed = vehicle.getCurrentSpeedKmHour();

        if (index > count) {
            // Route done: stop and hold.
            t.rawset("finished", Boolean.TRUE);
            controls.steering = 0f;
            controls.forward = false;
            controls.backward = false;
            controls.brake = true;
            return;
        }

        if (now < reverseUntilMs) {
            controls.forward = false;
            controls.backward = true;
            controls.steering = reverseSteer;
            slowSinceMs = now;
            return;
        }

        float x = vehicle.getX();
        float y = vehicle.getY();
        KahluaTable point = (KahluaTable) route.rawget(index);
        float tx = (float) number(point.rawget("x"), x);
        float ty = (float) number(point.rawget("y"), y);
        float dx = tx - x;
        float dy = ty - y;
        float dist = (float) Math.sqrt(dx * dx + dy * dy);
        if (dist < reachRadius(speed)) {
            t.rawset("index", Double.valueOf(index + 1));
            return;  // aim at the next waypoint from the next frame
        }

        // Heading error between the car's nose and the waypoint. The world plane is (x, z) in the
        // vehicle's physics vectors. The side comes from the game's own left/right test.
        vehicle.getForwardVector(forward);
        float fx = forward.x;
        float fy = forward.z;
        float flen = (float) Math.sqrt(fx * fx + fy * fy);
        float cos = flen < 1e-4f ? 1f : (fx * dx + fy * dy) / (flen * dist);
        float error = (float) Math.acos(Math.max(-1f, Math.min(1f, cos)));
        float side = vehicle.isPointLeftOfCenter(tx, ty) ? -1f : 1f;  // LEFT key is -1 in updateControls
        controls.steering = side * Math.min(1f, error / FULL_LOCK_RAD);

        float target = (float) number(t.rawget("speed"), 50);
        if (error > SHARP_TURN_RAD) target = Math.min(target, TURN_SPEED_KMH);
        controls.forward = speed < target;
        controls.backward = speed > target + 8f;  // backward brakes while rolling forward

        if (Math.abs(speed) < STUCK_KMH) {
            if (now - slowSinceMs > STUCK_MS) {
                reverseUntilMs = now + REVERSE_MS;
                reverseSteer = -controls.steering;
                t.rawset("stuck", Double.valueOf(number(t.rawget("stuck"), 0) + 1));
                System.out.println(Main.TAG + "autopilot stuck near " + (int) x + "," + (int) y + ", backing up");
            }
        } else {
            slowSinceMs = now;
        }
    }

    private static float reachRadius(float speedKmh) {
        return Math.max(REACH_TILES, Math.abs(speedKmh) / 6f);
    }

    private static KahluaTable table() {
        if (LuaManager.env == null) return null;
        return LuaManager.env.rawget("KnoxAutoDrive") instanceof KahluaTable t ? t : null;
    }

    private static double number(Object value, double fallback) {
        return value instanceof Number n ? n.doubleValue() : fallback;
    }
}
