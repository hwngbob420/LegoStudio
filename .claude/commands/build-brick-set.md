---
description: Build a new logo-free brick set with anchors and assembly steps, preview it and register it
argument-hint: <Set_Name> <brief>
---
Act as **03-brick-architect** and build the set `$ARGUMENTS` in `engine/sets_library.py` (add it to `SETS`).
Preview it with `blender -b --factory-startup -P tools/set_preview.py -- <Set_Name> asset_vault/lookdev/<Set_Name>.png <lighting>`, inspect
the image once, iterate at most twice, then register the set and its anchors in `vault_config/catalog_manifest.json`.
