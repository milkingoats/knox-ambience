#version 330

// Knox Ambience grade: one full-screen pass in the final stage, after Viewpoint's own tone
// mapping, on the display-ready image. Viewpoint keeps all of its lighting, shadows, clouds and
// fog; this pass changes the mood on top. In order:
//
// - Crack fill: hairline gaps in the geometry (where a ceiling meets a wall, or roof pieces meet)
//   let the far background or sky show through as a thin jagged line. A pixel that is much
//   further away than the pixels on both sides of it is filled from them.
// - Horizon blend: distant land fades into the actual sky colour just above it, read from the
//   frame itself, so the far world melts into a sunset by day and into the dark sky at night,
//   instead of standing out as a pale fog wall.
// - Rain fog: extra fog when it rains, pulled closer the harder it rains.
// - Night vision: dark nights are lifted gently, like eyes adjusted to the dark. Driven by the
//   time of day only, so it never flickers as things move on screen. The sky is left alone.
// - Light spill and lamp halos: bright areas (a lit doorway, a lamp, a window) bleed soft light
//   into the dark around them, and the brightest get a warm halo.
// - Colour: weather-driven saturation (clear is vivid, rain is muted), neutral darks, silver
//   moonlight, split tone (cool teal shadows, warm light), golden hour at sunrise and sunset.
// - Tone: clarity (local contrast), contrast eased off towards white, soft highlight shoulder,
//   and a faint shadow floor so silhouettes stay readable.
// - Night mood: optional extra darkness, warm lit pools, glowing windows.
// - Vignette and dither.
//
// Viewpoint sets uniforms by name and skips any it doesn't know, which then read as 0. Every
// effect here treats 0 as "clear day", so a missing uniform gives a plain look, never a broken one.

#ifndef OPTION_KNOX_HORIZON_BLEND
#define OPTION_KNOX_HORIZON_BLEND 0.7
#endif
#ifndef OPTION_KNOX_RAIN_FOG
#define OPTION_KNOX_RAIN_FOG 1.0
#endif
#ifndef OPTION_KNOX_NIGHT_FULL
#define OPTION_KNOX_NIGHT_FULL 0.3
#endif
#ifndef OPTION_KNOX_ADAPTATION
#define OPTION_KNOX_ADAPTATION 0.6
#endif
#ifndef OPTION_KNOX_LIGHT_SPILL
#define OPTION_KNOX_LIGHT_SPILL 0.5
#endif
#ifndef OPTION_KNOX_LAMP_HALO
#define OPTION_KNOX_LAMP_HALO 0.5
#endif
#ifndef OPTION_KNOX_SHADOW_LIFT
#define OPTION_KNOX_SHADOW_LIFT 0.4
#endif
#ifndef OPTION_KNOX_CLARITY
#define OPTION_KNOX_CLARITY 0.3
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
#ifndef OPTION_KNOX_GOLDEN_HOUR
#define OPTION_KNOX_GOLDEN_HOUR 0.6
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
uniform vec3 uFogColor;       // Viewpoint's fog colour (follows the sky); 0 if not set
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

