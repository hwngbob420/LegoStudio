// Toán dùng chung của máy chiếu Three.js: đổi trục Blender (Z lên) -> Three (Y lên) ở MỘT chỗ,
// ma trận camera và thông số ống kính khớp Blender (cảm biến 36 mm theo chiều ngang, lệch ống kính theo bề rộng khung).
import * as THREE from "three";
import { cameraMatrix, RigModel, type M3 } from "@lse/director";
import type { BakedShot, BakedTimeline, Manifest, V3 } from "@lse/shared";

type M4 = M3.M4;

/** Blender Z-up -> Three Y-up: xoay -90° quanh X. */
export const ZUP_TO_YUP = new THREE.Matrix4().makeRotationX(-Math.PI / 2);

export function toThree(m: M4): THREE.Matrix4 {
  // M4 là hàng-trước; Matrix4.set nhận theo hàng
  return new THREE.Matrix4().set(
    m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8], m[9], m[10], m[11], m[12], m[13], m[14], m[15],
  );
}

/** Khung thế giới (12 hình/s, bắt đầu 1) tại khung Remotion (fps_out). */
export function worldFrame(T: BakedTimeline, outFrame: number): number {
  const f = Math.floor((outFrame * T.fps) / T.fps_out) + 1;
  return Math.min(Math.max(f, 1), T.frames);
}

export function shotAt(T: BakedTimeline, f: number): BakedShot {
  return T.shots.find((s) => s.f0 <= f && f <= s.f1) ?? T.shots[T.shots.length - 1];
}

export interface CamParams {
  matrixWorld: THREE.Matrix4; // đã đổi trục
  fovDeg: number; // dọc
  aspect: number;
  /** setViewOffset(fullW, fullH, x, y, w, h) theo pixel */
  offset: [number, number];
  focusDistance: number;
}

export function cameraParams(T: BakedTimeline, f: number, rig: RigModel, W: number, H: number): CamParams {
  const s = shotAt(T, f);
  const key = s.keys[Math.min(s.keys.length - 1, Math.max(0, f - s.f0))];
  const m = toThree(cameraMatrix(key));
  const matrixWorld = ZUP_TO_YUP.clone().multiply(m);
  const sensorH = W >= H ? 36 * (H / W) : 36;
  const fovDeg = THREE.MathUtils.radToDeg(2 * Math.atan(sensorH / 2 / s.lens));
  // shift tính theo bề rộng khung: dời khung nhìn sang phải shift_x*W pixel, lên trên shift_y*W pixel
  const offset: [number, number] = [s.shift[0] * Math.max(W, H), -s.shift[1] * Math.max(W, H)];
  let focusDistance: number;
  if ("actor" in s.focus) {
    const a = T.actors[s.focus.actor];
    const joints = Object.fromEntries(Object.entries(a.joints).map(([b, arr]) => [b, arr[f - 1]])) as Record<string, V3>;
    const h = rig.headCenter(a.root[f - 1], joints);
    focusDistance = Math.hypot(h[0] - key[0], h[1] - key[1], h[2] - key[2]);
  } else focusDistance = s.focus.distance;
  return { matrixWorld, fovDeg, aspect: W / H, offset, focusDistance };
}

/** Áp thông số vào PerspectiveCamera của Three. */
export function applyCamera(cam: THREE.PerspectiveCamera, p: CamParams, W: number, H: number) {
  cam.fov = p.fovDeg;
  cam.aspect = p.aspect;
  cam.near = 0.02;
  cam.far = 60;
  cam.setViewOffset(W, H, p.offset[0], p.offset[1], W, H);
  cam.matrixAutoUpdate = false;
  cam.matrix.copy(p.matrixWorld);
  cam.matrix.decompose(cam.position, cam.quaternion, cam.scale);
  cam.updateMatrixWorld(true);
  cam.updateProjectionMatrix();
}

/** Ma trận "điểm nghỉ -> thế giới Three" cho từng khớp của một diễn viên tại khung f. */
export function actorBoneMatrices(T: BakedTimeline, rig: RigModel, actorId: string, f: number): Record<string, THREE.Matrix4> {
  const a = T.actors[actorId];
  const joints = Object.fromEntries(Object.entries(a.joints).map(([b, arr]) => [b, arr[f - 1]])) as Record<string, V3>;
  const d = rig.deform(a.root[f - 1], joints);
  return Object.fromEntries(Object.entries(d).map(([b, m]) => [b, ZUP_TO_YUP.clone().multiply(toThree(m))]));
}

/** Hộp đầu chiếu bằng camera Three (dùng cho test đối chiếu với bộ đạo diễn và Blender). */
export function headBoxThree(T: BakedTimeline, manifest: Manifest, rig: RigModel, actorId: string, f: number, W: number, H: number) {
  const cam = new THREE.PerspectiveCamera();
  applyCamera(cam, cameraParams(T, f, rig, W, H), W, H);
  const head = actorBoneMatrices(T, rig, actorId, f).head;
  const xs: number[] = [], ys: number[] = [];
  for (const box of manifest.cast[T.actors[actorId].fig].head_boxes)
    for (const c of box.corners) {
      const v = new THREE.Vector3(c[0], c[1], c[2]).applyMatrix4(head).project(cam);
      if (v.z < 1) { xs.push((v.x + 1) / 2); ys.push(1 - (v.y + 1) / 2); }
    }
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
