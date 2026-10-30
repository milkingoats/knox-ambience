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
| `shaders/composite.fsh` | composite | Distance fog towards overcast grey, darker at night |
| `shaders/final.fsh` | final | Colour grading: saturation, contrast, cool tint, night darkening |
| `shaders/settings.glsl` | – | Options shown in the shader settings screen |

## Caveats

Viewpoint's Iris support is experimental and we don't yet know which uniforms it fills in. This first
pass only uses `colortex0`, `depthtex0`, `near`, `far` and `sunAngle`. If fog looks wrong or the screen
goes black, `sunAngle` or `depthtex0` is the first suspect. Untested in game.
