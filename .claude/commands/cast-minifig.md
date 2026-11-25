---
description: Cast a new minifigure character (recipe JSON + textures + look-dev check + catalog entry)
argument-hint: <id> <one-line character brief>
---
Act as **02-minifig-caster** and create the minifigure `$ARGUMENTS`.
Write `workspace/channel_library/cast/<id>.json`, run `python bootstrap_studio.py`, render
`blender -b --factory-startup -P apps/brick-engine/tools/lookdev_test.py -- workspace/channel_library/baked/lookdev/cast.png`, look at it once, then add the id to
`workspace/channel_library/catalog.json`. Report the recipe and what makes the character visually distinct from the existing cast.
