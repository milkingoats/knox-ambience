package knoxautotest;

import me.zed_0xff.zombie_buddy.Patch;
import zombie.core.physics.CarController;

/**
 * Test runs only: let {@link AutoDrive} steer, accelerate and brake.
 *
 * updateControls() reads the keyboard into the controller's public clientControls each frame. After it
 * returns, AutoDrive overwrites those controls while the Lua side has the autopilot switched on.
 */
@Patch(className = "zombie.core.physics.CarController", methodName = "updateControls")
public class Patch_CarController_updateControls {
    @Patch.OnExit
    public static void exit(@Patch.This Object self) {
        if (AutoTest.active()) AutoDrive.control((CarController) self);
    }
}
