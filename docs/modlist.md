# Mod list and load order

Confirmed by Mattias on 2026-10-30 for personal use on Build 42.21. Built from the 58 items subscribed
on his PC (read from the Workshop folder) plus a few additions from the Viewpoint add-on collection.

KnoxAmbience itself still needs only ZombieBuddy and Viewpoint. Everything else here is a personal
pick, not a prerequisite (see PLAN.md decision 5).

## Conflicts with KnoxAmbience

None found. All 11 Java add-on jars in the subscribed set were scanned. None of them patch the
classes KnoxAmbience patches: `WorldStreamer`, `ChunkSaveWorker`, `Alarm`, `AmbientStreamManager` or
`Core.EndFrameUI`. Re-check when adding a new Java add-on.

KnoxAmbience also hooks one method in Rolling Hills (`TrueWeatherCompat.supports`) so its hills stay
on under our shader pack. Re-check that hook after a Rolling Hills update.

## Load order

| Order | Mod | Workshop ID | Status | Notes |
|-------|-----|-------------|--------|-------|
| 1 | ZombieBuddy | 3619862853 | have | Java mod loader |
| 2 | Project Viewpoint | 3809306528 | have | 0.1.6.1, 42.21 only. All rights reserved: dependency only |
| 3 | Knox Ambience | ours | have | Perf patches |
| 4 | Mod Update and Alert System | 3077900375 | have | Library for SwapIt |
| 4 | errorMagnifier | 2896041179 | have | Library for SwapIt |
| 4 | Tsar's Common Library | 3402491515 | have | Library for SVU3 |
| 4 | TchernoLib | 3389605231 | have | Library for Lean & Lie |
| 4 | Kitsune Library | 3390453390 | have | Library for STFR |
| 5 | Project Viewpoint QOL | 3811256204 | **add** | Cursor, one-key actions, looting, auto-walk |
| 5 | Viewpoint Extended Support | 3812978679 | optional | Only for vehicle camera modes. Bind the free-cursor key in one mod only |
| 5 | Viewpoint - Interface | 3812616893 | **add** | First-person UI. Use one UI mod only |
| 6 | 6282 3D models for Viewpoint | 3810302175 | have | Base model pack |
| 6 | Viewpoint's Models Overhaul | 3818700431 | **add** | Interactive furniture. Pulls in its Workstations mod. Pick the winner in Viewpoint's Model Packs tab |
| 6 | View3dfix + Crop models | 3824199038 | have | Load after the 6282 pack so its crops win |
| 6 | Viewpoint - 3D Fences | 3814486926 | have | |
| 6 | Viewpoint: Living Props | 3816442251 | have | |
| 6 | Viewpoint - Visible Loot | 3818189653 | have | Needs the 6282 pack, load after it |
| 6 | Viewpoint Smooth 3D | 3826458381 | optional, later | Overrides 6282 models and trees. Try once the baseline works |
| 7 | Project Viewpoint: TREE in 3D | 3813172420 | have | Near trees, seasons, wind, leaves |
| 8 | PZ HD Floors & Terrain | 3812259313 | have | Max Texture Size 2048, Viewpoint near texels 128 |
| 8 | PZ HD Walls ×2 | 3812583935 | have | Extra VRAM |
| 9 | Viewpoint - Proper Roofs | 3818941548 | have | The one roof mod. Writes roof tiles into the save |
| 9 | Viewpoint - Surface Fix | 3814398576 | have | Texture fixes, complements Proper Roofs |
| 10 | Project Viewpoint: Visible Construction | 3815631078 | **add** | Building in first person. Use one construction mod only |
| 11 | Viewpoint - Immersive Effects | 3812984535 | **add** | Moodle and mask screen effects. Reported FPS drop: measure |
| 11 | Immersive Camera Motion | 3818432217 | **add** | Head bob, sway, panic and pain shake |
| 11 | Viewpoint - Equipment Overlays | 3813230118 | **add** | Helmet and mask framing |
| 12 | Blood FX for Viewpoint | 3811472160 | have | |
| 13 | Viewpoint Rolling Hills | 3815630947 | have, optional | Terrain heights. Its own file asks to load after Blood FX |
| 14 | OldPoint | 3815999052 | have, optional | Overhead camera in the Shift+O cycle |
| 15 | Recoil & ADS | 3812612054 | optional | Guns. Add one at a time |
| 15 | True Ballistics | 3812864848 | optional | Guns. Add after Recoil & ADS |
| 16 | Gameplay mods | | have | See below |
| – | Knox Ambience shader pack | ours | – | File drop into `Zomboid/viewpoint-shaderpacks` |

