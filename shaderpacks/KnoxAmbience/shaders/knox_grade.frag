#version 330

// Knox Ambience grade: one full-screen pass in the final stage, after Viewpoint's own tone
// mapping, on the display-ready image. Viewpoint keeps all of its lighting, shadows, clouds and
// fog; this pass only changes the mood on top.
//
// - Rain fog: extra grey fog when it rains, pulled closer the harder it rains.
// - Eye adaptation: a dark view (an unlit room, a night street) is brightened, a bright one is
//   left alone, like eyes adjusting. Measured from a coarse grid over the screen each frame.
// - Light spill: bright areas (a lit doorway, a lamp, a window) bleed soft light into the dark
//   around them on screen, so an unlit room next to a lit one isn't pitch black.
// - Shadow lift: the darkest values keep a faint floor, so silhouettes stay readable.
// - Light falloff: night darkens dim pixels harder than lit ones, so lamps and flashlights keep
//   their pools of light.
// - Neutral nights: colour drains out after dusk, so night goes dark, not blue.
// - Cozy warmth: a soft warm cast by day, and warm lamp and flashlight pools at night against the
//   dark, plus soft highlights and a gentle vignette.
// - Rain gloom: rain flattens and dims the light.
//
// Viewpoint sets uniforms by name and skips any it doesn't know, which then read as 0. Every
// effect here treats 0 as "clear day", so a missing uniform gives a plain look, never a broken one.

#ifndef OPTION_KNOX_RAIN_FOG
#define OPTION_KNOX_RAIN_FOG 1.0
#endif
#ifndef OPTION_KNOX_NIGHT_FULL
#define OPTION_KNOX_NIGHT_FULL 0.3
#endif
#ifndef OPTION_KNOX_NIGHT_DARKNESS
#define OPTION_KNOX_NIGHT_DARKNESS 0.0
#endif
#ifndef OPTION_KNOX_LIGHT_FALLOFF
#define OPTION_KNOX_LIGHT_FALLOFF 0.0
#endif
#ifndef OPTION_KNOX_NIGHT_NEUTRAL
#define OPTION_KNOX_NIGHT_NEUTRAL 0.5
#endif
#ifndef OPTION_KNOX_ADAPTATION
#define OPTION_KNOX_ADAPTATION 0.6
#endif
#ifndef OPTION_KNOX_LIGHT_SPILL
#define OPTION_KNOX_LIGHT_SPILL 0.5
#endif
#ifndef OPTION_KNOX_SHADOW_LIFT
#define OPTION_KNOX_SHADOW_LIFT 0.4
#endif
#ifndef OPTION_KNOX_SATURATION
#define OPTION_KNOX_SATURATION 0.9
#endif
#ifndef OPTION_KNOX_CONTRAST
#define OPTION_KNOX_CONTRAST 1.05
#endif
#ifndef OPTION_KNOX_HIGHLIGHTS
#define OPTION_KNOX_HIGHLIGHTS 0.5
#endif
#ifndef OPTION_KNOX_WARMTH
#define OPTION_KNOX_WARMTH 0.35
#endif
#ifndef OPTION_KNOX_WINDOW_GLOW
#define OPTION_KNOX_WINDOW_GLOW 0.6
#endif
#ifndef OPTION_KNOX_VIGNETTE
#define OPTION_KNOX_VIGNETTE 0.25
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
uniform sampler2D uDepth;     // non-linear 0..1, 1 = sky or distant world
uniform sampler2D uFarDepth;  // Viewpoint's distant world (far terrain, shells, trees)
uniform vec2 uFarRange;       // near and far planes of the distant world; x <= 0 when off
uniform vec4 uCamera;         // x = near, y = far
uniform vec2 uFogRange;       // Viewpoint's fog start and end distance
uniform vec3 uSunDir;         // unit vector, y up
uniform float uNight;         // 0 day .. about 0.3 full night
uniform float uRainStrength;  // 0 .. 1
uniform float uRain;          // 0 .. 1, the name Viewpoint's weather shaders use
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

