// Camera: preset, lệch ống kính theo 1/3, chuyển động máy, rung tay (bản TS của place_camera),
// và phép chiếu điểm thế giới lên khung hình (world_to_camera_view của Blender).
import { SUBJECT_SHIFT, type V3 } from "@lse/shared";
import { add, eulerXYZ, invRigid, len, lerp, mul, scale, sub, trackEuler, translation, apply } from "./math3";
import { Rng, smoothNoise } from "./rng";

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
  angle?: string;
}

/** Ngữ cảnh thêm cho preset Gđ 6 (preset cũ không dùng, để tập cũ nướng ra y hệt). */
export interface CameraContext {
  /** cao độ sàn dưới chân chủ thể (m, toạ độ thế giới) */
  floorZ?: number;
  /** bán kính vòm của bộ set (m); máy rộng không được lùi quá */
  extent?: number;
}

/** Preset Gđ 6: thang cỡ cảnh đầy đủ, có góc máy. */
export const SCALE_PRESETS = ["ews", "ws", "mls", "ms", "cu", "ots"] as const;
/** Góc ngẩng của máy so với mặt phẳng ngang qua điểm nhìn (độ). birds_eye chặn ở 82 độ: tránh điểm kỳ dị của trackEuler. */
export const ANGLE_ELEVATION: Record<string, number> = { eye_level: 4, low_angle: -16, high_angle: 34, birds_eye: 82 };
/** Mặc định từng cỡ cảnh: tiêu cự, khẩu độ (tilt-shift: xa thì khép, gần thì mở), chiều cao khung cần thấy (m), hạ điểm nhìn. */
export const SCALE_DEFAULTS: Record<string, { lens: number; fstop: number; frameH: number; drop: number; shiftY: number }> = {
  ews: { lens: 24, fstop: 2.8, frameH: 3.4, drop: 0.12, shiftY: 0 },
  ws: { lens: 32, fstop: 2.0, frameH: 1.35, drop: 0.14, shiftY: 0 },
  mls: { lens: 40, fstop: 1.8, frameH: 0.6, drop: 0.11, shiftY: 0.02 },
  ms: { lens: 50, fstop: 1.6, frameH: 0.4, drop: 0.05, shiftY: 0.03 },
  cu: { lens: 65, fstop: 1.4, frameH: 0.3, drop: 0.0, shiftY: -0.015 },
  ots: { lens: 50, fstop: 1.6, frameH: 0.4, drop: 0.02, shiftY: 0.02 },
};
const SENSOR_V = 20.25; // 36 mm x 16:9

const smooth = (u: number) => u * u * (3 - 2 * u);

export interface CameraPlan {
  lens: number;
  fstop: number;
  shift: [number, number];
  focus: { actor: string } | { distance: number };
  keys: [number, number, number, number, number, number][];
}

