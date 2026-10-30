package knoxambience;

import java.lang.instrument.Instrumentation;
import java.lang.reflect.Field;
import java.lang.reflect.Method;

import net.bytebuddy.agent.builder.AgentBuilder;
import net.bytebuddy.asm.MemberSubstitution;
import net.bytebuddy.description.method.MethodDescription;
import net.bytebuddy.matcher.ElementMatcher;
import net.bytebuddy.utility.JavaModule;

import static net.bytebuddy.matcher.ElementMatchers.named;

/**
 * Foundation: swap one method call inside one game method for a call to our own static method.
 *
 * Why this exists: ZombieBuddy's @Patch advice can only run code before or after a whole method.
 * Some fixes must change a single call in the middle of a method, for example a fixed
 * Thread.sleep(140). ByteBuddy's MemberSubstitution does exactly that, and ZombieBuddy already
 * bundles ByteBuddy. We only need the JVM's Instrumentation object, which ZombieBuddy keeps.
 *
 * Rules for the replacement method:
 *  - It must be public static.
 *  - Its parameters must match the original call. For an instance call, the receiver comes first.
 *  - Its return type must match the original call.
 *
 * Every failure is logged and returns false. The game then keeps its stock code.
 */
public final class CallSwap {
    private CallSwap() {}

    // ZombieBuddy 2.3.x stores the agent's Instrumentation in this package-private static field.
    // It is not public API, so we read it by reflection and handle a missing field cleanly.
    private static final String ZB_LOADER = "me.zed_0xff.zombie_buddy.Loader";
    private static final String ZB_INST_FIELD = "g_instrumentation";

    private static Instrumentation instrumentation() {
        try {
            Field f = Class.forName(ZB_LOADER).getDeclaredField(ZB_INST_FIELD);
            f.setAccessible(true);
            return (Instrumentation) f.get(null);
        } catch (ReflectiveOperationException | RuntimeException e) {
            System.out.println(Main.TAG + "CallSwap: cannot get Instrumentation from ZombieBuddy: " + e);
            return null;
        }
    }

    /**
     * Replaces each call that matches {@code call} inside {@code targetClass.inMethod} with a call to
     * {@code replacement}. This works for classes that are already loaded (retransformation) and
     * for classes that load later.
     *
     * @param label a short name for the log
     * @return true if the transformer was installed without errors
     */
    public static boolean replace(String label, String targetClass, String inMethod,
                                  ElementMatcher<? super MethodDescription> call, Method replacement) {
        Instrumentation inst = instrumentation();
        if (inst == null || !inst.isRetransformClassesSupported()) {
            System.out.println(Main.TAG + label + ": no retransform support, skipped");
            return false;
        }

        // Code is swapped into the game class, so the game class's class loader must find our
        // replacement class. ZombieBuddy makes mod classes visible this way, but we check it first.
        // A swap that the game cannot link would crash the game later, not here.
        if (!visibleFromGame(replacement.getDeclaringClass())) {
            System.out.println(Main.TAG + label + ": mod classes not visible to the game loader, skipped");
            return false;
        }

        // Error flag, set by the listener below. AgentBuilder reports errors through a callback.
        final boolean[] failed = {false};

        MemberSubstitution swap = MemberSubstitution.relaxed()
                .method(call)
                .replaceWith(replacement);

        try {
            new AgentBuilder.Default()
                    // Retransformation may change method bodies only, never fields or signatures.
                    // A MemberSubstitution changes one call inside a body, so it fits.
                    .disableClassFormatChanges()
                    .with(AgentBuilder.RedefinitionStrategy.RETRANSFORMATION)
                    .with(new AgentBuilder.Listener.Adapter() {
                        @Override
                        public void onError(String typeName, ClassLoader loader, JavaModule module,
                                            boolean loaded, Throwable t) {
                            failed[0] = true;
                            System.out.println(Main.TAG + label + ": transform error in " + typeName + ": " + t);
                        }
                    })
                    .type(named(targetClass))
                    .transform((builder, type, loader, module, domain) ->
                            builder.visit(swap.on(named(inMethod))))
                    .installOn(inst);
        } catch (RuntimeException e) {
            System.out.println(Main.TAG + label + ": install failed: " + e);
            return false;
        }
        return !failed[0];
    }

    /** True if the system class loader (which loads the game) gives back this exact class. */
    private static boolean visibleFromGame(Class<?> ours) {
        try {
            return Class.forName(ours.getName(), false, ClassLoader.getSystemClassLoader()) == ours;
        } catch (ClassNotFoundException e) {
            return false;
        }
    }
}
