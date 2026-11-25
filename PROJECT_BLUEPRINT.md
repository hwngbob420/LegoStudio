# LegoStudio — Project Blueprint (v1.0, as built and verified 2026-11-25)

## 1. Mission
A reusable, local-first film studio that turns a short script into a 1080p60 brick-stylized comedic explainer:
3D minifigures with **2D sprite faces** in logo-free brick dioramas (Blender 5.2 EEVEE, GPU), **instruction-manual motion graphics**
(Remotion, transparent), offline TTS, lip-sync, procedural SFX and music, composited by FFmpeg. AI output per episode is two small JSON files.

## 2. Machine audit (2026-11-25)
| Item | Found | Consequence |
|---|---|---|
| OS | Windows 11 Pro 23H2 | Windows-safe paths; SAPI available |
| CPU / RAM | i5-12400F / 16 GB | Instancing; scenes under 1k objects |
| GPU | RTX 3060 12 GB, driver 581.80, CUDA 13.0 | EEVEE on GPU (OpenGL backend); Cycles OptiX also detected |
| Blender | 5.2.3 LTS, bundled Python 3.13 | In-Blender code uses only bpy + stdlib; engine id is `BLENDER_EEVEE` |
| Python | 3.11.9 + numpy, Pillow, OpenCV, SciPy | Host tools (atlases, audio, QA) |
| Node / npm | 24.12 / 11.6 | Remotion 4.0.542 (pinned) |
| FFmpeg | 8.1.1 full (libx264, libvpx-vp9) | Alpha-safe VP9 overlay decode |
| Git | 2.52, Git Credential Manager; no `gh` | Repo created via GitHub API, pushed with git |
| TTS | SAPI5 David, Zira | Offline voices plus viseme and word events |
| Disk | 49 GB free | VP9 overlay instead of ProRes; frames deleted after compositing |

**Blender 5.2 probe findings:**
- The engine enum is `BLENDER_EEVEE` (no more `_NEXT`).
- `Action.fcurves` is gone; fcurves live at `action.layers[i].strips[j].channelbag(slot).fcurves`.
- The keyframe interpolation preference isn't honoured under `--factory-startup`, so CONSTANT is set per fcurve.
- The Attribute node (OBJECT) reading a keyframed custom property switches atlas cells in background renders (verified by pixel diff).
- Grease Pencil v3 strokes can be created headless.

## 3. Architecture
```
script.json ─► tts_sapi.py ─► build/timing.json (+ wav, visemes, words; audio-calibrated)
                    │
01-showrunner ─► episode_shotlist.json  (time refs: L2.w3, S1.t1, END)
                    │
      ┌─────────────┼───────────────────────────────┬──────────────────────────────┐
lipsync_2d.py   stage_compiler.py (Blender -b)    remotion_props.py               audio_design.py
mouth tracks    sets · cast · acting · faces ·     → overlay_props.json           VO + SFX + BGM
@12 fps         FX · assembly · cameras            → Remotion VP9+alpha @60 fps   → mix.wav
                    │ contact mode → contact_sheet_gen.py (QA gate, exit 1 on face/UI overlap)
                    │ render mode  → frames/f_####.png @12 fps
                    └──────────────► master_compositor.py ─► output_final.mp4 (1080p60) ─► qa_frames.py
```
`engine/produce.py` runs all of it, resumable with `--from <stage>`.

### Key decisions
- **12 unique fps → 60 fps.** The world animates on twos with CONSTANT keys. FFmpeg holds each frame 5×; Remotion renders natively at 60 fps.
- **2D faces.** Cylinder heads carry a face material; `face_expr` / `face_mouth` object props select atlas cells. No mouth geometry exists.
- **Native procedural bricks by default.** Instanced meshes, plain studs, micro-bevel and seams. Each placement records an LDraw part id, and sets export `.ldr`.
- **10× scale** (1 stud = 8 cm). f/1.0–1.8 lenses give physically plausible tilt-shift miniature DoF; focus follows a head-centre empty.
- **Rule of thirds via lens shift.** shift_x = ±1/6 places the subject on a third without changing perspective.
- **Zero-overlap UI contract.** UI zones and head boxes are compared at 5–6 sampled frames per shot against every active overlay cue, and the build fails on overlap.