## Gameplay mods (keep)

Enable in this order where pairs are listed:

- Authentic Z (2335368829): enable **one** submod only (Authentic Z - Current). The three exclude each other.
- SwapIt (2366717227), after its two libraries.
- Standardized Vehicle Upgrades 3: Core (3403490889), then Vanilla (3304582091), then SVU3_Fix (3776890692).
- Small Town First Responders: Core (3459633953) and Main (3459638181) only. Leave the Spongie's Open
  Jackets submods off; they need SpnOpenCloth, which is not subscribed.
- Tanks Have Propane (3676347667), then Unofficial Fixes (3779211885).
- Engine Keeper (2710075476), then Partial Harvest (3779117471).
- True Moozic (3632610172), then Essentials (3687081106).
- Lean & Lie (3652012357).
- No declared conflicts: PZK Vanilla Plus Car Pack and Carzone (3217685049), Handlebar's Preppers
  (3252451158), Road Builder (3433311021), Immersive Vehicle Paint (3464606086), Break Big Rocks
  (3538602374), Better Safehouse (3634569678), Item Condition Overlay (3641048285), dustinguished bolt
  cutters (3671176591), Vanilla Firearms Rework (3720484992), Vanilla Craftable Foods (3742923053),
  Nick's Turn Off Fridges (3778868211), Puffin's Retro Relics (3788360646), TSS QoL Recipes
  (3799481146), TSS Expanded Zombie Loot (3799481379), Wallpapers and More Paint (2999595757),
  Lantern Fix (3495594275).

These Lua mods were not diffed against each other for file overrides.

## Remove

| Mod | Workshop ID | Why |
|-----|-------------|-----|
| Viewpoint - Roofs (WIP) | 3817294484 | Duplicates Proper Roofs |
| Viewpoint Tile Fix - Complete Roofs | 3814178814 | Duplicates Proper Roofs; Kentucky and Grapeseed only. Fallback if Proper Roofs misbehaves |
| Zed's Universal Mod Unbork | 3677147974 | Java patches for old mods we don't have |
| zdk | 3690770492 | Only needed by Mod Unbork |
| TSS MP Ranking CoFo | 3799469243 | Multiplayer only |
| Vanilla Expanded Spawns | 3703597953 | Multiplayer spawn points |
| Advanced Death Log | 3775495236 | Multiplayer build |
| Brush Tool Save Fix | 3775272983 | Debug tool fix, not needed for play |

Compare the three roof mods on the same house before unsubscribing from the two extras.

## Don't add

- Project Viewpoint: True Weathers & Lighting (3813908957): we replace it (PLAN.md decision 5).
- Viewpoint - Wind Sway + Falling Leaves (3823558761): TREE in 3D already does this.
- Viewpoint Far Tree Models (3824433732): needs the Lowpoly Tree Pack, a different style from TREE in 3D.
- More than one UI, construction or roof mod.

## Watch points

- VRAM: HD Walls, HD Floors, the model packs and Visible Loot are the heavy part on a 12 GB card.
  Switch them off first if you see hitching, and measure with and without.
- Proper Roofs places tiles the first time an area loads. That work lands on chunk streaming, so
  include it in frame-time runs.
- Cloud fetches of Steam pages show false "removed" banners. Check availability from a logged-in browser.

## What this means for KnoxAmbience

Other mods already cover 3D trees, roofs, HD textures, 3D props and loot, terrain, blood, the overhead
camera, and first-person feel (head bob, sway, screen effects, mask overlays). We don't build those.

Still ours: smoothness (chunk streaming, hot-save, alarm and more), the shader pack (weather fog,
light falloff, dark nights, wet roads), and measured VRAM guidance for this stack.
