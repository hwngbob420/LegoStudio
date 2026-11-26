// Camera: preset, lệch ống kính theo 1/3, chuyển động máy, rung tay (bản TS của place_camera),
// và phép chiếu điểm thế giới lên khung hình (world_to_camera_view của Blender).
import { SUBJECT_SHIFT, type V3 } from "@lse/shared";
import { add, eulerXYZ, invRigid, len, lerp, mul, sub, trackEuler, translation, apply } from "./math3";
import { Rng } from "./rng";

export interface CameraSpec {
  preset: string;
  move?: string;
  yaw?: number;
  lens?: number;
  fstop?: number;
  distance?: number;
  rise?: number;
  spread?: number;
  shake?: number;
  shift_y?: number;
  subject_zone?: string;
}

export interface CameraPlan {
  lens: number;
  fstop: number;
  shift: [number, number];
  focus: { actor: string } | { distance: number };
  keys: [number, number, number, number, number, number][];
}

const DEG = Math.PI / 180;

export function planCamera(
  spec: CameraSpec,
  f0: number,
  f1: number,
  heads: V3[],
  subjectIds: string[],
  subjectFacingDeg: number,
  setCenter: V3,
  seed: number,
  /** W/H của khung. Khung dọc (Shorts): cảm biến 36 mm nằm theo chiều cao, giống sensor_fit AUTO của Blender. */
  aspect = 16 / 9,
): CameraPlan {
  const halfSensorW = aspect >= 1 ? 18 : 18 * aspect;
  const preset = spec.preset;
  const zone = spec.subject_zone ?? "center";
  const yaw = (spec.yaw ?? 0) * DEG;
  let lens: number, fstop: number, pos: V3, look: V3, focusPoint: V3, shift: [number, number];
  if (preset === "wide_establish" || preset === "assembly_high") {
    lens = spec.lens ?? (preset === "assembly_high" ? 30 : 35);
    fstop = spec.fstop ?? 1.0;
    // khung dọc: không cố thu trọn bề ngang bộ set (set bé, thừa phông trống trên/dưới); dolly lại gần theo đúng
    // hướng nhìn (giữ góc chúc), cắt bớt hai mép set để nhân vật đọc được mặt
    const dolly = aspect < 1 ? 0.7 : 1;
    const back = (preset === "assembly_high" ? 3.1 : 2.85) * dolly;
    const up = (preset === "assembly_high" ? 1.75 : 1.05) * dolly;
    look = add(setCenter, [0, 0.25, 0.22]);
    pos = add(setCenter, [Math.sin(yaw) * back, -Math.cos(yaw) * back, up]);
    focusPoint = add(setCenter, [0, -0.05, 0.25]);
    shift = [0, 0];
  } else if (preset === "two_shot") {
    const [a, b] = heads;
    const mid: V3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    const sep = len(sub(a, b));
    lens = spec.lens ?? 45;
    fstop = spec.fstop ?? 1.6;
    const fov = 2 * Math.atan(halfSensorW / lens);
    const d = sep / ((spec.spread ?? 0.46) * 2 * Math.tan(fov / 2));
    look = add(mid, [0, 0, -0.02]);
    pos = add(mid, [Math.sin(yaw) * d, -Math.cos(yaw) * d, 0.1 + (spec.rise ?? 0)]);
    focusPoint = mid;
    shift = [0, -0.06];
  } else {
    const h = heads[0];
    const ecu = preset === "ecu";
    lens = spec.lens ?? (ecu ? 70 : 50);
    fstop = spec.fstop ?? (ecu ? 1.8 : 1.4);
    const d = spec.distance ?? (ecu ? 0.8 : 0.95);
    const rise = spec.rise ?? (ecu ? 0.015 : 0.04);
    const ang = subjectFacingDeg * DEG * 0.5 + yaw;
    pos = add(h, [Math.sin(ang) * d, -Math.cos(ang) * d, rise]);
    look = add(h, [0, 0, ecu ? -0.012 : -0.04]);
    focusPoint = h;
    shift = [SUBJECT_SHIFT[zone as keyof typeof SUBJECT_SHIFT] ?? 0, ecu ? 0 : 0.035];
  }
  if (spec.shift_y !== undefined) shift = [shift[0], spec.shift_y];
  const wide = preset === "wide_establish" || preset === "assembly_high";
  const focus = subjectIds.length && !wide ? { actor: subjectIds[0] } : { distance: len(sub(pos, focusPoint)) };
  const move = spec.move ?? "none";
  const shake = spec.shake ?? 1.0;
  const rng = new Rng(seed);
  const keys: CameraPlan["keys"] = [];
  for (let f = f0; f <= f1; f++) {
    const u = (f - f0) / Math.max(1, f1 - f0);
    let p = pos;
    if (move === "push_in") p = lerp(pos, look, 0.1 * u);
    else if (move === "pull_out") p = lerp(pos, look, 0.1 * (1 - u));
    else if (move === "drift_right") p = add(pos, [0.08 * u, 0, 0]);
    else if (move === "crane_down") p = add(pos, [0, 0, 0.25 * (1 - u) ** 2]);
    const jit: V3 = [rng.gauss(0, 0.0012) * shake, rng.gauss(0, 0.0012) * shake, rng.gauss(0, 0.0012) * shake];
    const loc = add(p, jit);
    const r = trackEuler(sub(look, p));
    r[0] += rng.gauss(0, 0.0009) * shake;
    r[2] += rng.gauss(0, 0.0009) * shake;
    keys.push([loc[0], loc[1], loc[2], r[0], r[1], r[2]]);
  }
  return { lens, fstop, shift, focus, keys };
}

export function cameraMatrix(key: CameraPlan["keys"][number]) {
  return mul(translation([key[0], key[1], key[2]]), eulerXYZ(key[3], key[4], key[5]));
}

/** Chiếu điểm thế giới ra toạ độ khung chuẩn hoá (x phải, y XUỐNG, gốc trên-trái). null nếu ở sau camera. */
export function project(p: V3, key: CameraPlan["keys"][number], lens: number, shift: [number, number], W: number, H: number): [number, number] | null {
  const c = apply(invRigid(cameraMatrix(key)), p);
  if (c[2] >= -1e-6) return null;
  const u = c[0] / -c[2], v = c[1] / -c[2];
  // cảm biến 36 mm theo chiều lớn hơn; lệch ống kính tính theo chiều lớn hơn (như Blender)
  const big = 36 / lens;
  const w = W >= H ? big : big * (W / H);
  const h = W >= H ? big * (H / W) : big;
  const xMin = -w / 2 + shift[0] * big;
  const yMin = -h / 2 + shift[1] * big;
  return [(u - xMin) / w, 1 - (v - yMin) / h];
}

export function cameraRight(key: CameraPlan["keys"][number]): V3 {
  const m = eulerXYZ(key[3], key[4], key[5]);
  return [m[0], m[4], m[8]];
}
