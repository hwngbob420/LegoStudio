---
description: Diagnose the LegoStudio environment and pipeline health
---
Run `python apps/brick-engine/tools/studio_doctor.py` and report each check. On failures, fix what you can:
- Missing assets → run `python bootstrap_studio.py`.
- Missing node_modules → run `npm install` at the repo root.
- Blender path → set it in `studio_config.json`.

Ask before installing system software.
