#version 330 compatibility

// Distance fog. Day fog is overcast grey; rain pulls it closer and darker; night fog is a
// neutral near-black, not blue. One pass, two texture reads.

#include "/settings.glsl"
#include "/lib/common.glsl"

uniform sampler2D colortex0;
uniform sampler2D depthtex0;
uniform float near;
uniform float far;
uniform float sunAngle;
uniform float rainStrength; // 0-1, follows the weather directly
uniform float wetness;      // 0-1, lags behind rain

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

#if DEBUG_VIEW == 1
    outColor = vec4(vec3(linearDepth(depth) / far), 1.0);
    return;
#endif

#ifdef FOG_ENABLED
    if (depth < 1.0) {
        float rain = max(rainStrength, wetness * 0.5);
        float night = nightFactor(sunAngle);

        float dist = linearDepth(depth) / far;
        float start = FOG_START * (1.0 - 0.6 * rain);
        float density = FOG_DENSITY * (1.0 + RAIN_FOG * rain);
        float fog = 1.0 - exp(-max(dist - start, 0.0) * density * 6.0);

        vec3 dayFog = mix(vec3(0.58, 0.60, 0.62), vec3(0.42, 0.44, 0.46), rain);
        vec3 nightFog = vec3(0.030, 0.031, 0.033);
        vec3 fogColor = mix(dayFog, nightFog, night);

        color = mix(color, fogColor, clamp(fog, 0.0, 1.0));
    }
#endif

    outColor = vec4(color, 1.0);
}
