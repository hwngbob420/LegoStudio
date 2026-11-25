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
export { overlayProps, validateLayout, type OverlayProps, type Issue } from "./overlay";
export { compose, autoPlan, Beat, BeatPlan, type ComposeContext } from "./compose";
export { graphemeVisemes, lineVisemes } from "./voice";
