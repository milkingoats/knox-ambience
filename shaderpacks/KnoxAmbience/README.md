# Knox Ambience shader pack

A native [Project Viewpoint](https://steamcommunity.com/sharedfiles/filedetails/?id=3809306528)
shader pack, built for Zomboid's look.

It builds on Viewpoint's own **Default** pack (`base=default`), so Viewpoint keeps all of its
lighting, shadows, clouds, volumetrics and fog. Knox Ambience adds one full-screen pass at the very
end (`shaders/knox_grade.frag`) that changes the mood:

- **Rain fog**: extra grey fog while it rains, closer the harder it rains.
- **Light falloff**: nights darken dim areas harder than lit ones, so lamp and flashlight pools stay
  bright while the street sinks.
- **Neutral nights**: colour drains out after dusk, so night goes dark, not blue.
- **Cozy warmth**: a soft warm cast by day, warm lamp and flashlight pools at night, soft highlights
  so skies and pale roads keep detail, and a gentle vignette.
- **Rain gloom**: flatter, dimmer light in rain.

## Install

Copy this folder (`KnoxAmbience`, the one holding `pack.properties`) into
`Zomboid/viewpoint-shaderpacks/`, restart the game, and pick **Knox Ambience** under
Delete > Graphics > Shaders. Its options are in the same settings page, next to Viewpoint's.

The settings page also shows "Left out: KnoxAmbience: no shaders folder with shaders.properties or a
program". That's expected: Viewpoint checks every pack folder for a Minecraft pack too, and ours is
native. Don't add a `shaders.properties` to silence it, or Viewpoint will also load the folder as a
Minecraft pack.

Rolling Hills (3815630947) currently turns its hills off under any native pack it doesn't know by
name, including this one.

## Performance

One extra full-screen pass with two texture reads per pixel, no extra buffers. Everything heavy
(shadows, volumetrics, clouds) is Viewpoint's and follows Viewpoint's own quality settings.

## Why native and not a Minecraft (Iris) pack

Under a Minecraft pack, Viewpoint hands the whole job of drawing the world to the pack: its own
world passes stop. A pack with only fog and grading then gets an empty frame (we saw a flat blue
screen). Packs that work there (BSL, Complementary, Bliss, Photon, Eclipse) are full renderers.
A native pack keeps Viewpoint's renderer and only replaces what it needs.

## Checking what Viewpoint feeds the pack

Set **Knox debug view** to 1 for bars along the top of the screen (top down: Viewpoint's night,
the pack's night, rain strength, wetness), or 2 for the depth buffer. Uniforms Viewpoint doesn't
set read as 0, which the pack treats as "clear day", so nothing breaks; it just looks plainer.

The pack is written from scratch. It uses Viewpoint's pack format and uniform names, never its code.