float knoxLinearize(float d, float n, float f) {
    n = max(n, 0.01);
    f = max(f, n + 1.0);
    float z = d * 2.0 - 1.0;
    return (2.0 * n * f) / (f + n - z * (f - n));
}

float knoxLinearDepth(float d) {
    return knoxLinearize(d, uCamera.x, uCamera.y);
}

// Distance to what's drawn at this pixel, near world first, then Viewpoint's distant world.
// Returns -1 for sky.
float knoxSceneDistance(vec2 uv) {
    float d = texture(uDepth, uv).r;
    if (d < 1.0) return knoxLinearDepth(d);
    if (uFarRange.x > 0.0) {
        float fd = texture(uFarDepth, uv).r;
        if (fd < 1.0) return knoxLinearize(fd, uFarRange.x, uFarRange.y);
    }
    return -1.0;
}

// Average brightness of the view, from a 6 x 4 grid of taps over the middle of the screen.
// Each tap is capped so one lamp or window in view doesn't count as a bright scene.
float knoxSceneLuma() {
    float sum = 0.0;
    for (int y = 0; y < 4; y++) {
        for (int x = 0; x < 6; x++) {
            vec2 uv = vec2(0.12 + 0.152 * float(x), 0.15 + 0.233 * float(y));
            sum += min(knoxLuma(textureLod(uColor, uv, 0.0).rgb), 0.6);
        }
    }
    return sum / 24.0;
}

// Light from bright areas nearby on screen: two rings of taps, weighted towards bright pixels,
// so a lit doorway or lamp casts a soft glow into the dark around it.
vec3 knoxSpill(vec2 uv) {
    vec2 size = vec2(textureSize(uColor, 0));
    vec2 aspect = vec2(size.y / size.x, 1.0);
    vec3 sum = vec3(0.0);
    float weight = 0.0;
    for (int i = 0; i < 8; i++) {
        float a = float(i) * 0.7853982 + 0.39;
        vec2 dir = vec2(cos(a), sin(a)) * aspect;
        for (int r = 0; r < 2; r++) {
            vec3 c = textureLod(uColor, uv + dir * (r == 0 ? 0.045 : 0.11), 0.0).rgb;
            float l = knoxLuma(c);
            float w = smoothstep(0.2, 0.7, l);
            sum += c * w;
            weight += 1.0;
        }
    }
    return sum / weight;
}

// Night amount. Prefer Viewpoint's uNight; if a pass doesn't get it, fall back to the sun
// being below the horizon. An unset uSunDir (all zero) counts as day.
float knoxNight() {
    float fromSun = length(uSunDir) > 0.5 ? 1.0 - smoothstep(-0.12, 0.08, uSunDir.y) : 0.0;
    // In game uNight read 0.26-0.3 at full night (B42.21, Viewpoint 0.1.6.1), so rescale it.
    float fromViewpoint = smoothstep(0.0, OPTION_KNOX_NIGHT_FULL, uNight);
    return clamp(max(fromViewpoint, fromSun), 0.0, 1.0);
}

