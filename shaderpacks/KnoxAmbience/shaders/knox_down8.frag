#version 330

// Knox Ambience bloom pyramid, step 1 of 3: downsamples knoxGlow to half its size (filter in
// lib/knox_down.glsl). The grade adds the levels back together for wide, smooth halos and sun glow.

#include "lib/knox_down.glsl"

uniform sampler2D uKnoxGlow;

in vec2 vUv;
out vec4 fragColor;

void main() {
    fragColor = knoxDown(uKnoxGlow, vUv);
}
