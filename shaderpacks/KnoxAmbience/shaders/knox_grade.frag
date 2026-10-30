#version 330

// Knox Ambience grade: one full-screen pass in the final stage, after Viewpoint's own tone
// mapping, on the display-ready image. Viewpoint keeps all of its lighting, shadows, clouds and
// fog; this pass only changes the mood on top.
//
// - Rain fog: extra grey fog when it rains, pulled closer the harder it rains.
// - Light falloff: night darkens dim pixels harder than lit ones, so lamps and flashlights keep
//   their pools of light.
// - Neutral nights: colour drains out after dusk and the cool day tint fades, so night goes dark,
//   not blue.
// - Rain gloom: rain flattens and dims the light.
//
// Viewpoint sets uniforms by name and skips any it doesn't know, which then read as 0. Every
// effect here treats 0 as "clear day", so a missing uniform gives a plain look, never a broken one.

#ifndef OPTION_KNOX_RAIN_FOG
#define OPTION_KNOX_RAIN_FOG 1.0
#endif
#ifndef OPTION_KNOX_NIGHT_DARKNESS
#define OPTION_KNOX_NIGHT_DARKNESS 0.5
#endif
#ifndef OPTION_KNOX_LIGHT_FALLOFF
#define OPTION_KNOX_LIGHT_FALLOFF 0.6
#endif
#ifndef OPTION_KNOX_NIGHT_NEUTRAL
#define OPTION_KNOX_NIGHT_NEUTRAL 0.7
#endif
#ifndef OPTION_KNOX_SATURATION
#define OPTION_KNOX_SATURATION 0.85
#endif
#ifndef OPTION_KNOX_CONTRAST
#define OPTION_KNOX_CONTRAST 1.05
#endif
#ifndef OPTION_KNOX_TINT
#define OPTION_KNOX_TINT 0.3
#endif
#ifndef OPTION_KNOX_RAIN_GLOOM
#define OPTION_KNOX_RAIN_GLOOM 0.3
#endif
// Debug view is an enum option: Viewpoint defines the selected value and one constant per value.
#ifndef OPTION_KNOX_DEBUG_OFF
#define OPTION_KNOX_DEBUG_OFF 0
#endif
#ifndef OPTION_KNOX_DEBUG_BARS
#define OPTION_KNOX_DEBUG_BARS 1
#endif
#ifndef OPTION_KNOX_DEBUG_DEPTH
#define OPTION_KNOX_DEBUG_DEPTH 2
#endif
#ifndef OPTION_KNOX_DEBUG
#define OPTION_KNOX_DEBUG OPTION_KNOX_DEBUG_OFF
#endif

uniform sampler2D uColor;
uniform sampler2D uDepth;     // non-linear 0..1, 1 = sky
uniform vec4 uCamera;         // x = near, y = far
uniform vec2 uFogRange;       // Viewpoint's fog start and end distance
uniform vec3 uSunDir;         // unit vector, y up
uniform float uNight;         // 0 day .. 1 night
uniform float uRainStrength;  // 0 .. 1
uniform float uWet;           // 0 .. 1, lags behind rain

in vec2 vUv;
out vec4 fragColor;

float knoxLuma(vec3 c) {
    return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

// Interleaved gradient noise in [0, 1), to dither banding out of dark gradients.
float knoxNoise(vec2 p) {
    return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

float knoxLinearDepth(float d) {
    float n = max(uCamera.x, 0.01);
    float f = max(uCamera.y, n + 1.0);
    float z = d * 2.0 - 1.0;
    return (2.0 * n * f) / (f + n - z * (f - n));
}

// Night amount. Prefer Viewpoint's uNight; if a pass doesn't get it, fall back to the sun
// being below the horizon. An unset uSunDir (all zero) counts as day.
float knoxNight() {
    float fromSun = length(uSunDir) > 0.5 ? 1.0 - smoothstep(-0.12, 0.08, uSunDir.y) : 0.0;
    return clamp(max(uNight, fromSun), 0.0, 1.0);
}

void main() {
    vec3 color = texture(uColor, vUv).rgb;
    float night = knoxNight();
    float rain = clamp(max(uRainStrength, uWet * 0.5), 0.0, 1.0);

#if OPTION_KNOX_DEBUG == OPTION_KNOX_DEBUG_BARS
    // Bars along the top, from the top down: uNight, sun-based night, uRainStrength, uWet.
    if (vUv.y > 0.88) {
        float v = vUv.y > 0.97 ? uNight : vUv.y > 0.94 ? knoxNight() : vUv.y > 0.91 ? uRainStrength : uWet;
        fragColor = vec4(vUv.x < v ? vec3(1.0, 0.8, 0.1) : vec3(0.1), 1.0);
        return;
    }
#elif OPTION_KNOX_DEBUG == OPTION_KNOX_DEBUG_DEPTH
    float dbgDepth = texture(uDepth, vUv).r;
    fragColor = vec4(vec3(dbgDepth < 1.0 ? knoxLinearDepth(dbgDepth) / max(uCamera.y, 1.0) : 1.0), 1.0);
    return;
#endif

    // Rain fog on top of Viewpoint's own fog. Starts at a share of Viewpoint's fog start and
    // thickens with distance; no rain, no extra fog.
    float depth = texture(uDepth, vUv).r;
    if (rain > 0.0 && depth < 1.0) {
        vec2 range = uFogRange.y > uFogRange.x + 1.0 ? uFogRange : vec2(30.0, 300.0);
        float start = range.x * (1.0 - 0.7 * rain);
        float t = max(knoxLinearDepth(depth) - start, 0.0) / (range.y - start);
        float fog = (1.0 - exp(-3.0 * t * t)) * rain * clamp(OPTION_KNOX_RAIN_FOG, 0.0, 2.0) * 0.6;
        vec3 fogColor = mix(vec3(0.52, 0.54, 0.56), vec3(0.025, 0.026, 0.028), night);
        color = mix(color, fogColor, clamp(fog, 0.0, 0.9));
    }

    // Muted colour, draining further at night so nights go grey-dark rather than blue.
    float sat = OPTION_KNOX_SATURATION * (1.0 - OPTION_KNOX_NIGHT_NEUTRAL * night);
    color = mix(vec3(knoxLuma(color)), color, sat);
    color = (color - 0.5) * OPTION_KNOX_CONTRAST + 0.5;

    // Cool overcast tint by day only.
    color = mix(color, color * vec3(0.92, 0.97, 1.05), OPTION_KNOX_TINT * (1.0 - night));

    // Rain: flatter, dimmer light.
    color = mix(color, vec3(knoxLuma(color)), OPTION_KNOX_RAIN_GLOOM * rain * 0.5);
    color *= 1.0 - OPTION_KNOX_RAIN_GLOOM * rain * 0.4;

    // Night with light falloff: dim pixels lose more than lit ones.
    float lit = smoothstep(0.05, 0.6, knoxLuma(color));
    float darken = OPTION_KNOX_NIGHT_DARKNESS * 0.6 * (1.0 + OPTION_KNOX_LIGHT_FALLOFF * (1.0 - lit));
    color *= 1.0 - night * clamp(darken, 0.0, 0.95);

    color += (knoxNoise(gl_FragCoord.xy) - 0.5) / 255.0;
    fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
