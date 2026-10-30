#version 330 compatibility

// Distance fog towards an overcast grey.
// First pass: fog colour is fixed and darkens at night. Weather-driven colour comes later.

#include "/settings.glsl"

uniform sampler2D colortex0;
uniform sampler2D depthtex0;
uniform float near;
uniform float far;
uniform float sunAngle; // 0.0-0.5 day, 0.5-1.0 night

in vec2 texcoord;

/* RENDERTARGETS: 0 */
layout(location = 0) out vec4 outColor;

float linearDepth(float d) {
    float z = d * 2.0 - 1.0;
    return (2.0 * near * far) / (far + near - z * (far - near));
}

void main() {
    vec3 color = texture(colortex0, texcoord).rgb;
    float depth = texture(depthtex0, texcoord).r;

    if (depth < 1.0) {
        float dist = linearDepth(depth) / far;
        float fog = 1.0 - exp(-max(dist - FOG_START, 0.0) * FOG_DENSITY * 6.0);

        float night = smoothstep(0.48, 0.55, sunAngle) * (1.0 - smoothstep(0.95, 1.0, sunAngle));
        vec3 fogColor = mix(vec3(0.58, 0.60, 0.62), vec3(0.03, 0.035, 0.045), night);

        color = mix(color, fogColor, clamp(fog, 0.0, 1.0));
    }

    outColor = vec4(color, 1.0);
}
