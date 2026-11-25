# LegoStudio — agent operating manual

Brick-stylized explainer film studio. AI writes **tiny JSON**; local Blender/Remotion/FFmpeg do 100% of the heavy work.

## One-liners
```bash
python bootstrap_studio.py                       # fresh clone -> ready (HDRIs, atlases, textures, npm deps)
python engine/produce.py productions/<ep>        # script.json + episode_shotlist.json -> output_final.mp4
python engine/produce.py productions/<ep> --from audio   # re-cut overlay/audio without re-rendering 3D
python tools/studio_doctor.py                    # health check
```
Slash commands: `/produce <ep> <idea>`, `/cast-minifig <id> <brief>`, `/build-brick-set <Set> <brief>`, `/studio-doctor`.

## The 5 sub-agents (`.claude/agents/`)
| Agent | Writes | Reads (and nothing else) |
|---|---|---|
| 01-showrunner | `script.json`, `episode_shotlist.json` | `vault_config/catalog_manifest.json`, `build/timing.json`, showcase_v1 as reference |
| 02-minifig-caster | `vault_config/minifig_recipes/*.json` | palette + an existing recipe |
| 03-brick-architect | a builder in `engine/sets_library.py` | `brick_builder.py` API, `build_creator_desk` |
| 04-stopmotion-dop | shotlist camera/zone edits | `contact_sheet.jpg` + `build/qa_report.json` (ONE image per iteration) |
| 05-motion-editor | `remotion_studio/src/**` | `qa_frames/_strip.jpg` |

## Token rules
- Never read engine sources to *produce* an episode; the catalog plus the showcase shotlist is the whole contract.
- Inspect at most ONE image per QA iteration (`contact_sheet.jpg` or `_strip.jpg`). Each costs about 1.5k tokens; never read individual frames in bulk.
- Use time refs (`L2.w3`, `S1.t1`, `END`) so a re-timed TTS take doesn't require rewriting the shotlist.
- Long renders run in the background (`produce.py` is resumable with `--from <stage>`).

## Hard rules
- **Faces are 2D.** Never add mouth geometry or shape keys. Change expressions via `face_expr` / `face_mouth` keys only.
- **Zero-overlap UI.** A card or chart on one third means the subject goes on the opposite third. The contact gate (`contact_sheet_gen.py`)
  fails the build on any face/UI intersection at sampled frames.
- **Brand-safe pixels.** Plain studs, and no trademark words, logos or real brand marks in any rendered frame.
- **Stop-motion cadence.** The world runs at 12 fps (on twos) with CONSTANT keys; delivery is 60 fps. Don't add bezier smoothing to world animation.
- **Blender 5.2:** the engine id is `BLENDER_EEVEE`, Action fcurves live in `action.layers[].strips[].channelbag(slot)`, and you must run with
  `-b --factory-startup` so user add-ons stay out of batch renders.
- Heavy or reproducible files never enter git (`asset_vault/`, `frames/`, `*.blend`, `node_modules/`). Only `output_final.mp4`,
  `contact_sheet.jpg` and `qa_frames/*.jpg` are committed per production.

## Map
`engine/` pipeline (see PROJECT_BLUEPRINT.md §3) · `vault_config/` catalog, recipes, palette, lighting, atlas spec ·
`remotion_studio/` overlay compositions · `tools/` look-dev, set preview, doctor · `productions/<ep>/` episodes.