void main() {
    vec3 color = texture(uColor, vUv).rgb;
    float night = knoxNight();
    float rainNow = max(uRainStrength, uRain);
    float rain = clamp(max(rainNow, uWet * 0.5), 0.0, 1.0);

#if OPTION_KNOX_DEBUG == OPTION_KNOX_DEBUG_BARS
    // Bars along the top, from the top down: uNight, the pack's night, rain (uRainStrength or uRain), uWet.
    if (vUv.y > 0.88) {
        float v = vUv.y > 0.97 ? uNight : vUv.y > 0.94 ? knoxNight() : vUv.y > 0.91 ? rainNow : uWet;
        fragColor = vec4(vUv.x < v ? vec3(1.0, 0.8, 0.1) : vec3(0.1), 1.0);
        return;
    }
#elif OPTION_KNOX_DEBUG == OPTION_KNOX_DEBUG_DEPTH
    // Distance on a log scale (1 m dark .. 4 km white); sky is red.
    float dbgDist = knoxSceneDistance(vUv);
    fragColor = vec4(dbgDist < 0.0 ? vec3(0.6, 0.1, 0.1) : vec3(clamp(log2(max(dbgDist, 1.0)) / 12.0, 0.0, 1.0)), 1.0);
    return;
#endif

    // Rain fog on top of Viewpoint's own fog. Starts at a share of Viewpoint's fog start and
    // thickens with distance; no rain, no extra fog.
    float dist = knoxSceneDistance(vUv);
    if (rain > 0.0 && dist >= 0.0) {
        vec2 range = uFogRange.y > uFogRange.x + 1.0 ? uFogRange : vec2(30.0, 300.0);
        float start = range.x * (1.0 - 0.7 * rain);
        float t = max(dist - start, 0.0) / (range.y - start);
        float fog = (1.0 - exp(-3.0 * t * t)) * rain * clamp(OPTION_KNOX_RAIN_FOG, 0.0, 2.0) * 0.6;
        vec3 fogColor = mix(vec3(0.52, 0.54, 0.56), vec3(0.025, 0.026, 0.028), night);
        color = mix(color, fogColor, clamp(fog, 0.0, 0.9));
    }

    // Eye adaptation: brighten dark views towards a readable level, with a curve that lifts
    // shadows and mid-tones but leaves highlights where they are.
    float sceneLuma = knoxSceneLuma();
    float gain = clamp(0.11 / max(sceneLuma, 0.005), 1.0, 1.0 + 1.6 * OPTION_KNOX_ADAPTATION);
    color = color * gain / (1.0 + color * (gain - 1.0));

    // Light spill into darker pixels only; strongest at night, gentle by day.
    vec3 spill = knoxSpill(vUv) * gain;
    float spillRoom = 1.0 - smoothstep(0.05, 0.45, knoxLuma(color));
    color += spill * OPTION_KNOX_LIGHT_SPILL * (0.35 + 0.65 * night) * 0.35 * spillRoom;

    // The sky gets half the grade, so Viewpoint's clouds stay soft and pale instead of smudging grey.
    vec3 ungraded = color;
    float sky = dist < 0.0 ? 0.5 : 0.0;

    // Muted colour, draining further at night so nights go grey-dark rather than blue.
    // Warm colours (lamps, fire, wood, brick, skin) keep more of their colour than cool ones, so
    // the muting reads as cool outdoors against warm shelter rather than drained.
    float warmHue = clamp((color.r - color.b) * 3.0, 0.0, 1.0);
    float sat = OPTION_KNOX_SATURATION * (1.0 - OPTION_KNOX_NIGHT_NEUTRAL * night * (1.0 - warmHue));
    sat = mix(sat, max(sat, 1.0), warmHue * OPTION_KNOX_WARMTH);
    color = mix(vec3(knoxLuma(color)), color, sat);

    // Dark areas lose their colour cast whatever the time of day says (dusk skies tint the shadows
    // purple or blue). Warm light keeps its colour.
    float darkness = 1.0 - smoothstep(0.03, 0.3, knoxLuma(color));
    color = mix(color, vec3(knoxLuma(color)), OPTION_KNOX_NIGHT_NEUTRAL * 0.8 * darkness * (1.0 - warmHue));
    // Moonlight: at night, blue and purple casts (blue above green) turn a soft silver instead, so
    // roads and siding read moonlit rather than violet.
    float coolCast = clamp((color.b - color.g) * 4.0, 0.0, 1.0) * (1.0 - warmHue);
    vec3 silver = vec3(knoxLuma(color)) * vec3(0.97, 1.0, 1.04);
    color = mix(color, silver, OPTION_KNOX_NIGHT_NEUTRAL * 0.7 * night * coolCast);
    // Contrast around mid-grey, eased off towards white so skies and pale roads keep detail
    // instead of clipping.
    vec3 contrasted = (color - 0.5) * OPTION_KNOX_CONTRAST + 0.5;
    color = mix(contrasted, color, smoothstep(0.6, 0.95, knoxLuma(color)));

    // Gentle highlight shoulder: compress the top end so overcast light reads soft, not bleached.
    float hl = knoxLuma(color);
    if (hl > 0.7) {
        float target = 0.7 + (hl - 0.7) / (1.0 + (hl - 0.7) * OPTION_KNOX_HIGHLIGHTS * 4.0);
        color *= target / hl;
    }

    // Warm cast by day.
    color = mix(color, color * vec3(1.05, 1.0, 0.92), OPTION_KNOX_WARMTH * (1.0 - night));

    color = mix(color, ungraded, sky);

    // Rain: flatter, dimmer light. Follows the live rain, not wetness (which stays high indoors
    // and after a shower), and fades out at close range so interiors stay crisp. Eased off where
    // the scene is already dark, so stormy nights aren't dimmed twice.
    float outside = dist < 0.0 ? 1.0 : smoothstep(3.0, 15.0, dist);
    float gloom = OPTION_KNOX_RAIN_GLOOM * smoothstep(0.0, 0.25, rainNow) * outside
                * smoothstep(0.03, 0.35, knoxLuma(color));
    color = mix(color, vec3(knoxLuma(color)), gloom * 0.5);
    color *= 1.0 - gloom * 0.4;

    // Night with light falloff: dim pixels lose more than lit ones. Pixels that are already
    // near-black skip the falloff, so dark halls aren't crushed further.
    float nightLuma = knoxLuma(color);
    float lit = smoothstep(0.05, 0.6, nightLuma);
    float nearBlack = 1.0 - smoothstep(0.0, 0.08, nightLuma);
    float falloff = OPTION_KNOX_LIGHT_FALLOFF * (1.0 - lit) * (1.0 - nearBlack);
    float darken = OPTION_KNOX_NIGHT_DARKNESS * 0.6 * (1.0 + falloff);
    color *= 1.0 - night * clamp(darken, 0.0, 0.95);

    // Cozy pools: at night, lit pixels lean warm (lamplight, flashlights, windows).
    // Surfaces that are already warm (orange walls, wood) get less, so rooms don't go over-orange.
    float alreadyWarm = clamp((color.r - color.b) / max(color.r, 0.01), 0.0, 1.0);
    color = mix(color, color * vec3(1.12, 0.98, 0.82), OPTION_KNOX_WARMTH * night * lit * (1.0 - 0.6 * alreadyWarm));

    // Inviting windows: at night, warm light sources (lit windows, lamps, fires) glow a little
    // brighter and more golden against the dark.
    float warmLight = smoothstep(0.3, 0.7, knoxLuma(color)) * clamp((color.r - color.b) * 4.0, 0.0, 1.0);
    color += color * vec3(0.35, 0.22, 0.05) * OPTION_KNOX_WINDOW_GLOW * night * warmLight;

    // Shadow lift: a faint floor under the darkest values that fades out by the low mid-tones.
    vec3 toe = pow(clamp(1.0 - color, 0.0, 1.0), vec3(8.0));
    color += toe * 0.035 * OPTION_KNOX_SHADOW_LIFT * vec3(0.97, 1.0, 1.04);

    // Gentle vignette to frame the view.
    vec2 v = vUv - 0.5;
    color *= 1.0 - OPTION_KNOX_VIGNETTE * smoothstep(0.15, 0.75, dot(v, v) * 2.0);

    color += (knoxNoise(gl_FragCoord.xy) - 0.5) / 255.0;
    fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
