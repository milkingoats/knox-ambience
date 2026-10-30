// Knox Ambience fog colour. Replaces the fog colour the Default look inherits, which takes the sky
// colour along the view direction. Looking down from high up (overhead and isometric cameras),
// that is the dark sky below the horizon, so fog weather turned into a dark murk. Fog here always
// takes Viewpoint's horizon fog colour, so it stays pale from any camera angle, like vanilla's.
//
// Uses only its arguments and declares no uniforms, so it fits every shader that includes it.

#ifndef KNOX_FOG_COLOR
#define KNOX_FOG_COLOR

// horizon: Viewpoint's fog colour (uFogColor). view: unit direction from the eye.
vec3 fogColor(vec3 horizon, vec3 view) {
    return horizon;
}

#endif
