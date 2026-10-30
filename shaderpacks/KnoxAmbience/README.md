# Knox Ambience shader pack

A native [Project Viewpoint](https://steamcommunity.com/sharedfiles/filedetails/?id=3809306528)
shader pack, built for Zomboid's look.

It builds on Viewpoint's own **Default** pack (`base=default`), so Viewpoint keeps all of its
lighting, shadows, clouds, volumetrics and fog. Knox Ambience adds one full-screen pass at the very
end (`shaders/knox_grade.frag`) that changes the mood, and reshapes Viewpoint's distance fog
(`shaders/lib/fog_amount.glsl`):

- **Softer distance fog**: fades in gently and stops short of a solid wall, so skylines stay as
  soft silhouettes. The same curve applies to the near and the distant world, so there's no hard
  seam where near trees end. Viewpoint's own fog colour and range still drive it.

- **Rain fog**: extra grey fog while it rains, closer the harder it rains.
- **Light falloff**: nights darken dim areas harder than lit ones, so lamp and flashlight pools stay
  bright while the street sinks.
- **Neutral nights**: colour drains out after dusk, so night goes dark, not blue.
- **Cozy warmth**: a soft warm cast by day, warm lamp and flashlight pools at night, soft highlights
  so skies and pale roads keep detail, and a gentle vignette.
- **Rain gloom**: flatter, dimmer light in rain.
- **Bloom**: lamp halos, light spill and a daytime sun glow come from a small bloom pyramid seeded
  only by the brightest lights (and the sun by day). They're added through a soft shoulder, so glows
  over bright pixels roll off smoothly instead of clipping.
- **Surface light** from Viewpoint's G-buffer: sky fill and warm ground bounce in shade, coloured
  bounce in ambient-occluded corners, and a faint rim light on edges.

Several of these (the soft shoulder, the hue-keeping night lift, the bloom pyramid, sky and ground
fill, rim light) follow ideas from Mattias's Era project; the code here is written for this pack.

## Install

Copy this folder (`KnoxAmbience`, the one holding `pack.properties`) into
`Zomboid/viewpoint-shaderpacks/`, restart the game, and pick **Knox Ambience** under
Delete > Graphics > Shaders. Its options are in the same settings page, next to Viewpoint's.

The settings page also shows "Left out: KnoxAmbience: no shaders folder with shaders.properties or a
program". That's expected: Viewpoint checks every pack folder for a Minecraft pack too, and ours is
native. Don't add a `shaders.properties` to silence it, or Viewpoint will also load the folder as a
Minecraft pack.

Rolling Hills (3815630947) turns its hills off under any native pack it doesn't know by name. The
Knox Ambience Java mod tells it that packs built on Viewpoint's Default or Vivid are supported (patch
(d) in [mods/KnoxAmbience](../../mods/KnoxAmbience/README.md)), so with the mod loaded the hills stay on.

## Performance

A quarter-size glow pass, three tiny downsample passes (1/8, 1/16 and 1/32 size) and one
full-screen grade pass. Four of the eight render targets Viewpoint allows a pack and its base
together. Everything heavy
(shadows, volumetrics, clouds) is Viewpoint's and follows Viewpoint's own quality settings.

## Why native and not a Minecraft (Iris) pack

Under a Minecraft pack, Viewpoint hands the whole job of drawing the world to the pack: its own
world passes stop. A pack with only fog and grading then gets an empty frame (we saw a flat blue
screen). Packs that work there (BSL, Complementary, Bliss, Photon, Eclipse) are full renderers.
A native pack keeps Viewpoint's renderer and only replaces what it needs.

## Checking what Viewpoint feeds the pack

Set **Knox debug view** to Uniform bars for bars along the top of the screen (top down: Viewpoint's
night, the pack's night, rain strength, wetness), Depth for the depth buffer, Normals or Occlusion
for Viewpoint's G-buffer normals and ambient occlusion, or Edges to see in red where the pack
leaves silhouette edges alone (its surface light reads the G-buffer, which Viewpoint jitters for
TAA, so applying it on edges made them shimmer). Uniforms Viewpoint doesn't
set read as 0, which the pack treats as "clear day", so nothing breaks; it just looks plainer.

The pack is written from scratch. It uses Viewpoint's pack format and uniform names, never its code.
