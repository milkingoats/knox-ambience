#version 330

// Knox Ambience bloom pyramid, step 1 of 3: downsamples knoxGlow to half its size with a 13-tap
// filter (a 4 x 4 box in the middle and four overlapping 3 x 3 boxes around it, weighted so the
// result doesn't flicker as small bright lights move between pixels). The grade adds the levels
// back together for wide, smooth halos and sun glow.

uniform sampler2D uKnoxGlow;

in vec2 vUv;
out vec4 fragColor;

void main() {
    vec2 t = 1.0 / vec2(textureSize(uKnoxGlow, 0));
    vec4 a = textureLod(uKnoxGlow, vUv + t * vec2(-2.0, 2.0), 0.0);
    vec4 b = textureLod(uKnoxGlow, vUv + t * vec2(0.0, 2.0), 0.0);
    vec4 c = textureLod(uKnoxGlow, vUv + t * vec2(2.0, 2.0), 0.0);
    vec4 d = textureLod(uKnoxGlow, vUv + t * vec2(-2.0, 0.0), 0.0);
    vec4 e = textureLod(uKnoxGlow, vUv, 0.0);
    vec4 f = textureLod(uKnoxGlow, vUv + t * vec2(2.0, 0.0), 0.0);
    vec4 g = textureLod(uKnoxGlow, vUv + t * vec2(-2.0, -2.0), 0.0);
    vec4 h = textureLod(uKnoxGlow, vUv + t * vec2(0.0, -2.0), 0.0);
    vec4 i = textureLod(uKnoxGlow, vUv + t * vec2(2.0, -2.0), 0.0);
    vec4 j = textureLod(uKnoxGlow, vUv + t * vec2(-1.0, 1.0), 0.0);
    vec4 k = textureLod(uKnoxGlow, vUv + t * vec2(1.0, 1.0), 0.0);
    vec4 l = textureLod(uKnoxGlow, vUv + t * vec2(-1.0, -1.0), 0.0);
    vec4 m = textureLod(uKnoxGlow, vUv + t * vec2(1.0, -1.0), 0.0);
    fragColor = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
}
