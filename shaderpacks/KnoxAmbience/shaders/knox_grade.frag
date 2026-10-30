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
// - Surface light: sky fill on shadowed up-facing surfaces and warm ground bounce on walls,
//   coloured bounce in ambient-occluded corners, and a soft rim on edges facing away from us.
// - Sun glow: by day the sun and the clouds it lights glow softly over the scene around them,
//   warmer towards sunrise and sunset.
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
#define OPTION_KNOX_ADAPTATION 0.35
#endif
#ifndef OPTION_KNOX_LIGHT_SPILL
#define OPTION_KNOX_LIGHT_SPILL 0.5
#endif
#ifndef OPTION_KNOX_LAMP_HALO
#define OPTION_KNOX_LAMP_HALO 0.5
#endif
#ifndef OPTION_KNOX_SUN_GLOW
#define OPTION_KNOX_SUN_GLOW 0.5
#endif
#ifndef OPTION_KNOX_SKY_FILL
#define OPTION_KNOX_SKY_FILL 0.5
#endif
#ifndef OPTION_KNOX_AO_BOUNCE
#define OPTION_KNOX_AO_BOUNCE 0.5
#endif
#ifndef OPTION_KNOX_RIM
#define OPTION_KNOX_RIM 0.15
#endif
#ifndef OPTION_KNOX_SHADOW_LIFT
#define OPTION_KNOX_SHADOW_LIFT 0.2
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
#ifndef OPTION_KNOX_DEBUG_NORMALS
#define OPTION_KNOX_DEBUG_NORMALS 3
#endif
#ifndef OPTION_KNOX_DEBUG
#define OPTION_KNOX_DEBUG OPTION_KNOX_DEBUG_OFF
#endif

uniform sampler2D uColor;
uniform sampler2D uDepth;     // non-linear 0..1, 1 = sky or distant world
uniform sampler2D uFarDepth;  // Viewpoint's distant world (far terrain, shells, trees)
// Bloom pyramid: knox_glow.frag at quarter size, then halved three times by knox_down*.frag.
// rgb is the bloom seed (brightest lights at night, bright sky by day), a the light spill amount.
uniform sampler2D uKnoxGlow;
uniform sampler2D uKnoxBloom8;
uniform sampler2D uKnoxBloom16;
uniform sampler2D uKnoxBloom32;
uniform sampler2D uNormal;    // Viewpoint's G-buffer: surface normal in rgb (world space, y up)
uniform sampler2D uAlbedo;    // Viewpoint's G-buffer: surface colour in rgb
uniform sampler2D uOcclusion; // Viewpoint's ambient occlusion: a = 1 open .. 0 fully occluded
uniform mat4 uInvViewProjection;
uniform vec3 uEye;            // camera position, world space
uniform vec3 uSunColor;
uniform vec2 uFarRange;       // near and far planes of the distant world; x <= 0 when off
uniform vec4 uCamera;         // x = near, y = far
uniform vec2 uFogRange;       // Viewpoint's fog start and end distance
uniform vec3 uFogColor;       // Viewpoint's fog colour (follows the sky); 0 if not set
uniform vec3 uSunDir;         // unit vector, y up
uniform float uNight;         // 0 day .. about 0.3 full night
uniform float uRainStrength;  // 0 .. 1
uniform float uRain;          // 0 .. 1, the name Viewpoint sets for pack passes
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

// One bloom level, upsampled with a 3 x 3 tent so the coarse levels stay smooth.
vec4 knoxTent(sampler2D level, vec2 uv) {
    vec2 t = 1.0 / vec2(textureSize(level, 0));
    vec4 sum = textureLod(level, uv, 0.0) * 4.0;
    sum += (textureLod(level, uv + vec2(t.x, 0.0), 0.0) + textureLod(level, uv - vec2(t.x, 0.0), 0.0)
          + textureLod(level, uv + vec2(0.0, t.y), 0.0) + textureLod(level, uv - vec2(0.0, t.y), 0.0)) * 2.0;
    sum += textureLod(level, uv + t, 0.0) + textureLod(level, uv - t, 0.0)
         + textureLod(level, uv + vec2(t.x, -t.y), 0.0) + textureLod(level, uv + vec2(-t.x, t.y), 0.0);
    return sum / 16.0;
}

// Soft shoulder: values above 0.8 roll off towards 1 instead of clipping.
vec3 knoxShoulder(vec3 x) {
    vec3 over = max(x - 0.8, 0.0);
    return min(x, vec3(0.8)) + 0.2 * (1.0 - exp(-over / 0.2));
}

// Adds light through the soft shoulder, so glows over bright pixels roll off smoothly instead of
// clipping to flat white. With nothing added, the pixel is returned unchanged.
vec3 knoxAddLight(vec3 base, vec3 add) {
    return base + knoxShoulder(base + add) - knoxShoulder(base);
}

