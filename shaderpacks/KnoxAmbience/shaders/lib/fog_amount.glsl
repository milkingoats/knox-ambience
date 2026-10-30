// Knox Ambience distance fog amount. Replaces Viewpoint's lib/fog_amount.glsl for this pack, and
// is used wherever Viewpoint applies distance fog: the main image, the distant world, glass,
// rain and far lamps. Using one curve everywhere keeps the near and far world fogged alike, so
// there's no hard seam where the near trees end.
//
// Viewpoint's fog colour, range and haze settings are unchanged. Only the shape changes:
// - it fades in gently from the fog start instead of ramping linearly into a solid wall;
// - it never reaches full strength, so skylines and distant buildings stay readable as soft
//   silhouettes;
// - height haze is lighter.
//
// Declares no uniforms: this file is included by shaders that declare their own.

#ifndef VIEWPOINT_FOG_AMOUNT
#define VIEWPOINT_FOG_AMOUNT

#ifndef OPTION_KNOX_FOG_STRENGTH
#define OPTION_KNOX_FOG_STRENGTH 0.75
#endif
#ifndef OPTION_KNOX_FOG_HAZE
#define OPTION_KNOX_FOG_HAZE 0.5
#endif

// d: linear distance from the camera. range: Viewpoint's fog start and end.
float fogAt(float d, vec2 range) {
    float span = max(range.y - range.x, 1.0);
    float t = max(d - range.x, 0.0) / span;
    // Ease in (quadratic), then approach the cap smoothly past the fog end.
    float f = 1.0 - exp(-2.2 * t * t);
    return f * clamp(OPTION_KNOX_FOG_STRENGTH, 0.0, 1.0);
}

// h: distance from the eye. haze: Viewpoint's haze scale and base.
float hazeAt(float h, vec2 haze) {
    float f = 1.0 - exp(-max(h, 0.0) * max(haze.x, 0.0) * OPTION_KNOX_FOG_HAZE);
    return f * clamp(OPTION_KNOX_FOG_STRENGTH, 0.0, 1.0);
}

#endif
