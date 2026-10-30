# Plan

Goal: an immersion-focused modpack for Project Zomboid Build 42.21 around Project Viewpoint. Our own
performance work and visuals, including a Zomboid-specific shader pack in the spirit of the Minecraft
ones, plus polish.

## Decisions

1. **Don't fork PZ_Optimization** (github.com/xD3I/PZ_Optimization).
   - No LICENSE file, so all rights reserved. We can't redistribute modified builds.
   - Removed from the Steam Workshop.
   - Fragile: replaces about 300 game classes, pinned to one game revision, updated almost daily.
   - Its notes say Viewpoint's frame-cap code matches theirs, so there is ownership tension.
   - We may read its write-ups for ideas and measurements. **Never copy its code**: `src/overrides/` is
     mostly decompiled game code.
2. **Depend on Viewpoint, ZombieBuddy and immersion mods as normal Workshop items.** Viewpoint is
   proprietary ("all rights reserved"): depend on it, never bundle or change it.
3. **Our performance mod is a ZombieBuddy Java mod** that patches individual methods.
4. **Licence:** MIT for everything in this repo.
5. **Compete with feature add-ons, don't depend on them.** Our only prerequisites are ZombieBuddy and
   Viewpoint. We never require another add-on on top of them. That would make us a mod for a mod of a
   mod that needs a Java mod framework.
   - Main rival: "Project Viewpoint: True Weathers & Lighting" (3813908957, no licence, all rights
     reserved). It is a weather and lighting overhaul with its own shader pack, flashlight sway, fog,
     puddles and rain on glass. We aim to replace it, not add to it. Use it for ideas only, never its code.
   - It overlaps with our visuals work, so mark it incompatible in modlist.md.
     Two shader packs and two flashlight systems at once is not a supported setup.

Viewpoint availability was confirmed live on the Workshop on 2026-10-30 (last updated 16 Oct). It
requires ZombieBuddy, which is also on GitHub under MIT.

## Performance: what still matters under Viewpoint

From PZ_Optimization's `docs/findings-viewpoint-2026-10-07.md` and `docs/guide/how-it-works.md`:

- In first person Viewpoint is GPU-bound (97% GPU). PZ_Optimization gave **no average-fps gain** but
  better 1% lows (106→116 walking, 114→139 driving), fewer spikes (walking p99.9 18.3→11.7 ms) and a
  much lighter game thread (52→36%, 48→28%). **Aim for smoothness, not average fps.**
- **High value**
  - Java memory: a bigger heap. Launcher setting, no code. Measured on 42.21: 6 GB with the stock ZGC
    (see [launcher.md](launcher.md)).
  - Chunk streaming: wake the loader as soon as a chunk is requested (stock waits on a 140 ms timer);
    process chunks in parallel.
  - Zombie updates on worker threads; cache the lookups behind zombie state queries.
  - Limit autosaves, spread newly loaded chunks across frames, fix the house-alarm sound check, reduce
    sound upkeep.
  - Faster boot and loading: script parser, item-property lookups, load-time fixes.
- **Avoid** (Viewpoint patches the same code): player line of sight, zombie culling and LOD, light
  prefetch, vsync and frame pacing.
- **Skip** (top-down only): tree and tile baking, puddles, fog, rain, lightning, zoom, PZ_Optimization's
  visual enhancements.

## Visuals

- Viewpoint loads packs from `Zomboid/viewpoint-shaderpacks`. Native packs (`pack.properties`) show
  under Delete > Graphics > Shaders after a restart; Minecraft (Iris) packs under Graphics > Modern.
  **Our pack is native** (decided 2026-10-30): under an Iris pack Viewpoint stops drawing the world
  itself, so a post-only pack shows an empty frame. Native keeps Viewpoint's renderer.
- **We write our own pack**, not a port of a Minecraft pack (most forbid redistributing changes).
  Target look (Mattias, 2026-10-30): cozy and immersive. Soft warm light, fog, dark nights with warm
  lamp and flashlight pools, wet roads, no blue night tint.
- First-person feel is already covered by other add-ons (Immersive Camera Motion, Immersive Effects,
  Equipment Overlays), and so are 3D trees, roofs, HD textures and 3D props. We don't build those;
  see [modlist.md](modlist.md). Remaining add-on ideas: rain on the view, flashlight improvements.
- Target GPU: RTX 4070 Ti, 12 GB. Video memory is the limit (Viewpoint used ~12 GB on a 4090 at 5K):
  lower draw distance first. No ray tracing (OpenGL). The DLSS Frame Generation add-on (3818838508,
  beta, Windows-only) freezes when the PZ_Optimization UI is on.

## Open questions

- [ ] Which hooks does Viewpoint expose to add-ons? Study existing add-ons or ask the authors
      (discord.gg/projectviewpoint).
- [ ] Which Iris uniforms and passes does Viewpoint actually implement?
- [ ] Re-check the add-ons we want (shader compat 3815225881, Panini 3823639135, DLSS FG 3818838508)
      from a logged-in browser.

## Next steps

1. ~~Confirm Viewpoint and ZombieBuddy are available.~~ Done 2026-10-30.
2. ~~Repo with this plan and both skeletons.~~ Done.
3. Shader pack: native Viewpoint pack (`base=default`). Works in game; the look is still being tuned
   (see [the pack's README](../shaderpacks/KnoxAmbience/README.md)). The Java mod copies the pack into
   `viewpoint-shaderpacks` on startup; that copy works in game.
4. Perf mod first patches: chunk-streamer wake, hot-save limit, house-alarm fix. Merged. Streamer
   wake and hot-save limit confirmed in game; the alarm patches still need a house alarm to test.
5. ~~Mod list and load order ([modlist.md](modlist.md)).~~ Confirmed 2026-10-30.

Building and testing need a real machine: the game's `projectzomboid.jar`, JDK 25 and a GPU.

## Findings (42.21, 2026-10-30)

- Single player has no timed autosave. `IngameState.saveDelay` counts up and resets every 30 s,
  but nothing reads it. The recurring save is `ChunkSaveWorker.HotsaveAncilliarySystems()`, which
  runs each time the chunk save queue becomes empty.
- The installed ZombieBuddy is 2.3.4. 3.0 is beta only and moves the annotations to
  `me.zed_0xff.zombie_buddy.annotations`.
