# OPTIMIZATION_LOG

Machine: i5-12400F · 16 GB RAM · RTX 3060 12 GB (driver 581.80) · Blender 5.2.3 LTS (EEVEE) · Windows 11.
Benchmark: `productions/showcase_v1`, 19.5 s, 1920×1080, 2 actors, 5 shots, about 445 objects.

## Benchmarks
| Run | Change | GPU render | s/frame | Total pipeline |
|---|---|---|---|---|
| v1 | first end-to-end (32 TAA samples, 234 frames @ 12 fps) | 274 s | 1.17 | 6.4 min |
| v2 | grade/contrast, ECU reframe, time-sampled UI gate (same settings) | 277 s | 1.18 | 6.7 min (contact 8 s · overlay 63 s · composite 42 s) |
| set previews | CreatorDesk 391 parts / 20 meshes · Cafe 226 / 16 · Stage 199 / 9 | 1280×720 still ≈ 1.5 s | | |

## Optimizations (newest last)
1. **Render 12 unique fps, deliver 60 fps.** The world animates on twos, so only 12 frames/s differ. Blender renders 234 frames instead of
   1170 for native 60 fps, a **5× GPU saving**. FFmpeg's `fps=60` holds each plate frame exactly 5 times (even cadence, no judder), while the Remotion
   graphics render natively at a smooth 60 fps.
2. **Instanced part meshes.** Each unique brick shape is one mesh datablock shared by all placements; colour lives on object-level material slots.
   The CreatorDesk set has 391 parts but only 20 meshes, and builds in about 1.4 s.
3. **Logo-free studs.** Plain 18-segment cylinders (10 segments on baseplates, no bevel) instead of embossed logos. That keeps the frames brand-safe and keeps
   the geometry light (a 32×24 baseplate is 768 studs).
4. **2D faces instead of facial rigs.** Expressions and visemes are one Attribute-node lookup into a 2048² atlas. There are no shape keys or
   deformation, so a face change costs nothing to evaluate or render.
5. **Single contact-sheet gate.** One keyframe per shot at 50% resolution (about 2 s per shot) plus head bounding boxes sampled at 5–6 frames per
   shot. Framing and collision errors are caught in about 10 s instead of after a 5-minute render, and the agent reads ONE image (~1.5k tokens).
6. **SAPI viseme and word events instead of a lip-sync model.** Lip-sync and word-timed subtitles come straight from the TTS engine with no extra
   processing pass. SAPI's AudioPosition drifts about 1.4× (an internal 16 kHz vs 22.05 kHz mismatch), so timings are linearly calibrated to the
   measured speech onset and offset.
7. **Constant-interpolation baked keys.** The stop-motion look *and* no curve evaluation surprises: each frame's pose is exact and deterministic
   (stable `zlib.crc32` seeds, not Python's randomised `hash`).
8. **VP9 + alpha overlay** (about 1–3 MB) instead of ProRes 4444 (about 750 MB for 20 s). The disk only had 49 GB free. Decoding uses `libvpx-vp9`
   explicitly so alpha survives.
9. **Resumable pipeline.** `produce.py --from audio` re-cuts overlay and audio in about 1.5 min without touching the GPU render.
   `--from props` re-gates and re-renders without re-running TTS.
10. **Disk hygiene.** The `clean` stage deletes the PNG plate frames (about 250 MB) and the overlay WebM after compositing.
11. **Time references.** The shotlist uses `L3.w2`-style refs resolved by `engine/timeref.py`, so a re-timed TTS take needs no shotlist edits.
    That saves showrunner tokens on every revision.
12. **Batch Blender runs with `--factory-startup`.** User add-ons (including the live MCP bridge) are never loaded in headless renders,
    so startup drops to about 2 s and runs stay deterministic.

## Token budget per production (estimated)
| Step | Who | Tokens |
|---|---|---|
| script.json + shotlist (catalog ≈2.5k in, JSON ≈3k out) | 01-showrunner | ~6k |
| contact-sheet review (1 image ≈1.5k + report) × 1–2 | 04-stopmotion-dop | ~2–4k |
| QA strip review (1 image) | 05-motion-editor | ~2k |
| **Total per 20 s episode** | | **~10–12k tokens** (rendering itself: 0) |

## Ideas not yet done
- Persistent Blender worker (skip about 2 s startup and 2 s scene build per stage).
- Render only frames that changed: hold frames where nothing moves (set-dressing beats) could be deduplicated by hashing keyed state.
- `--fast` preview mode (8 samples) for animatics: already wired, not benchmarked yet.