## 4. Five sub-agents (token-minimal)
| Agent | Input | Output |
|---|---|---|
| 01-showrunner | script/idea + catalog + timing | `script.json`, `episode_shotlist.json` |
| 02-minifig-caster | brief | `vault_config/minifig_recipes/*.json` |
| 03-brick-architect | brief | builder in `sets_library.py` + catalog entry |
| 04-stopmotion-dop | shotlist | reads ONE `contact_sheet.jpg`, edits cameras/zones, triggers render |
| 05-motion-editor | shotlist + timing | Remotion components, final composite, reads ONE QA strip |

About 10–12k tokens per 20 s episode; rendering costs zero tokens.

## 5. Third-party ecosystem: integration status (honest)
All 14 listed repositories were verified to exist (`git ls-remote`). Policy: no unvetted third-party code is executed. Native bpy is the default path.

| Repo | Status | Notes |
|---|---|---|
| remotion-dev/remotion | **Integrated** | npm `remotion@4.0.542`, overlay compositions in `remotion_studio/` |
| DanielSWolf/rhubarb-lip-sync | **Optional backend** | `bootstrap --with-rhubarb` fetches the official v1.13 release; `lipsync_2d.py --rhubarb`. Default is SAPI visemes |
| Poly Haven (HDRIs) | **Integrated** | CC0 HDRIs fetched by bootstrap (studio_small_09, golden_bay) |
| LDraw parts library | **Optional** | `bootstrap --with-ldraw` fetches the official complete.zip. Sets export `.ldr` with real part numbers |
| ScanMountGoat/ldr_tools_blender | Verified, not installed | `.ldr` exports are compatible for import. Native builder used for rendering |
| TobyLobster/ImportLDraw | Verified, not installed | Step-by-step build idea reimplemented natively (`obj["step"]` → assembly transition) |
| pybricks/ldraw, michaelgale/ldraw-py, anteloc/ldraw-nova | Verified, not used | Procedural builder plus `.ldr` writer cover the needs without extra deps |
| Kosta345/bricktrait | Pattern reference | Recipe-based casting adopted (`minifig_recipes/*.json`) |
| BlenderBricks/EpicFigRig | Pattern reference | Native 10-bone rig (root, hips, torso, head, arms, hands, legs) built in bpy |
| BOXELS/lip-sync-5.2, Premik/blender_rhubarb_lipsync_ng | Verified, not used | 2D atlas lip-sync implemented natively (Attribute-node cell switch) |
| chsh2/nijiGPen | Verified, not installed | FX are generated as Grease Pencil v3 strokes via bpy. Artists can hand-draw with nijiGPen on the same GP objects |
| ahujasid/blender-mcp | Available in the authoring session | Batch production uses headless `blender -b` |
| vibe-motion/remotion-code-motion-explainer | Pattern reference | Explainer cue pattern (registry of typed cues driven by JSON props) |

## 6. Assets
- **Cast (5):** Max, Priya, Kofi, Grandma Lin, Bricky. They span skin tones (light, light-warm, medium-brown, deep-brown, classic yellow),
  ages (late 20s to 70s), 5 hair styles, 5 torso prints, glasses, and per-face details (freckles, lashes and blush, beard, wrinkles).
- **Sets (3):** Set_BrickCreatorDesk, Set_BrickCafeStreet, Set_BrickOfficeStage, each with anchors, assembly steps and a lighting preset.
- **Faces:** 9 eye expressions and 14 mouths (Rhubarb A–H, X, plus smirk, frown, wavy, shock_O, grin) in 2048² atlases.
- **Acting:** 15 gestures. **FX:** 8 GP3 types. **UI cues:** 4 types plus subtitles.

## 7. Definition of done
- [x] 4+ minifigs with face atlases, NLA-style gesture library, 3 logo-free sets in `catalog_manifest.json`
- [x] `productions/showcase_v1/output_final.mp4`: 19.5 s, 1080p60, assembly opener, two-character dialogue with TTS, 2D lip-sync,
      expression switches (deadpan → shocked → smug), stop-motion gestures, GP FX, tilt-shift DoF, rim light, thirds framing,
      STEP cards, brick bar chart, subtitles, zero face overlap (gate: pass)
- [x] Contact sheet plus 13 QA frames inspected and iterated
- [x] Pushed to `origin main`
