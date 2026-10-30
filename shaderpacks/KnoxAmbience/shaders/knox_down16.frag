#version 330

// Knox Ambience bloom pyramid, step 2 of 3: downsamples knoxBloom8 to half its size (filter in
// lib/knox_down.glsl). The grade adds the levels back together for wide, smooth halos and sun glow.

#include "lib/knox_down.glsl"

uniform sampler2D uKnoxBloom8;

in vec2 vUv;
out vec4 fragColor;

void main() {
    fragColor = knoxDown(uKnoxBloom8, vUv);
}
