// Toán 3D tối giản theo quy ước Blender: ma trận 4x4 hàng-trước (row-major), trục Z lên,
// Euler XYZ nghĩa là R = Rz * Ry * Rx (xoay X trước).
import type { V3 } from "@lse/shared";

export type M4 = number[]; // 16 phần tử, m[r * 4 + c]

export const identity = (): M4 => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export function mul(a: M4, b: M4): M4 {
  const o = new Array(16).fill(0);
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[r * 4 + k] * b[k * 4 + c];
      o[r * 4 + c] = s;
    }
  return o;
}

export const mulAll = (...ms: M4[]): M4 => ms.reduce((acc, m) => mul(acc, m));

export function apply(m: M4, p: V3): V3 {
  return [
    m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3],
    m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7],
    m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11],
  ];
}

export const translation = (v: V3): M4 => [1, 0, 0, v[0], 0, 1, 0, v[1], 0, 0, 1, v[2], 0, 0, 0, 1];

export function rotX(a: number): M4 {
  const c = Math.cos(a), s = Math.sin(a);
  return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0, 0, 0, 0, 1];
}
export function rotY(a: number): M4 {
  const c = Math.cos(a), s = Math.sin(a);
  return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0, 0, 0, 0, 1];
}
export function rotZ(a: number): M4 {
  const c = Math.cos(a), s = Math.sin(a);
  return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

export const eulerXYZ = (x: number, y: number, z: number): M4 => mulAll(rotZ(z), rotY(y), rotX(x));

/** Nghịch đảo của ma trận cứng (xoay + dời). */
export function invRigid(m: M4): M4 {
  const r = [m[0], m[4], m[8], m[1], m[5], m[9], m[2], m[6], m[10]]; // R^T
  const t = [m[3], m[7], m[11]];
  return [
    r[0], r[1], r[2], -(r[0] * t[0] + r[1] * t[1] + r[2] * t[2]),
    r[3], r[4], r[5], -(r[3] * t[0] + r[4] * t[1] + r[5] * t[2]),
    r[6], r[7], r[8], -(r[6] * t[0] + r[7] * t[1] + r[8] * t[2]),
    0, 0, 0, 1,
  ];
}

export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const len = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
export const lerp = (a: V3, b: V3, u: number): V3 => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
export function norm(a: V3): V3 {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Hướng camera kiểu Blender to_track_quat('-Z','Y'): trục -Z nhìn theo dir, trục Y hướng lên trời (không lăn). Trả Euler XYZ. */
export function trackEuler(dir: V3): V3 {
  const z = norm(scale(dir, -1));
  let x = cross([0, 0, 1], z);
  if (len(x) < 1e-9) x = [1, 0, 0];
  x = norm(x);
  const y = cross(z, x);
  // cột của ma trận xoay là x, y, z
  const m = [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
  return matToEulerXYZ(m);
}

/** Ma trận 3x3 (hàng-trước) -> Euler XYZ với R = Rz Ry Rx. */
export function matToEulerXYZ(m: number[]): V3 {
  const cy = Math.hypot(m[0], m[3]);
  if (cy > 1e-6) return [Math.atan2(m[7], m[8]), Math.atan2(-m[6], cy), Math.atan2(m[3], m[0])];
  return [Math.atan2(-m[5], m[4]), Math.atan2(-m[6], cy), 0];
}
