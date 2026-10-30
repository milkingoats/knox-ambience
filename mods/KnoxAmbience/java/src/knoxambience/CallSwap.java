package knoxambience;

import java.lang.instrument.Instrumentation;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import net.bytebuddy.agent.builder.AgentBuilder;
import net.bytebuddy.asm.MemberSubstitution;
import net.bytebuddy.description.method.MethodDescription;
import net.bytebuddy.description.type.TypeDescription;
import net.bytebuddy.matcher.ElementMatcher;
import net.bytebuddy.utility.JavaModule;

import static net.bytebuddy.matcher.ElementMatchers.named;
import static net.bytebuddy.matcher.ElementMatchers.none;

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
 * Every failure is logged and reported as false. The game then keeps its stock code.
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
     * One call to swap: each call that matches {@code call} inside {@code targetClass.inMethod} becomes a call
     * to {@code replacement}.
     *
     * @param label a short name for the log
     */
    public record Swap(String label, String targetClass, String inMethod,
                       ElementMatcher<? super MethodDescription> call, Method replacement) {}

    /**
     * Installs all swaps with a single ByteBuddy transformer. This works for classes that are already loaded
     * (retransformation) and for classes that load later.
     *
     * One transformer, not one per swap: each installed transformer stays for the life of the JVM and looks
     * at every later class load. It is never removed after it fires, because a later retransform by another
     * agent would then drop our swap.
     *
     * @return for each swap's label, true if it was installed without errors
     */
    public static Map<String, Boolean> install(List<Swap> swaps) {
        Map<String, Boolean> result = new LinkedHashMap<>();
        for (Swap s : swaps) result.put(s.label(), false);

        Instrumentation inst = instrumentation();
        if (inst == null || !inst.isRetransformClassesSupported()) {
            for (Swap s : swaps) System.out.println(Main.TAG + s.label() + ": no retransform support, skipped");
            return result;
        }

        // Code is swapped into the game class, so the game class's class loader must find our
        // replacement class. ZombieBuddy makes mod classes visible this way, but we check it first.
        // A swap that the game cannot link would crash the game later, not here.
        Map<String, List<Swap>> byType = new LinkedHashMap<>();
        for (Swap s : swaps) {
            if (!visibleFromGame(s.replacement().getDeclaringClass())) {
                System.out.println(Main.TAG + s.label() + ": mod classes not visible to the game loader, skipped");
                continue;
            }
            byType.computeIfAbsent(s.targetClass(), k -> new ArrayList<>()).add(s);
        }
        if (byType.isEmpty()) return result;

        // Error flags per target class, set by the listener below. AgentBuilder reports errors through a callback.
        Set<String> failed = ConcurrentHashMap.newKeySet();

        ElementMatcher.Junction<TypeDescription> types = none();
        for (String name : byType.keySet()) types = types.or(named(name));

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
                            failed.add(typeName);
                            System.out.println(Main.TAG + "CallSwap: transform error in " + typeName + ": " + t);
                        }
                    })
                    .type(types)
                    .transform((builder, type, loader, module, domain) -> {
                        for (Swap s : byType.getOrDefault(type.getName(), List.of())) {
                            builder = builder.visit(MemberSubstitution.relaxed()
                                    .method(s.call())
                                    .replaceWith(s.replacement())
                                    .on(named(s.inMethod())));
                        }
                        return builder;
                    })
                    .installOn(inst);
        } catch (RuntimeException e) {
            System.out.println(Main.TAG + "CallSwap: install failed: " + e);
            return result;
        }

        for (Map.Entry<String, List<Swap>> e : byType.entrySet()) {
            boolean ok = !failed.contains(e.getKey());
            for (Swap s : e.getValue()) result.put(s.label(), ok);
        }
        return result;
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
