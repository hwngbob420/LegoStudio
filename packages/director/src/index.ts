// Bộ đạo diễn tất định của Lego Studio Engine: storyboard + timing + manifest -> baked_timeline.json.
// Blender (bản cuối) và Three.js (xem trước) chỉ phát lại kết quả này.
export { frameOf, Timeline } from "@lse/shared";
export { bake, type BakeInput } from "./bake";
export { poseAt, bakeActor, POSED_BONES } from "./acting";
export { ACTION_DEFS } from "./actions";
export { planCamera, project, cameraRight, cameraMatrix } from "./camera";
export { bakeFace, mouthTrack, quantise, SAPI_TO_SHAPE, type FaceSpec } from "./faces";
export { RigModel } from "./rig";
export { Rng, crc32 } from "./rng";
export * as M3 from "./math3";

export const DIRECTOR_VERSION = "1.0.0";
export { overlayProps, sliceOverlay, validateLayout, type OverlayProps, type Issue } from "./overlay";
export { compose, autoPlan, autoFix, spliceBlocks, Beat, BeatPlan, type ComposeContext } from "./compose";
export { graphemeVisemes, lineVisemes } from "./voice";
export { makeShorts, SHORTS_MAX_SEC } from "./shorts";
export { sliceTimeline, sliceHash, sha256Hex, stableJson } from "./slice";
export { segmentAt } from "./acting";
// Gđ 6: dàn cảnh nhiều set, kiểm bố cục, lọc đơn điệu
export { visualLint, SAME_SCALE_MAX, STATIC_MAX, type VisualNote } from "./visualLint";
export { checkStage, floatingObjects, matrixEpisode, CAMERA_MATRIX, type LayoutIssue } from "./layout";
export { usesStage, setOrigins, cutawayHidden, visibilitySchedule } from "./stage";
export { VISUAL_TO_SHOT } from "./compose";
