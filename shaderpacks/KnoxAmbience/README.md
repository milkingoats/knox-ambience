# Knox Ambience shader pack

An original Iris-format shader pack for Project Viewpoint, made for Zomboid's look rather than ported
from a Minecraft pack.

Target look: overcast light, fog, dark nights, wet roads, flashlight-lit interiors, muted colour grading.

## Install

Copy this folder (`KnoxAmbience`) into `Zomboid/viewpoint-shaderpacks/`, start the game, and pick it
under Delete > Shaders.

## What's in it

| File | Pass | Does |
|------|------|------|
| `shaders/composite.fsh` | composite | Distance fog. Overcast grey by day, closer and darker in rain, neutral near-black at night |
| `shaders/final.fsh` | final | Colour grading, rain gloom, night darkening with light falloff, dithering |
| `shaders/lib/common.glsl` | – | Shared helpers (night factor, luma, dither noise) |
| `shaders/settings.glsl` | – | Options shown in the shader settings screen |
| `shaders/lang/en_us.lang` | – | Option and screen labels |

### The look

- **Weather fog.** `rainStrength` (and half of `wetness`, so fog lingers after rain) pulls the fog
  start closer, thickens it (Rain fog option) and darkens its colour.
- **Light falloff.** At night, dim pixels are darkened more than bright ones (Light falloff option),
  so lamps and flashlights keep their pools of light while the rest of the street sinks.
- **No blue night.** Night fog is neutral, the cool overcast tint fades out after dusk, and
  saturation drops a little in the dark. Nights get darker, not bluer.
- **Rain gloom.** Rain flattens and dims the light a little.

### Performance

Two full-screen passes and three texture reads per pixel, no extra buffers, no gbuffer or shadow
programs. The shadow pass is Viewpoint's own and was the main driving stutter in our measurements,
so this pack adds nothing to it. Distant rain haze is folded into the fog maths instead of a separate
half-resolution pass, which is cheaper still. Options compile out when off.

## Caveats

Viewpoint's Iris support is experimental and we don't yet know which uniforms it fills in. The pack
reads `colortex0`, `depthtex0`, `near`, `far`, `sunAngle`, `rainStrength` and `wetness`. A uniform
the game never sets reads as 0, which here means "clear day": no rain fog and no night darkening, but
never a black screen.

To check, set **Debug > Debug view**:

- **Depth**: should be a smooth black (near) to white (far) gradient. Flat white or black means
  `depthtex0` or `near`/`far` aren't filled, and fog won't work.
- **Uniform bars**: three bars at the top of the screen, `sunAngle`, `rainStrength`, `wetness` from
  top to bottom. `sunAngle` should creep along with the time of day and pass halfway at dusk; the
  rain bars should grow when it rains. A bar stuck at zero means Viewpoint doesn't set that uniform.

Passes read pixels with `texelFetch` at `gl_FragCoord`, not interpolated texture coordinates:
Viewpoint doesn't fill `gl_TextureMatrix` for full-screen passes, so `ftransform`-style texcoords
made every pixel read one corner texel (a flat blue screen). This assumes the buffers are
screen-sized; if Viewpoint ever renders at a lower resolution, sample with a scaled UV instead.

First in-game run (2026-10-30) found that bug; the fix is untested. The shaders compile with glslangValidator (all debug modes, fog on and off).