bool knoxIsSky(vec2 uv) {
    if (textureLod(uDepth, uv, 0.0).r < 1.0) return false;
    return uFarRange.x <= 0.0 || textureLod(uFarDepth, uv, 0.0).r >= 1.0;
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

// Night amount. Prefer Viewpoint's uNight; if a pass doesn't get it, fall back to the sun
// being below the horizon. An unset uSunDir (all zero) counts as day.
float knoxNight() {
    float fromSun = length(uSunDir) > 0.5 ? 1.0 - smoothstep(-0.12, 0.08, uSunDir.y) : 0.0;
    // In game uNight read 0.26-0.36 at full night (B42.21, Viewpoint 0.1.6.1), so rescale it.
    float fromViewpoint = smoothstep(0.0, OPTION_KNOX_NIGHT_FULL, uNight);
    return clamp(max(fromViewpoint, fromSun), 0.0, 1.0);
}

// How much of a golden hour it is: the sun near the horizon, on either side of sunrise or sunset.
float knoxGoldenHour() {
    if (length(uSunDir) < 0.5) return 0.0;
    float y = uSunDir.y;
    return smoothstep(-0.08, 0.04, y) * (1.0 - smoothstep(0.12, 0.4, y));
}

// The sky colour just above this pixel: walks up the screen to the first sky pixel and takes the
// darkest of three taps across, so a star or the moon never becomes the fog colour. Returns
// alpha 0 when no sky is found (looking down at the ground).
vec4 knoxSkyAbove(vec2 uv) {
    vec2 texel = 1.0 / vec2(textureSize(uColor, 0));
    for (int i = 1; i <= 8; i++) {
        vec2 p = vec2(uv.x, uv.y + float(i * i) * 0.006);
        if (p.y > 0.995) break;
        if (knoxIsSky(p)) {
            p.y = min(p.y + 0.01, 0.995);
            vec3 a = textureLod(uColor, p, 0.0).rgb;
            vec3 b = textureLod(uColor, p + vec2(6.0 * texel.x, 0.0), 0.0).rgb;
            vec3 c = textureLod(uColor, p - vec2(6.0 * texel.x, 0.0), 0.0).rgb;
            vec3 sky = knoxLuma(a) < knoxLuma(b) ? a : b;
            sky = knoxLuma(sky) < knoxLuma(c) ? sky : c;
            return vec4(sky, 1.0);
        }
    }
    return vec4(0.0);
}

// Light from bright areas nearby on screen. Returns the soft spill colour from the wider rings
// (anything clearly lit); halo is the glow from the inner rings, only from very bright pixels
// (lamps, lit windows, fires).
vec3 knoxSpill(vec2 uv, out vec3 halo) {
    vec2 size = vec2(textureSize(uColor, 0));
    vec2 aspect = vec2(size.y / size.x, 1.0);
    vec3 spill = vec3(0.0);
    halo = vec3(0.0);
    for (int i = 0; i < 12; i++) {
        float a = float(i) * 0.5235988 + 0.26;
        vec2 dir = vec2(cos(a), sin(a)) * aspect;
        vec3 c0 = textureLod(uColor, uv + dir * 0.018, 0.0).rgb;
        vec3 c1 = textureLod(uColor, uv + dir * 0.05, 0.0).rgb;
        vec3 c2 = textureLod(uColor, uv + dir * 0.11, 0.0).rgb;
        halo += c0 * smoothstep(0.55, 0.95, knoxLuma(c0)) * 1.4
              + c1 * smoothstep(0.55, 0.95, knoxLuma(c1)) * 0.6;
        spill += c1 * smoothstep(0.25, 0.75, knoxLuma(c1))
               + c2 * smoothstep(0.25, 0.75, knoxLuma(c2));
    }
    halo /= 24.0;
    return spill / 24.0;
}

// Linear distance for crack tests; sky counts as very far.
float knoxCrackDistance(vec2 uv) {
    float d = knoxSceneDistance(uv);
    return d < 0.0 ? 1.0e6 : d;
}

// Fills one- and two-pixel cracks: if this pixel is much further away than both neighbours on
// either side (left/right or above/below) and those neighbours agree with each other, it's a gap
// in a surface, so take their colour. Returns the colour, and the surface distance in w (or the
// original distance when nothing was filled).
vec4 knoxFillCracks(vec3 color, float dist) {
    float centre = dist < 0.0 ? 1.0e6 : dist;
    vec2 texel = 1.0 / vec2(textureSize(uColor, 0));
    for (int s = 1; s <= 2; s++) {
        for (int axis = 0; axis < 2; axis++) {
            vec2 o = axis == 0 ? vec2(texel.x * float(s), 0.0) : vec2(0.0, texel.y * float(s));
            float a = knoxCrackDistance(vUv + o);
            float b = knoxCrackDistance(vUv - o);
            float near = max(a, b);
            if (near < 200.0 && centre > near * 1.25 + 0.5 && abs(a - b) < 0.15 * near + 0.3) {
                vec3 fill = 0.5 * (textureLod(uColor, vUv + o, 0.0).rgb + textureLod(uColor, vUv - o, 0.0).rgb);
                return vec4(fill, 0.5 * (a + b));
            }
        }
    }
    return vec4(color, dist);
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

    float dist = knoxSceneDistance(vUv);

    // Crack fill, before anything reads this pixel's colour or distance.
    vec4 filled = knoxFillCracks(color, dist);
    color = filled.rgb;
    dist = filled.w;
    float sky = dist < 0.0 ? 1.0 : 0.0;
    vec2 fogRange = uFogRange.y > uFogRange.x + 1.0 ? uFogRange : vec2(30.0, 300.0);

    // Horizon blend: distant land takes on the sky colour right above it. At night this pulls the
    // far world down into the dark sky instead of leaving a glowing band.
    float farness = 0.0;
    if (dist > fogRange.x * 0.5) {
        vec4 skyAbove = knoxSkyAbove(vUv);
        float t = smoothstep(fogRange.x * 0.5, fogRange.y * 1.5, dist);
        farness = t;
        if (skyAbove.a > 0.0) {
            float blend = t * OPTION_KNOX_HORIZON_BLEND * mix(0.75, 1.0, night);
            color = mix(color, skyAbove.rgb, clamp(blend, 0.0, 0.95));
        }
    }

    // Rain fog on top of Viewpoint's own fog. Starts at a share of Viewpoint's fog start and
    // thickens with distance; no rain, no extra fog.
    if (rain > 0.0 && dist >= 0.0) {
        float start = fogRange.x * (1.0 - 0.7 * rain);
        float t = max(dist - start, 0.0) / (fogRange.y - start);
        float fog = (1.0 - exp(-3.0 * t * t)) * rain * clamp(OPTION_KNOX_RAIN_FOG, 0.0, 2.0) * 0.6;
        // Viewpoint's own fog colour when we get it, so rain fog matches the sky; grey otherwise.
        vec3 baseFog = dot(uFogColor, vec3(1.0)) > 0.03 ? mix(uFogColor, vec3(knoxLuma(uFogColor)), 0.3)
                                                         : vec3(0.52, 0.54, 0.56);
        vec3 fogColor = mix(baseFog, vec3(0.025, 0.026, 0.028), night);
        color = mix(color, fogColor, clamp(fog, 0.0, 0.9));
    }

    // The sky keeps Viewpoint's own colours (sunsets, clouds, stars); only golden hour touches it.
    vec3 ungraded = color;

    // Night vision: lift shadows and mid-tones at night with a curve that leaves highlights alone,
    // so lamps keep their punch. Depends only on the time of day, so it's steady frame to frame,
    // and fades out with distance so the far world stays sunk into the night sky.
    float gain = 1.0 + 1.4 * OPTION_KNOX_ADAPTATION * night * (1.0 - farness);
    color = color * gain / (1.0 + color * (gain - 1.0));

    // Light spill into darker pixels, and warm halos around the brightest lights.
    vec3 halo;
    vec3 spill = knoxSpill(vUv, halo);
    float spillRoom = 1.0 - smoothstep(0.05, 0.45, knoxLuma(color));
    color += spill * OPTION_KNOX_LIGHT_SPILL * (0.3 + 0.7 * night) * 0.45 * spillRoom * (1.0 - farness);
    color += halo * vec3(1.0, 0.85, 0.65) * OPTION_KNOX_LAMP_HALO * (0.25 + 0.75 * night) * 0.5;

    // Clarity: a little local contrast against a small blur, so surfaces read crisp. Eased off
    // at night, where it would make grass shimmer.
    {
        vec2 t = 2.0 / vec2(textureSize(uColor, 0));
        vec3 blur = (textureLod(uColor, vUv + vec2(t.x, 0.0), 0.0).rgb
                   + textureLod(uColor, vUv - vec2(t.x, 0.0), 0.0).rgb
                   + textureLod(uColor, vUv + vec2(0.0, t.y), 0.0).rgb
                   + textureLod(uColor, vUv - vec2(0.0, t.y), 0.0).rgb) * 0.25;
        float detail = knoxLuma(texture(uColor, vUv).rgb) - knoxLuma(blur);
        color += clamp(detail, -0.08, 0.08) * OPTION_KNOX_CLARITY * (1.0 - 0.7 * night) * (1.0 - farness);
    }

    // Weather-driven mood: clear weather keeps full colour, rain and wet weather fade towards the
    // muted Knox look.
    float muted = clamp(max(rainNow * 4.0, uWet * 0.7), 0.0, 1.0);

    // Colour, draining a little at night. Warm colours (lamps, fire, wood, brick, skin) keep more
    // of theirs than cool ones, so the muting reads as cool outdoors against warm shelter.
    float warmHue = clamp((color.r - color.b) * 3.0, 0.0, 1.0);
    float sat = mix(1.02, OPTION_KNOX_SATURATION, muted) * (1.0 - OPTION_KNOX_NIGHT_NEUTRAL * night * (1.0 - warmHue));
    sat = mix(sat, max(sat, 1.0), warmHue * OPTION_KNOX_WARMTH);
    color = mix(vec3(knoxLuma(color)), color, sat);

    // Dark areas lose their colour cast whatever the time of day says (dusk skies tint the shadows
    // purple or blue). Warm light keeps its colour.
    float darkness = 1.0 - smoothstep(0.03, 0.3, knoxLuma(color));
    color = mix(color, vec3(knoxLuma(color)), OPTION_KNOX_NIGHT_NEUTRAL * 0.8 * darkness * (1.0 - warmHue));
    // Moonlight: at night, blue and purple casts (blue above green) turn a soft silver instead, so
    // roads and siding read moonlit rather than violet or lavender.
    float coolCast = clamp(max(color.b - color.g, color.r - color.g) * 4.0, 0.0, 1.0) * (1.0 - warmHue);
    vec3 silver = vec3(knoxLuma(color)) * vec3(0.97, 1.0, 1.04);
    color = mix(color, silver, OPTION_KNOX_NIGHT_NEUTRAL * 0.8 * night * coolCast);

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

    // Split tone: shadows a touch cool teal, light a touch warm, scaled by brightness.
    float toneLuma = knoxLuma(color);
    float split = OPTION_KNOX_WARMTH / 0.35 * 0.5;
    color *= mix(vec3(1.0), mix(vec3(0.93, 1.0, 1.01), vec3(1.04, 1.0, 0.95), smoothstep(0.1, 0.6, toneLuma)), split);

    color = mix(color, ungraded, sky);

    // Golden hour: rose-gold sky and sunlit surfaces, deep cool shadows.
    float golden = knoxGoldenHour() * OPTION_KNOX_GOLDEN_HOUR * (1.0 - 0.7 * muted);
    if (golden > 0.0) {
        float gl = knoxLuma(color);
        vec3 sunlit = color * vec3(1.16, 0.97, 0.82);
        vec3 shade = color * vec3(0.88, 0.97, 1.02);
        vec3 graded = mix(shade, sunlit, smoothstep(0.08, 0.5, gl));
        // The sky gets a rose glow, strongest near the horizon (lower on screen).
        vec3 skyGlow = color * vec3(1.22, 0.9, 0.86) + vec3(0.04, 0.012, 0.0);
        graded = sky > 0.5 ? mix(graded, skyGlow, smoothstep(0.95, 0.35, vUv.y)) : graded;
        color = mix(color, graded, golden);
    }

    // Rain: flatter, dimmer light. Follows the live rain, not wetness (which stays high indoors
    // and after a shower), and fades out at close range so interiors stay crisp. Eased off where
    // the scene is already dark, so stormy nights aren't dimmed twice.
    float outside = sky > 0.5 ? 1.0 : smoothstep(3.0, 15.0, dist);
    float gloom = OPTION_KNOX_RAIN_GLOOM * smoothstep(0.0, 0.25, rainNow) * outside
                * smoothstep(0.03, 0.35, knoxLuma(color));
    color = mix(color, vec3(knoxLuma(color)), gloom * 0.5);
    color *= 1.0 - gloom * 0.4;

    // Optional extra night darkness (off by default) with light falloff: dim pixels lose more than
    // lit ones. Pixels that are already near-black skip the falloff.
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
    color += toe * 0.035 * OPTION_KNOX_SHADOW_LIFT * vec3(0.97, 1.0, 1.04) * (1.0 - sky) * (1.0 - farness);

    // Gentle vignette to frame the view.
    vec2 v = vUv - 0.5;
    color *= 1.0 - OPTION_KNOX_VIGNETTE * smoothstep(0.15, 0.75, dot(v, v) * 2.0);

    color += (knoxNoise(gl_FragCoord.xy) - 0.5) / 255.0;
    fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
