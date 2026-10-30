// Shared helpers for every pass.
//
// Uniforms Viewpoint never sets stay at 0. Every helper here treats 0 as "clear day", so a
// missing uniform gives a plain look instead of a black or broken screen.

float lumaOf(vec3 c) {
    return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

// 0 by day, 1 at night. sunAngle: 0.0-0.5 day, 0.5-1.0 night.
float nightFactor(float sunAngle) {
    return smoothstep(0.48, 0.55, sunAngle) * (1.0 - smoothstep(0.95, 1.0, sunAngle));
}

// Cheap per-pixel noise in [0, 1), used to dither away banding in dark gradients.
float ign(vec2 fragCoord) {
    return fract(52.9829189 * fract(dot(fragCoord, vec2(0.06711056, 0.00583715))));
}
