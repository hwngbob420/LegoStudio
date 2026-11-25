---
description: Produce a brick explainer episode end-to-end (script → shotlist → contact gate → GPU render → overlay → final MP4)
argument-hint: <episode-name> [script text or path]
---
Produce the LegoStudio episode `$ARGUMENTS`.

1. If `productions/<episode>/script.json` does not exist, act as **01-showrunner**. Write it from the given script or idea, run
   `python engine/tts_sapi.py productions/<episode>`, then write `episode_shotlist.json` (read only `vault_config/catalog_manifest.json`
   and `productions/showcase_v1/` as reference).
2. Act as **04-stopmotion-dop** and run the contact gate until `build/qa_report.json` passes. Inspect `contact_sheet.jpg` once.
3. Run `python engine/produce.py productions/<episode> --from lipsync` in the background. It takes about 6 min for 20 s on an RTX 3060.
4. Act as **05-motion-editor** and inspect `qa_frames/_strip.jpg` once. Fix and re-run from the right stage (`--from audio` for overlay-only changes).
5. Report the output path, duration, `build/render_stats.json`, and any QA issues that remain.