const DEG = Math.PI / 180;
/** Độ lệch chuẩn của rung tay, tính bằng điểm ảnh trên khung 1920 (shake = 1). */
export const SHAKE_PX = 1.2;
/** Khoảng cách giữa hai nút rung tay (khung thế giới). */
export const SHAKE_KNOT = 18;

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
  ctx?: CameraContext,
): CameraPlan {
  const halfSensorW = aspect >= 1 ? 18 : 18 * aspect;
  const preset = spec.preset;
  const zone = spec.subject_zone ?? "center";
  const yaw = (spec.yaw ?? 0) * DEG;
  let lens: number, fstop: number, pos: V3, look: V3, focusPoint: V3, shift: [number, number];
  let reach = 0; // khoảng máy -> điểm nhìn (cho chuyển động Gđ 6)
  if ((SCALE_PRESETS as readonly string[]).includes(preset)) {
    const def = SCALE_DEFAULTS[preset];
    lens = spec.lens ?? def.lens;
    fstop = spec.fstop ?? def.fstop;
    const floorZ = ctx?.floorZ ?? setCenter[2];
    if (preset === "ots") {
      // qua vai: máy đứng sau đầu B (subjects[1]), nhìn A (subjects[0]); B thành tiền cảnh mờ ở 1/3 đối diện
      const [a, b] = heads;
      let u: V3 = [b[0] - a[0], b[1] - a[1], 0];
      const ul = Math.hypot(u[0], u[1]) || 1;
      u = [u[0] / ul, u[1] / ul, 0];
      const side: V3 = [-u[1], u[0], 0];
      const sgn = zone === "left_third" ? -1 : 1;
      // người được quay cách máy ít nhất ~0,8 m: hai người đứng sát nhau thì máy lùi thêm, vai không che mặt
      const sep = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const back = spec.distance ?? Math.max(0.5, 0.95 - sep);
      pos = add(b, [u[0] * back + side[0] * 0.25 * sgn, u[1] * back + side[1] * 0.25 * sgn, 0.0 + (spec.rise ?? 0)]);
      look = add(a, [0, 0, -def.drop]);
      focusPoint = a;
    } else {
      // điểm nhìn: giữa các đầu (có chủ thể) hoặc giữa set (cảnh rộng không chủ thể)
      if (heads.length) {
        const m: V3 = [0, 0, 0];
        for (const h of heads) { m[0] += h[0] / heads.length; m[1] += h[1] / heads.length; m[2] += h[2] / heads.length; }
        look = add(m, [0, 0, -def.drop]);
      } else look = add(setCenter, [0, 0.25, 0.2]);
      focusPoint = heads.length ? heads[0] : look;
      let el = (ANGLE_ELEVATION[spec.angle ?? "eye_level"] ?? 4) * DEG;
      if (preset === "ews" && (spec.angle ?? "eye_level") === "eye_level") el = 16 * DEG; // mở cảnh: cao hơn tầm mắt một chút
      let d = spec.distance ?? (def.frameH * lens) / SENSOR_V;
      if (preset === "ews" && ctx?.extent) d = Math.min(d, ctx.extent * 0.62);
      // cỡ gần (mls/ms/cu) xoay theo nửa hướng mặt chủ thể như mcu; cảnh rộng giữ trục set (không lùi vào trung cảnh)
      const close = preset === "mls" || preset === "ms" || preset === "cu";
      const ang = (heads.length && close ? subjectFacingDeg * DEG * 0.5 : 0) + yaw;
      // góc thấp: máy không được chui xuống dưới sàn
      const minZ = floorZ + 0.035;
      if (look[2] + Math.sin(el) * d < minZ) el = Math.asin(Math.max(-1, Math.min(1, (minZ - look[2]) / d)));
      const h = Math.cos(el) * d;
      pos = add(look, [Math.sin(ang) * h, -Math.cos(ang) * h, Math.sin(el) * d + (spec.rise ?? 0)]);
    }
    reach = len(sub(look, pos));
    shift = [SUBJECT_SHIFT[zone as keyof typeof SUBJECT_SHIFT] ?? 0, def.shiftY];
    if (!heads.length && preset !== "ots") shift = [0, 0];
  } else if (preset === "wide_establish" || preset === "assembly_high") {
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
  const wide = preset === "wide_establish" || preset === "assembly_high" || ((preset === "ews" || preset === "ws") && !subjectIds.length);
  const focus = subjectIds.length && !wide ? { actor: subjectIds[0] } : { distance: len(sub(pos, focusPoint)) };
  const move = spec.move ?? "none";
  const shake = spec.shake ?? 1.0;
  const rng = new Rng(seed);
  const keys: CameraPlan["keys"] = [];
  // Rung tay máy quay: trôi chậm theo nút cách 1,5 giây (18 khung), biên độ tính theo điểm ảnh để ống kính dài không
  // bị rung mạnh hơn. Bản cũ cộng nhiễu trắng mỗi khung -> cả hình xô 4–12 px mỗi khung = "giật giật".
  const n = f1 - f0 + 1;
  const focalPx = (1920 * lens) / 36;
  const amp = (SHAKE_PX / focalPx) * shake;
  const pan = smoothNoise(rng, n, SHAKE_KNOT), tilt = smoothNoise(rng, n, SHAKE_KNOT);
  for (let f = f0; f <= f1; f++) {
    const u = (f - f0) / Math.max(1, f1 - f0);
    let p = pos;
    if (move === "push_in") p = lerp(pos, look, 0.1 * u);
    else if (move === "pull_out") p = lerp(pos, look, 0.1 * (1 - u));
    else if (move === "drift_right") p = add(pos, [0.08 * u, 0, 0]);
    else if (move === "crane_down") p = add(pos, [0, 0, 0.25 * (1 - u) ** 2]);
    let lk = look;
    if (move === "dolly_in") p = lerp(pos, look, 0.22 * smooth(u));
    else if (move === "dolly_out") p = lerp(pos, look, 0.22 * (1 - smooth(u)));
    else if (move === "truck_pan") {
      // trượt ngang song song mặt phẳng khung, điểm nhìn đi theo: thị sai tiền/hậu cảnh
      const fwd = sub(look, pos);
      const fl = Math.hypot(fwd[0], fwd[1]) || 1;
      const right: V3 = [fwd[1] / fl, -fwd[0] / fl, 0];
      const amt = (0.05 + 0.05 * Math.min(reach || 1, 4)) * (smooth(u) - 0.5) * 2;
      p = add(pos, scale(right, amt));
      lk = add(look, scale(right, amt));
    } else if (move === "crane_reveal") {
      // cần cẩu: bắt đầu thấp, nâng lên tới vị trí chuẩn (điểm nhìn đứng yên)
      const floor = (ctx?.floorZ ?? setCenter[2]) + 0.035;
      const drop = Math.max(0, Math.min(0.45 * (reach || 1), pos[2] - floor));
      p = add(pos, [0, 0, -drop * (1 - smooth(u))]);
    }
    const r = trackEuler(sub(lk, p));
    r[0] += tilt[f - f0] * amp;
    r[2] += pan[f - f0] * amp;
    keys.push([p[0], p[1], p[2], r[0], r[1], r[2]]);
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
