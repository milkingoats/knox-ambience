# Mod list and load order (draft)

| Order | Mod | Workshop ID | Why | Notes |
|-------|-----|-------------|-----|-------|
| 1 | ZombieBuddy | 3619862853 | Java mod loader | Required by Viewpoint and our perf mod |
| 2 | Project Viewpoint | 3809306528 | First/third-person renderer | Proprietary, dependency only |
| 3 | Knox Ambience | (ours) | Smoother frame times | This repo |
| – | Knox Ambience shader pack | (ours, file drop) | Visuals | Copy to `Zomboid/viewpoint-shaderpacks` |

To check: conflicts between each immersion mod and Viewpoint, and whether the add-ons below are
still public.

- Viewpoint DLSS Frame Generation (3818838508): optional for RTX 40 cards
- Viewpoint Shader Panini (3823639135): optional projection add-on

Incompatible (we replace these; see PLAN.md decision 5):

- Project Viewpoint: True Weathers & Lighting (3813908957): weather, lighting and shader pack overhaul
