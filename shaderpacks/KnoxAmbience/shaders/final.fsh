#version 330 compatibility

// Colour grading and night. Darkness falls hardest on dim pixels so lamps and flashlights keep
// their pools of light while everything around them sinks (light falloff). Night stays neutral
// grey: the cool overcast tint fades out after dusk instead of turning the scene blue.

#include "/settings.glsl"
#include "/lib/common.glsl"

uniform sampler2D colortex0;
uniform float sunAngle;
uniform float rainStrength;
uniform float wetness;

layout(location = 0) out vec4 outColor;

void main() {
    vec3 color = texelFetch(colortex0, ivec2(gl_FragCoord.xy), 0).rgb;

#if DEBUG_VIEW == 2
    vec2 texcoord = gl_FragCoord.xy / vec2(textureSize(colortex0, 0));
    if (texcoord.y > 0.9) {
        float v = texcoord.y > 0.966 ? sunAngle : texcoord.y > 0.933 ? rainStrength : wetness;
        color = texcoord.x < v ? vec3(1.0, 0.8, 0.1) : vec3(0.1);
        outColor = vec4(color, 1.0);
        return;
    }
#endif

#if DEBUG_VIEW == 0
    float night = nightFactor(sunAngle);
    float rain = max(rainStrength, wetness * 0.5);

    float luma = lumaOf(color);
    color = mix(vec3(luma), color, SATURATION * (1.0 - 0.35 * night));
    color = (color - 0.5) * CONTRAST + 0.5;

    // Cool overcast tint by day only.
    color = mix(color, color * vec3(0.92, 0.97, 1.05), TINT_STRENGTH * (1.0 - night));

    // Rain: flatter, dimmer light.
    color = mix(color, vec3(lumaOf(color)), RAIN_GLOOM * rain * 0.5);
    color *= 1.0 - RAIN_GLOOM * rain * 0.4;

    // Night with light falloff: dim pixels lose more than bright ones.
    float lit = smoothstep(0.05, 0.6, lumaOf(color));
    float darken = NIGHT_DARKNESS * 0.6 * (1.0 + LIGHT_FALLOFF * (1.0 - lit));
    color *= 1.0 - night * clamp(darken, 0.0, 0.95);

    // Dither so the dark fog gradients don't band.
    color += (ign(gl_FragCoord.xy) - 0.5) / 255.0;
#endif

    outColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
