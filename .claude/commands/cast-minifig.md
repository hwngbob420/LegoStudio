---
description: Cast a new minifigure character (recipe JSON + textures + look-dev check + catalog entry)
argument-hint: <id> <one-line character brief>
---
Act as **02-minifig-caster** and create the minifigure `$ARGUMENTS`.
Write `vault_config/minifig_recipes/<id>.json`, run `python bootstrap_studio.py`, render
`blender -b --factory-startup -P tools/lookdev_test.py -- asset_vault/lookdev/cast.png`, look at it once, then add the id to
`vault_config/catalog_manifest.json`. Report the recipe and what makes the character visually distinct from the existing cast.
