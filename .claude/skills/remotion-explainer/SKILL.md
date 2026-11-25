---
name: remotion-explainer
description: LegoStudio's Remotion overlay layer (Brick Instruction Manual + whiteboard grammar, cue types, alpha render, compositing). Use when adding or restyling cards, charts, arrows or subtitles.
---
# Remotion Explainer Overlay

**Grammar.** Paper-white cards (#FFFDF7) with a 6 px ink outline (#1B1D21), 26 px radius and a hard 10/12 px drop shadow.
Blue STEP blocks carry two studs. Text is Nunito 800/900. Pops use spring scale with a small rotation; exits snap back. Arrows are
hand-drawn: a quadratic path with a white under-stroke, drawn on with a dash offset and a slight wobble.

**Cue types** (`src/Overlay.tsx` REGISTRY):
- `step_badge` {step, title, check?}
- `part_callout` {count, label, icon:"mug", note}: mugs drop in one by one, "xN" counts up
- `brick_chart` {title, bars:[{label, value, color, t, collapse_t?}]}: bricks stack on time `t`; `collapse_t` topples the tower and adds "?!"
- `arrow` {from:[x,y], to:[x,y]} in normalised screen coordinates
- Subtitles are automatic from TTS word times: a speaker chip, with the active word in the speaker colour

**Zones** use normalised rects shared with the Blender compiler and the contact gate (left_third, right_third, top_left, top_right, top_center).
The bottom band y>0.83 is reserved for subtitles.

**Render with alpha:**
`npx remotion render src/index.ts Overlay out.webm --props=<overlay_props.json> --codec=vp9 --pixel-format=yuva420p --image-format=png`
FFmpeg must decode it with `-c:v libvpx-vp9` *before* `-i`; the native vp9 decoder drops alpha.

To add a cue: create a component taking `{cue, W, H}`, register it, document its fields in `catalog_manifest.json`, and preview it with `npx remotion still`.
