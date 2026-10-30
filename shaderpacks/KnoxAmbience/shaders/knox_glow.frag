#version 330

// Knox Ambience glow source: a quarter-size, pre-blurred copy of the lit parts of the frame,
// eased over a few frames. The grade reads it for light spill and lamp halos, so they come from
// smooth, steady light instead of single pixels that shimmer as the camera moves.
//
// rgb: colour of clearly lit areas (spill). a: brightness of the very brightest lights (halos).

uniform sampler2D uColor;
uniform sampler2D uKnoxGlowPrevious;  // this target's last frame
uniform float uPreviousValid;         // 0 on the first frame or after a reset

in vec2 vUv;
out vec4 fragColor;

float knoxLuma(vec3 c) {
    return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
    vec2 texel = 1.0 / vec2(textureSize(uColor, 0));
    vec3 spill = vec3(0.0);
    float halo = 0.0;
    // 4 x 4 bilinear taps cover an 8 x 8 block of full-size pixels around this quarter pixel.
    for (int y = 0; y < 4; y++) {
        for (int x = 0; x < 4; x++) {
            vec2 o = (vec2(float(x), float(y)) - 1.5) * 2.0 * texel;
            vec3 c = textureLod(uColor, vUv + o, 0.0).rgb;
            float l = knoxLuma(c);
            // Only real light sources and lit surfaces spill; moonlit roads and pale walls don't, or the
            // night turns hazy.
            spill += c * smoothstep(0.4, 0.85, l) * clamp((c.r - c.b) * 3.0 + 0.4, 0.0, 1.0);
            halo += smoothstep(0.55, 0.95, l) * clamp((c.r - c.b) * 3.0 + 0.2, 0.0, 1.0);
        }
    }
    vec4 now = vec4(spill / 16.0, halo / 16.0);
    // Ease towards the new value so flickering pixels (rain, aliasing) settle; short enough that
    // turning the camera doesn't smear.
    vec4 previous = textureLod(uKnoxGlowPrevious, vUv, 0.0);
    fragColor = mix(now, previous, uPreviousValid > 0.5 ? 0.45 : 0.0);
}
