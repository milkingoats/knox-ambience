#version 330

// Knox Ambience bloom pyramid, step 3 of 3: downsamples knoxBloom16 to half its size with a 13-tap
// filter (a 4 x 4 box in the middle and four overlapping 3 x 3 boxes around it, weighted so the
// result doesn't flicker as small bright lights move between pixels). The grade adds the levels
// back together for wide, smooth halos and sun glow.

uniform sampler2D uKnoxBloom16;

in vec2 vUv;
out vec4 fragColor;

void main() {
    vec2 t = 1.0 / vec2(textureSize(uKnoxBloom16, 0));
    vec4 a = textureLod(uKnoxBloom16, vUv + t * vec2(-2.0, 2.0), 0.0);
    vec4 b = textureLod(uKnoxBloom16, vUv + t * vec2(0.0, 2.0), 0.0);
    vec4 c = textureLod(uKnoxBloom16, vUv + t * vec2(2.0, 2.0), 0.0);
    vec4 d = textureLod(uKnoxBloom16, vUv + t * vec2(-2.0, 0.0), 0.0);
    vec4 e = textureLod(uKnoxBloom16, vUv, 0.0);
    vec4 f = textureLod(uKnoxBloom16, vUv + t * vec2(2.0, 0.0), 0.0);
    vec4 g = textureLod(uKnoxBloom16, vUv + t * vec2(-2.0, -2.0), 0.0);
    vec4 h = textureLod(uKnoxBloom16, vUv + t * vec2(0.0, -2.0), 0.0);
    vec4 i = textureLod(uKnoxBloom16, vUv + t * vec2(2.0, -2.0), 0.0);
    vec4 j = textureLod(uKnoxBloom16, vUv + t * vec2(-1.0, 1.0), 0.0);
    vec4 k = textureLod(uKnoxBloom16, vUv + t * vec2(1.0, 1.0), 0.0);
    vec4 l = textureLod(uKnoxBloom16, vUv + t * vec2(-1.0, -1.0), 0.0);
    vec4 m = textureLod(uKnoxBloom16, vUv + t * vec2(1.0, -1.0), 0.0);
    fragColor = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
}
