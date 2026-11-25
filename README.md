# LegoStudio (Lego Studio Engine)

> Đang nâng cấp lên v2 theo mô hình pixel-story-engine (Studio web 5 tab, kho 2 tầng, AI viết JSON). Tiến độ: `docs/PROGRESS.md`.

A local-first film studio for **brick-stylized comedic explainer videos**: minifigures with crisp **2D sprite faces** acting in logo-free
brick dioramas (Blender 5.2, EEVEE on GPU), with **instruction-manual motion graphics** layered on top (Remotion), plus offline TTS, automatic 2D lip-sync,
procedural SFX and music, and an FFmpeg master compositor.

The AI writes only a small JSON shotlist. Everything heavy runs on your machine at zero API cost.

![contact sheet](workspace/projects/showcase_v1/contact_sheet.jpg)

## Quick start
```bash
git clone https://github.com/hwngbob420/LegoStudio && cd LegoStudio
python bootstrap_studio.py                    # audit + HDRIs + generated textures + Remotion deps
python apps/brick-engine/produce.py workspace/projects/showcase_v1
```
Output: `workspace/projects/showcase_v1/output_final.mp4` (1920×1080, 60 fps, AAC).

Requirements: Windows 10/11 (SAPI voices), Blender 5.1+ (tested 5.2.3 LTS), Python 3.10+ with numpy and Pillow, Node 20+, and an FFmpeg full build.
An NVIDIA GPU is recommended (tested on an RTX 3060 12 GB).

## New episode
1. Create `workspace/projects/<ep>/script.json` (lines and speakers) and `storyboard.json` (shots, cameras, expressions, UI cues).
   Or, in Claude Code, run `/produce <ep> "<your idea>"` and the 01-showrunner agent writes both from `workspace/channel_library/catalog.json`.
2. Run `python apps/brick-engine/produce.py workspace/projects/<ep>`.

Stages: `tts → lipsync → props → contact (QA gate) → render → audio → overlay → composite → qa → clean`. Resume with `--from <stage>`.

## What's inside
| Area | What it does |
|---|---|
| `apps/brick-engine/brick_builder.py` | Procedural bricks, plates, tiles, rounds and cones with plain studs (no logos), micro-bevel and seams. Instanced meshes. `.ldr` export |
| `apps/brick-engine/sets_library.py` | Three dressed sets: **Set_BrickCreatorDesk**, **Set_BrickCafeStreet**, **Set_BrickOfficeStage**, with stage anchors and assembly steps |
| `apps/brick-engine/minifig_builder.py` | Procedural minifigure (legs, hips, torso print, arms, C-hands, cylinder head, hair styles, glasses) on a 10-bone rig (6 joint groups) |
| `apps/brick-engine/acting_library.py` | 15 stop-motion gestures (talk, point, shrug, shock jump, sip coffee, walk...) baked per frame on twos, with puppet "boil" |
| `apps/brick-engine/look_dev.py` | ABS plastic shader (coat, subsurface), 2D face shader driven by object props, HDRI and key/fill/rim presets |
| `apps/brick-engine/fx_library.py` | Grease Pencil v3 emotion FX: sweat drop, shock lines, ?, !, sparkle, anger, steam |
| `apps/brick-engine/stage_compiler.py` | Shotlist → scene: sets, cast, acting, faces, lip-sync, assembly transition, cameras/markers, DoF, shake |
| `apps/brick-engine/tts_sapi.py`, `lipsync_2d.py` | Offline SAPI TTS with viseme and word events (audio-calibrated), quantised to 12 fps mouth tracks. Optional Rhubarb |
| `apps/brick-engine/contact_sheet_gen.py` | One-image QA gate with safe-zone boxes and an automatic face-vs-UI collision check over sampled frames |
| `apps/brick-engine/audio_design.py` | Procedural ABS clacks, pops, whooshes, a brick tumble and a ukulele/marimba music bed, ducked under VO |
| `apps/video-engine/` | Transparent overlay: STEP badges, part-count callouts, stacked-brick bar chart with collapse, hand-drawn arrows, word-synced subtitles |
| `apps/brick-engine/master_compositor.py` | 12 fps plate held 5× → 60 fps, grain and vignette, VP9-alpha overlay, mix → H.264 MP4 |
| `.claude/` | 5 sub-agents, 4 skills, 4 slash commands (`/produce`, `/cast-minifig`, `/build-brick-set`, `/studio-doctor`) |

![cast and sets](docs/catalog_cast_and_sets.jpg)

## Starter cast
Max (tired dev), Priya (smug team lead), Kofi (barista philosopher), Grandma Lin (retired engineer) and Bricky (classic yellow narrator).
Each is a JSON recipe in `workspace/channel_library/cast/`.

## Brand safety
All studs are plain, and rendered frames contain no trademark words or logos. Posters, screens and torso prints are text-free.
This project is not affiliated with or endorsed by the LEGO Group.

## Docs
`docs/MASTER_ADD.md` (đặc tả v2, phương án C) · `docs/PROGRESS.md` (tiến độ) · `CLAUDE.md` (luật cho Claude) · `docs/V1_BLUEPRINT.md` · `docs/OPTIMIZATION_LOG.md`.