// Night vision exposure lift that keeps each colour's hue: scales the whole pixel by its brightest
// channel through an extended Reinhard curve, so dark pixels are lifted by about the gain and full
// white stays white. A gain of 1 returns the pixel unchanged.
vec3 knoxLift(vec3 c, float gain) {
    float m = max(max(c.r, c.g), c.b);
    if (m <= 1.0e-4 || gain <= 1.0) return c;
    float l = gain * m;
    float mapped = l * (1.0 + l / (gain * gain)) / (1.0 + l);
    return c * (mapped / m);
}

// Ambient occlusion with coloured multi-bounce (Jimenez et al. 2016 fit): light bouncing inside a
// corner takes on the surface's colour, so occluded corners of a red brick wall read deep red
// instead of grey. Returns the factor to apply on top of an image that already has plain AO.
vec3 knoxAoBounce(float ao, vec3 albedo) {
    vec3 a = 2.0404 * albedo - 0.3324;
    vec3 b = -4.7951 * albedo + 0.6417;
    vec3 c = 2.7552 * albedo + 0.6903;
    vec3 bounced = max(vec3(ao), ((ao * a + b) * ao + c) * ao);
    return clamp(bounced / ao, 1.0, 2.0);
}

// Surface light from the G-buffer, near world only: sky fill, ground bounce, coloured AO, rim.
// Every part is 0 at its option's 0, and pixels without a normal are left alone.
vec3 knoxSurfaceLight(vec3 color, float night, float farness) {
    if (textureLod(uDepth, vUv, 0.0).r >= 1.0) return color;
    vec3 n = textureLod(uNormal, vUv, 0.0).rgb;
    if (dot(n, n) < 0.25) return color;
    n = normalize(n);
    vec4 surface = textureLod(uAlbedo, vUv, 0.0);
    vec3 albedo = surface.rgb;
    float foliage = step(0.9, surface.a);  // Viewpoint marks foliage with alpha 1
    float day = 1.0 - night;
    float near = 1.0 - farness;
    float luma = knoxLuma(color);

    // Coloured bounce in occluded corners.
    float ao = textureLod(uOcclusion, vUv, 0.0).a;
    if (OPTION_KNOX_AO_BOUNCE > 0.0 && ao > 0.05 && ao < 0.999) {
        color *= mix(vec3(1.0), knoxAoBounce(ao, albedo), OPTION_KNOX_AO_BOUNCE * near);
    }

    // Sky fill and ground bounce, only into shade: up-facing shadowed surfaces take a little of
    // the sky's colour, walls a little warm light bounced off the sunlit ground.
    vec3 sun = uSunColor / max(max(max(uSunColor.r, uSunColor.g), uSunColor.b), 1.0);
    vec3 skyColor = dot(uFogColor, vec3(1.0)) > 0.03 ? uFogColor : vec3(0.45, 0.55, 0.7);
    float shade = 1.0 - smoothstep(0.08, 0.4, luma);
    float up = max(n.y, 0.0);
    vec3 fill = skyColor * up * 0.5 + 0.2 * (skyColor + sun) * (1.0 - n.y) * 0.5;
    color = knoxAddLight(color, albedo * fill * OPTION_KNOX_SKY_FILL * 0.35 * shade * day * near);

    // Rim: edges turning away from the camera catch a little sky and sun light. None on floors
    // and roofs, which face up.
    if (OPTION_KNOX_RIM > 0.0 && uInvViewProjection[3][3] != 0.0) {
        vec4 world = uInvViewProjection * vec4(vUv * 2.0 - 1.0, textureLod(uDepth, vUv, 0.0).r * 2.0 - 1.0, 1.0);
        vec3 view = normalize(uEye - world.xyz / world.w);
        // Foliage gets little, or grass and leaves would sparkle.
        float rim = pow(1.0 - max(dot(n, view), 0.0), 3.0) * (1.0 - up) * (1.0 - 0.8 * foliage);
        vec3 rimColor = mix(skyColor, sun, 0.5);
        color = knoxAddLight(color, rimColor * rim * OPTION_KNOX_RIM * 0.3 * mix(0.3, 1.0, day) * near);
    }
    return color;
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
#elif OPTION_KNOX_DEBUG == OPTION_KNOX_DEBUG_NORMALS
    // Surface normals as colour (x red, y green, z blue, mapped from -1..1); a green floor means
    // the normals are world space with y up.
    fragColor = vec4(normalize(textureLod(uNormal, vUv, 0.0).rgb + 1.0e-5) * 0.5 + 0.5, 1.0);
    return;
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
    // In fog weather Viewpoint pulls its fog range in to a few metres, and its own fog already
    // hides the distance. Our distance effects (horizon blend, rain fog, and the fade-outs of
    // night vision, spill and clarity) keep to a clear-weather range, or the whole view would
    // count as far away and wash into the sky colour on top of Viewpoint's fog.
    fogRange = max(fogRange, vec2(40.0, 250.0));

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

    color = knoxSurfaceLight(color, night, farness);

    // The sky keeps Viewpoint's own colours (sunsets, clouds, stars); only golden hour touches it.
    vec3 ungraded = color;

    // Night vision: lift shadows and mid-tones at night with a curve that leaves highlights alone,
    // so lamps keep their punch. Depends only on the time of day, so it's steady frame to frame,
    // and fades out with distance so the far world stays sunk into the night sky.
    // The deepest darks are kept out of the lift, so night keeps its contrast instead of turning
    // into a milky haze.
    float gain = 1.0 + 1.4 * OPTION_KNOX_ADAPTATION * night * (1.0 - farness);
    color = mix(color, knoxLift(color, gain), smoothstep(0.015, 0.12, knoxLuma(color)));

    // The bloom pyramid, one tent tap per level.
    vec4 bloom4 = knoxTent(uKnoxGlow, vUv);
    vec4 bloom8 = knoxTent(uKnoxBloom8, vUv);
    vec4 bloom16 = knoxTent(uKnoxBloom16, vUv);
    vec4 bloom32 = knoxTent(uKnoxBloom32, vUv);

    // Light spill into darker pixels from the wide levels, and halos around the brightest lights,
    // tight near the light with a long soft tail.
    vec3 spill = (bloom8.a * 0.5 + bloom16.a * 0.35 + bloom32.a * 0.15) * vec3(1.0, 0.86, 0.68) * 1.6;
    vec3 halo = (bloom4.rgb * 0.45 + bloom8.rgb * 0.3 + bloom16.rgb * 0.17 + bloom32.rgb * 0.08)
              * vec3(1.0, 0.92, 0.8) * 1.5;
    float spillRoom = 1.0 - smoothstep(0.05, 0.45, knoxLuma(color));
    // Both are night effects: by day, bright doorways and sunlit walls would bloom into soft white
    // blobs on the surfaces around them.
    color = knoxAddLight(color, spill * OPTION_KNOX_LIGHT_SPILL * night * 0.45 * spillRoom * (1.0 - farness)
                              + halo * vec3(1.0, 0.85, 0.65) * OPTION_KNOX_LAMP_HALO * night * 0.5);

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
    color = mix(color, silver, min(OPTION_KNOX_NIGHT_NEUTRAL * 1.6, 1.0) * night * coolCast);

    // Contrast around mid-grey, eased off towards white so skies and pale roads keep detail
    // instead of clipping.
    // A little extra at night outdoors, so moonlit scenes keep deep shadows rather than going flat.
    float contrast = OPTION_KNOX_CONTRAST + 0.12 * night * (1.0 - sky);
    vec3 contrasted = (color - 0.5) * contrast + 0.5;
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

    // Sun glow: a soft glare around the sun and bright clouds, spilling over rooftops and trees,
    // white at midday and gold at golden hour. Screen blend, so it never clips. Day only, and
    // dimmed in the rain.
    float sunAmount = OPTION_KNOX_SUN_GLOW * (1.0 - night) * (1.0 - 0.7 * muted);
    if (sunAmount > 0.0) {
        vec3 tint = mix(vec3(1.0, 0.95, 0.86), vec3(1.0, 0.74, 0.5), knoxGoldenHour());
        vec3 sunGlow = bloom4.rgb * 0.15 + bloom8.rgb * 0.25 + bloom16.rgb * 0.3 + bloom32.rgb * 0.3;
        vec3 glare = clamp(sunGlow * tint * sunAmount * 1.2, 0.0, 1.0);
        color = 1.0 - (1.0 - color) * (1.0 - glare);
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
    color = knoxAddLight(color, color * vec3(0.35, 0.22, 0.05) * OPTION_KNOX_WINDOW_GLOW * night * warmLight);

    // Shadow lift: a faint floor under the darkest values that fades out by the low mid-tones.
    vec3 toe = pow(clamp(1.0 - color, 0.0, 1.0), vec3(8.0));
    color += toe * 0.035 * OPTION_KNOX_SHADOW_LIFT * vec3(0.97, 1.0, 1.04) * (1.0 - sky) * (1.0 - farness);

    // Gentle vignette to frame the view.
    vec2 v = vUv - 0.5;
    color *= 1.0 - OPTION_KNOX_VIGNETTE * smoothstep(0.15, 0.75, dot(v, v) * 2.0);

    color += (knoxNoise(gl_FragCoord.xy) - 0.5) / 255.0;
    fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
