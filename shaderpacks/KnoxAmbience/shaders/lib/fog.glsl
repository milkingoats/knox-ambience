// Knox Ambience fog colour. Replaces the fog colour the Default look inherits, which takes the sky
// colour along the view direction. Looking down from high up (overhead and isometric cameras),
// that is the dark sky below the horizon, so fog weather turned into a dark murk. Fog here always
// takes Viewpoint's horizon fog colour, so it stays pale from any camera angle, like vanilla's.
//
// The colour itself uses only its arguments. The sky uniforms and lib/sky.glsl are declared here
// as in the file this replaces, because the Default look's lib/distance.glsl reads uSkySun and
// relies on this file to declare it.

#ifndef KNOX_FOG_COLOR
#define KNOX_FOG_COLOR

uniform vec3 uZenith;
uniform vec3 uSkySun;
uniform vec3 uSkySunColor;
uniform float uSkyGlow;
#include "lib/sky.glsl"

// horizon: Viewpoint's fog colour (uFogColor). view: unit direction from the eye.
vec3 fogColor(vec3 horizon, vec3 view) {
    return horizon;
}

#endif
