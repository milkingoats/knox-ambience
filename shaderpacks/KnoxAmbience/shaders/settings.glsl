// User-facing options. The trailing [ ... ] lists are the slider steps Iris shows.
// A commented-out #define is an off/on toggle.

// Fog
#define FOG_ENABLED // Distance fog on or off
#define FOG_DENSITY 0.6 // [0.0 0.2 0.4 0.6 0.8 1.0 1.5 2.0]
#define FOG_START 0.15 // [0.0 0.05 0.1 0.15 0.2 0.3 0.4]
#define RAIN_FOG 1.5 // [0.0 0.5 1.0 1.5 2.0 3.0] Extra fog density at full rain

// Light and night
#define NIGHT_DARKNESS 0.5 // [0.0 0.25 0.5 0.75 1.0]
#define LIGHT_FALLOFF 0.6 // [0.0 0.2 0.4 0.6 0.8 1.0] How much more night darkens dim areas than lit ones

// Colour grading
#define SATURATION 0.75 // [0.4 0.5 0.6 0.7 0.75 0.8 0.9 1.0]
#define CONTRAST 1.05 // [0.9 0.95 1.0 1.05 1.1 1.15 1.2]
#define TINT_STRENGTH 0.35 // [0.0 0.1 0.2 0.35 0.5 0.75 1.0]
#define RAIN_GLOOM 0.3 // [0.0 0.1 0.2 0.3 0.4 0.5] Darker, flatter light at full rain

// Debug: 0 off, 1 depth, 2 uniform bars (top to bottom: sunAngle, rainStrength, wetness)
#define DEBUG_VIEW 0 // [0 1 2]
