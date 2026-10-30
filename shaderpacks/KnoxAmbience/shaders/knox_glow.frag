#version 330

// Knox Ambience glow source: a quarter-size, pre-blurred copy of the lit parts of the frame,
// eased over a few frames. It seeds the bloom pyramid (knox_down*.frag), and the grade reads all
// the levels for light spill, lamp halos and sun glow, so they come from smooth, steady light
// instead of single pixels that shimmer as the camera moves.
//
// rgb: bloom seed. At night, the colour of the very brightest lights only (lamps, lit windows,
// fires), never general brightness; by day, the bright sky around the sun.
// a: how much of the area is clearly, warmly lit (light spill).

uniform sampler2D uColor;
uniform sampler2D uDepth;             // 1 = sky or distant world
uniform sampler2D uFarDepth;          // Viewpoint's distant world
uniform vec2 uFarRange;               // x <= 0 when the distant world is off
uniform vec3 uSunDir;                 // unit vector, y up
uniform float uNight;                 // 0 day .. about 0.3 full night
uniform sampler2D uKnoxGlowPrevious;  // this target's last frame
uniform float uPreviousValid;         // 0 on the first frame or after a reset

#ifndef OPTION_KNOX_STYLE_NATURAL
#define OPTION_KNOX_STYLE_NATURAL 1
#endif
#ifndef OPTION_KNOX_STYLE
#define OPTION_KNOX_STYLE 0
#endif

in vec2 vUv;
out vec4 fragColor;

float knoxLuma(vec3 c) {
    return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

bool knoxIsSky(vec2 uv) {
    if (textureLod(uDepth, uv, 0.0).r < 1.0) return false;
    return uFarRange.x <= 0.0 || textureLod(uFarDepth, uv, 0.0).r >= 1.0;
}

// Same night amount as the grade (knox_grade.frag knoxNight), with its default full-night level.
float knoxNight() {
    float fromSun = length(uSunDir) > 0.5 ? 1.0 - smoothstep(-0.12, 0.08, uSunDir.y) : 0.0;
    return clamp(max(smoothstep(0.0, 0.3, uNight), fromSun), 0.0, 1.0);
}

void main() {
    vec2 texel = 1.0 / vec2(textureSize(uColor, 0));
    float spill = 0.0;
    vec3 sun = vec3(0.0);
    vec3 lights = vec3(0.0);
    float skyTaps = 0.0;
    // 4 x 4 bilinear taps cover an 8 x 8 block of full-size pixels around this quarter pixel.
    for (int y = 0; y < 4; y++) {
        for (int x = 0; x < 4; x++) {
            vec2 o = (vec2(float(x), float(y)) - 1.5) * 2.0 * texel;
            vec3 c = textureLod(uColor, vUv + o, 0.0).rgb;
            float l = knoxLuma(c);
            // Only real light sources and lit surfaces spill; moonlit roads and pale walls don't, or the
            // night turns hazy.
#if OPTION_KNOX_STYLE == OPTION_KNOX_STYLE_NATURAL
            // Natural: by brightness only, whatever the light's colour.
            spill += l * smoothstep(0.5, 0.9, l);
            lights += c * smoothstep(0.6, 0.95, l);
#else
            spill += l * smoothstep(0.4, 0.85, l) * clamp((c.r - c.b) * 3.0 + 0.4, 0.0, 1.0);
            lights += c * smoothstep(0.55, 0.95, l) * clamp((c.r - c.b) * 3.0 + 0.2, 0.0, 1.0);
#endif
            // Sun glow: only the brightest sky (the sun and the clouds it lights), never lit walls
            // or roads, so daytime surfaces don't bloom into white blobs.
            if (knoxIsSky(vUv + o)) {
                skyTaps += 1.0;
                if (l > 0.82) sun += c * smoothstep(0.82, 0.98, l);
            }
        }
    }
    // Real sky fills most of the block. One or two "sky" taps are hairline gaps in floors, walls
    // and roofs that show the bright background; left in, they bloomed into soft white spots on
    // the floor that crawled as the camera moved.
    sun *= smoothstep(5.0, 10.0, skyTaps);
    vec4 now = vec4(mix(sun, lights, knoxNight()) / 16.0, spill / 16.0);
    // Ease towards the new value so flickering pixels (rain, aliasing) settle; short enough that
    // turning the camera doesn't smear.
    vec4 previous = textureLod(uKnoxGlowPrevious, vUv, 0.0);
    fragColor = mix(now, previous, uPreviousValid > 0.5 ? 0.45 : 0.0);
}
