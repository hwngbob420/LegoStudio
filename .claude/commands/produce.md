---
description: Produce a brick explainer episode end-to-end (script → shotlist → contact gate → GPU render → overlay → final MP4)
argument-hint: <episode-name> [script text or path]
---
Produce the LegoStudio episode `$ARGUMENTS`.

1. If `workspace/projects/<episode>/script.json` does not exist, act as **01-showrunner**. Write it from the given script or idea, run
   `python apps/brick-engine/tts_sapi.py workspace/projects/<episode>`, then write `storyboard.json` (read only `workspace/channel_library/catalog.json`
   and `workspace/projects/showcase_v1/` as reference).
2. Act as **04-stopmotion-dop** and run the contact gate until `build/qa_report.json` passes. Inspect `contact_sheet.jpg` once.
3. Run `python apps/brick-engine/produce.py workspace/projects/<episode> --from lipsync` in the background. It takes about 6 min for 20 s on an RTX 3060.
4. Act as **05-motion-editor** and inspect `qa_frames/_strip.jpg` once. Fix and re-run from the right stage (`--from audio` for overlay-only changes).
5. Report the output path, duration, `build/render_stats.json`, and any QA issues that remain.
