---
name: brick-look-dev
description: LegoStudio ABS-plastic look-dev rules (materials, lighting presets, tilt-shift scale, brand safety). Use when changing materials, lights, colours or adding parts/sets.
---
# Brick Look-Dev

**Plastic.** `look_dev.abs_material(color, kind)` builds Principled BSDF with roughness 0.22, coat 0.35 (roughness 0.06) and subsurface 0.06
(scale 0.02, tinted by the base colour). Kinds: `abs`, `trans`, `glow`, `matte`, `metal`. Colours come from `workspace/channel_library/palette.json` (sRGB hex, converted to linear).

**Geometry.** Every part is one cached mesh, and placements share it (instancing). The colour sits on an object-linked material slot.
The 2.8 mm bevel and 1.2 mm gap per side (at 10× scale) create the seams that sell "real bricks". Studs are plain cylinders with no logos.

**Scale.** 1 stud = 0.08 m, ten times real size, so f/1.0–1.8 gives a physically plausible miniature (tilt-shift) falloff.
The camera clip_start is 0.02.

**Lighting presets** live in `workspace/channel_library/lighting/*.json`: a Poly Haven HDRI (CC0, fetched by bootstrap) plus key, fill, rim and rim2.
The rim is mandatory because it separates the minifig from the background. View transform is AgX "Medium High Contrast" at exposure −0.2.
- `studio_bright`: explainer default
- `cozy_golden_hour`: warm sun key, cafe
- `moody_night_desk`: monitor-blue key, low HDRI

**EEVEE (Blender 5.2, engine id `BLENDER_EEVEE`).** 32 TAA samples, screen-space ray tracing with denoise, fast GI and GTAO. `--fast` drops to 8 samples.

**Brand safety.** No logos on studs, no trademark words in any rendered frame (posters, screens and torso prints are text-free).
The product name appears only in repository text, never in pixels.
