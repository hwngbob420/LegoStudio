---
name: stop-motion-camera
description: How LegoStudio cameras, timing and stop-motion acting work (12 fps world, presets, lens-shift thirds, DoF, shake, acting clips). Use when editing shots or engine/stage_compiler.py / acting_library.py.
---
# Stop-Motion Camera & Acting

**Cadence.** The world animates at 12 fps, which is "on twos" of 24. Every frame is a discrete key with CONSTANT interpolation
(Blender 5 slotted actions: `acting_library.set_constant()` walks `action.layers[].strips[].channelbag(slot).fcurves`).
FFmpeg holds each frame 5× for 60 fps delivery, an even cadence, while the Remotion graphics stay at a smooth 60 fps.

**Acting.** `ACTIONS` in `engine/acting_library.py` are pose keys in degrees, layered additively over `idle_breathe`, with a ±0.35° per-frame "boil".
Bone axes (all bones point +Z, roll 0):
- arm X<0 raises it forward; arm.L Z>0 and arm.R Z<0 raise it sideways
- leg X<0 swings it forward
- torso/head X>0 leans forward, Y>0 turns to the figure's left, Z tilts

Add a gesture by writing 3–5 keys. Loops need a `loop` period; one-shots use normalised time.

**Camera presets** (`place_camera`):
- `assembly_high`, `wide_establish`: framed from the set centre
- `mcu`: subjects[0] at d≈0.95 m, 50 mm, f/1.4
- `ecu`: d≈0.8 m, 70 mm, f/1.8
- `two_shot`: the separation fills `spread` (0.46) of the frame width

**Rule of thirds** comes from lens shift: shift_x = +1/6 puts the subject on the left third (−1/6 for the right). The look-at stays on the head,
so the perspective doesn't change.

**DoF** focuses on `FOCUS_<fig>`, an empty at the head centre parented to the head bone, so focus follows the jump and lean.

**Moves:** push_in, pull_out, drift_right, crane_down, plus Gaussian micro-shake (1.2 mm, 0.05°) keyed per frame. That is handheld miniature, not drone.

**Markers.** One camera per shot, bound to a timeline marker at the shot start. A single `render(animation=True)` cuts between them.
