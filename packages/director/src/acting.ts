// Ghép động tác theo thời gian (bản TS của pose_at / bake_actor trong acting_library.py).
import type { V3 } from "@lse/shared";
import { ACTION_DEFS, type ActionDef } from "./actions";
import { Rng } from "./rng";

/** Các khớp được tạo dáng (root là gốc rig, đi theo vị trí riêng). */
export const POSED_BONES = ["hips", "torso", "head", "arm.L", "arm.R", "hand.L", "hand.R", "leg.L", "leg.R"] as const;

export interface Clip {
  action: string;
  t0: number;
  t1: number;
  intensity?: number;
  mirror?: boolean;
}

const ease = (u: number) => u * u * (3 - 2 * u);
const DEG = Math.PI / 180;

function mirrorPose(p: Record<string, V3>): Record<string, V3> {
  const o: Record<string, V3> = {};
  for (const [b, [x, y, z]] of Object.entries(p)) {
    const nb = b.endsWith(".L") ? b.replace(".L", ".R") : b.endsWith(".R") ? b.replace(".R", ".L") : b;
    o[nb] = [x, -y, -z];
  }
  return o;
}

function sample(keys: ActionDef["keys"], u: number, mirror = false): Record<string, V3> {
  let k0 = keys[0], k1 = keys[0], f = 0;
  if (u <= keys[0][0]) { k0 = k1 = keys[0]; }
  else if (u >= keys[keys.length - 1][0]) { k0 = k1 = keys[keys.length - 1]; }
  else {
    for (let i = 0; i < keys.length - 1; i++) {
      if (keys[i][0] <= u && u <= keys[i + 1][0]) {
        k0 = keys[i]; k1 = keys[i + 1];
        f = ease((u - k0[0]) / Math.max(1e-6, k1[0] - k0[0]));
        break;
      }
    }
  }
  const out: Record<string, V3> = {};
  const names = new Set([...Object.keys(k0[1]), ...Object.keys(k1[1])]);
  for (const b of names) {
    const a = k0[1][b] ?? [0, 0, 0];
    const c = k1[1][b] ?? [0, 0, 0];
    out[b] = [a[0] + (c[0] - a[0]) * f, a[1] + (c[1] - a[1]) * f, a[2] + (c[2] - a[2]) * f];
  }
  return mirror ? mirrorPose(out) : out;
}

function sampleRoot(rk: ActionDef["root"], u: number): V3 {
  if (!rk) return [0, 0, 0];
  for (let i = 0; i < rk.length - 1; i++) {
    if (rk[i][0] <= u && u <= rk[i + 1][0]) {
      const f = ease((u - rk[i][0]) / Math.max(1e-6, rk[i + 1][0] - rk[i][0]));
      const a = rk[i][1], b = rk[i + 1][1];
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
    }
  }
  return rk[rk.length - 1][1];
}

/** Tư thế (độ) + độ dời gốc tại thời điểm t: lớp nền idle_breathe + các clip đang chạy, có hoà trộn vào/ra. */
export function poseAt(clips: Clip[], t: number, blendS = 0.17): { pose: Record<string, V3>; root: V3 } {
  const pose: Record<string, V3> = Object.fromEntries(POSED_BONES.map((b) => [b, [0, 0, 0] as V3]));
  let root: V3 = [0, 0, 0];
  const add = (p: Record<string, V3>, w: number) => {
    for (const [b, v] of Object.entries(p)) {
      const cur = pose[b] ?? [0, 0, 0];
      pose[b] = [cur[0] + v[0] * w, cur[1] + v[1] * w, cur[2] + v[2] * w];
    }
  };
  const idle = ACTION_DEFS.idle_breathe;
  add(sample(idle.keys, (t / (idle.loop as number)) % 1), 1);
  for (const c of clips) {
    if (!(c.t0 - 1e-6 <= t && t <= c.t1 + 1e-6)) continue;
    const a = ACTION_DEFS[c.action];
    if (!a) throw new Error(`Động tác không có trong thư viện: ${c.action}`);
    let w = c.intensity ?? 1;
    let u: number;
    if (a.loop) {
      u = ((t - c.t0) / a.loop) % 1;
      const ramp = Math.min(1, (t - c.t0) / blendS, (c.t1 - t) / blendS);
      w *= Math.max(0, ramp);
    } else {
      u = (t - c.t0) / Math.max(1e-6, c.t1 - c.t0);
    }
    add(sample(a.keys, u, c.mirror), w);
    const r = sampleRoot(a.root, u);
    const k = c.intensity ?? 1;
    root = [root[0] + r[0] * k, root[1] + r[1] * k, root[2] + r[2] * k];
  }
  return { pose, root };
}

export interface ActorBakeInput {
  clips: Clip[];
  fps: number;
  frames: number;
  home: V3;
  facingDeg: number;
  seed: number;
  appear?: number;
  boil?: number;
}

/** Nướng từng khung: Euler (radian) mỗi khớp + gốc [x,y,z,rotZ]. Có "rung tay" boil ±0.35° kiểu múa rối. */
export function bakeActor(inp: ActorBakeInput): { root: [number, number, number, number][]; joints: Record<string, V3[]> } {
  const rng = new Rng(inp.seed);
  const boil = inp.boil ?? 0.35;
  const joints: Record<string, V3[]> = Object.fromEntries(POSED_BONES.map((b) => [b, [] as V3[]]));
  const rootOut: [number, number, number, number][] = [];
  const ang = inp.facingDeg * DEG;
  for (let f = 1; f <= inp.frames; f++) {
    const t = (f - 1) / inp.fps;
    const { pose, root } = poseAt(inp.clips, t);
    for (const b of POSED_BONES) {
      const v = pose[b] ?? [0, 0, 0];
      const j: V3 = boil ? [rng.uniform(-boil, boil), rng.uniform(-boil, boil), rng.uniform(-boil, boil)] : [0, 0, 0];
      joints[b].push([(v[0] + j[0]) * DEG, (v[1] + j[1]) * DEG, (v[2] + j[2]) * DEG]);
    }
    const off: V3 = [root[0] * Math.cos(ang) - root[1] * Math.sin(ang), root[0] * Math.sin(ang) + root[1] * Math.cos(ang), root[2]];
    let loc: V3 = [inp.home[0] + off[0], inp.home[1] + off[1], inp.home[2] + off[2]];
    if (inp.appear !== undefined) {
      // nhân vật rơi xuống sân khấu lúc "appear": ở trên cao, chạm gần đất 1 khung, rồi đứng hẳn
      if (t < inp.appear - 1.5 / inp.fps) loc = [inp.home[0], inp.home[1], inp.home[2] + 6];
      else if (t < inp.appear - 0.5 / inp.fps) loc = [inp.home[0], inp.home[1], inp.home[2] + 0.18];
    }
    rootOut.push([loc[0], loc[1], loc[2], ang]);
  }
  return { root: rootOut, joints };
}
