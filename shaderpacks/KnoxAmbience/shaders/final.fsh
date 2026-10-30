#version 330 compatibility

// Colour grading: muted saturation, slight contrast, cool overcast tint, darker nights.

#include "/settings.glsl"

uniform sampler2D colortex0;
uniform float sunAngle;

in vec2 texcoord;

layout(location = 0) out vec4 outColor;

void main() {
    vec3 color = texture(colortex0, texcoord).rgb;

    float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color = mix(vec3(luma), color, SATURATION);
    color = (color - 0.5) * CONTRAST + 0.5;
    color = mix(color, color * vec3(0.92, 0.97, 1.05), TINT_STRENGTH);

    float night = smoothstep(0.48, 0.55, sunAngle) * (1.0 - smoothstep(0.95, 1.0, sunAngle));
    color *= 1.0 - night * NIGHT_DARKNESS * 0.6;

    outColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
