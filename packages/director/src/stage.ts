// Gđ 6: dàn cảnh nhiều bộ set — vị trí set trong thế giới, diễn viên di chuyển giữa set, cutaway (ẩn trần/tường chắn máy),
// lịch hiện/ẩn hợp nhất với lắp ráp. Mọi thứ tính ở đây; Blender và Three.js chỉ phát lại `stage` trong baked_timeline.
import type { Manifest, ManifestObject, Storyboard, V3 } from "@lse/shared";
import { cameraMatrix, SCALE_PRESETS } from "./camera";
import { apply, norm, sub } from "./math3";

/** Khoảng cách cũ giữa các set (tập cũ giữ nguyên để nướng ra y hệt). */
export const LEGACY_SET_SPACING = 14.0;
/** Bán kính mặc định của set cũ (phông cyc 16 m). */
const LEGACY_EXTENT = 7.0;
/** Khe hở giữa hai vòm trời. */
const SET_GAP = 6.0;
const NEW_MOVES = new Set(["dolly_in", "dolly_out", "truck_pan", "crane_reveal"]);

type BB = [number, number, number, number, number, number];

/** Tập có dùng tính năng Gđ 6 không (set 3 vòng, preset/góc/chuyển động mới, diễn viên chuyển set). */
export function usesStage(sb: Storyboard, manifest: Manifest): boolean {
  if (sb.sets.some((s) => manifest.sets[s.id]?.extent !== undefined)) return true;
  return sb.shots.some((s) =>
    (SCALE_PRESETS as readonly string[]).includes(s.camera.preset) || s.camera.angle !== undefined ||
    (s.camera.move !== undefined && NEW_MOVES.has(s.camera.move)) || Object.values(s.actors ?? {}).some((a) => a.at));
}

/** Gốc toạ độ của từng set. Tập cũ: cách đều 14 m. Tập mới: xếp theo bán kính vòm để vòm này không lọt vào khung set kia. */
export function setOrigins(sb: Storyboard, manifest: Manifest, stage: boolean): V3[] {
  if (!stage) return sb.sets.map((_, i) => [i * LEGACY_SET_SPACING, 0, 0]);
  const out: V3[] = [];
  let x = 0;
  sb.sets.forEach((s, i) => {
    const r = manifest.sets[s.id]?.extent ?? LEGACY_EXTENT;
    if (i > 0) x += r;
    out.push([x, 0, 0]);
    x += r + SET_GAP;
  });
  return out;
}

export interface ActorMove { f0: number; set: string; mark: string }

/** Nơi diễn viên đứng ở khung f: lần chuyển gần nhất có f0 <= f, nếu không thì vị trí đầu tập. */
export function placeAt(moves: ActorMove[], f: number, home: { set: string; mark: string }) {
  let cur = home;
  for (const m of moves) if (m.f0 <= f) cur = m;
  return cur;
}

// ------------------------------------------------------------------ tia & hộp
/** Giao tia p + t*d (t trong (tmin, tmax)) với hộp; trả t vào hộp hoặc null. */
export function rayBox(p: V3, d: V3, b: BB, tmin = 1e-4, tmax = 1): number | null {
  let t0 = tmin, t1 = tmax;
  for (let k = 0; k < 3; k++) {
    const lo = b[k], hi = b[k + 3];
    if (Math.abs(d[k]) < 1e-12) {
      if (p[k] < lo || p[k] > hi) return null;
      continue;
    }
    let a = (lo - p[k]) / d[k], c = (hi - p[k]) / d[k];
    if (a > c) [a, c] = [c, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, c);
    if (t0 > t1) return null;
  }
  return t0;
}

export function worldBoxes(o: ManifestObject, origin: V3): BB[] {
  const list = o.parts?.length ? o.parts : o.bb ? [o.bb] : [];
  return list.map((b) => [b[0] + origin[0], b[1] + origin[1], b[2] + origin[2], b[3] + origin[0], b[4] + origin[1], b[5] + origin[2]]);
}

/** Hướng tia qua điểm chuẩn hoá (nx, ny) của khung (x phải, y xuống), cùng quy ước với project(). */
export function rayThrough(key: [number, number, number, number, number, number], lens: number, shift: [number, number], W: number, H: number, nx: number, ny: number): V3 {
  const big = 36 / lens;
  const w = W >= H ? big : big * (W / H);
  const h = W >= H ? big * (H / W) : big;
  const u = -w / 2 + shift[0] * big + nx * w;
  const v = -h / 2 + shift[1] * big + (1 - ny) * h;
  const m = cameraMatrix(key);
  const o = apply(m, [0, 0, 0]);
  return norm(sub(apply(m, [u, v, -1]), o));
}

/**
 * Cutaway: vật có nhóm `cut` bị ẩn suốt cảnh nếu nó chắn tia từ máy tới (a) đầu chủ thể, (b) điểm nhìn giữa khung,
 * (c) lưới 3x3 điểm của khung chiếu xuống sàn. Lấy mẫu ở đầu, giữa, cuối cảnh (máy có thể di chuyển).
 */
export function cutawayHidden(
  objs: ManifestObject[], origin: V3, floorZ: number,
  keys: [number, number, number, number, number, number][], lens: number, shift: [number, number], W: number, H: number,
  targets: V3[],
): string[] {
  const cut = objs.filter((o) => o.cut && (o.bb || o.parts));
  if (!cut.length) return [];
  const hidden = new Set<string>();
  const samples = [...new Set([0, Math.floor((keys.length - 1) / 2), keys.length - 1])].map((i) => keys[i]);
  for (const key of samples) {
    const cam: V3 = [key[0], key[1], key[2]];
    const rays: { d: V3; tmax: number }[] = [];
    for (const t of targets) rays.push({ d: sub(t, cam), tmax: 0.98 });
    for (const ny of [0.25, 0.5, 0.75]) for (const nx of [0.2, 0.5, 0.8]) {
      const d = rayThrough(key, lens, shift, W, H, nx, ny);
      // tới sàn sân diễn (nếu tia đi lên thì xét 6 m)
      const t = d[2] < -1e-6 ? (floorZ + 0.05 - cam[2]) / d[2] : 6;
      rays.push({ d: [d[0] * Math.max(0, t), d[1] * Math.max(0, t), d[2] * Math.max(0, t)], tmax: 0.98 });
    }
    for (const o of cut) {
      if (hidden.has(o.name)) continue;
      // máy cao hơn trần thì trần luôn bị dỡ (kiểu nhà búp bê), kể cả khi không chắn tia nào
      if (o.cut === "ceiling" && worldBoxes(o, origin).some((b) => cam[2] > b[2])) { hidden.add(o.name); continue; }
      for (const b of worldBoxes(o, origin)) {
        if (rays.some((r) => rayBox(cam, r.d, b, 1e-4, r.tmax) !== null)) { hidden.add(o.name); break; }
      }
    }
  }
  // ẩn cả nhóm: một nửa trần biến mất trông như lỗi, nên vật nào cùng nhóm cut với vật bị ẩn thì ẩn theo
  const groups = new Set(cut.filter((o) => hidden.has(o.name)).map((o) => o.cut!));
  return cut.filter((o) => groups.has(o.cut!)).map((o) => o.name).sort();
}

/**
 * Lịch hiện/ẩn hợp nhất cho vật cutaway: hiện = đã lắp xong (nếu có lắp ráp) VÀ không bị cảnh hiện tại ẩn.
 * Trả mốc đổi trạng thái [khung, 1|0] bắt đầu từ khung 1.
 */
export function visibilitySchedule(
  names: string[], frames: number, shotRanges: { f0: number; f1: number; hidden: Set<string> }[],
  assembledFrom: Record<string, number>,
): Record<string, [number, 0 | 1][]> {
  const out: Record<string, [number, 0 | 1][]> = {};
  for (const n of names) {
    const keys: [number, 0 | 1][] = [];
    let prev: 0 | 1 | -1 = -1;
    const at = (f: number): 0 | 1 => {
      const asm = assembledFrom[n];
      if (asm !== undefined && f < asm) return 0;
      const sh = shotRanges.find((r) => r.f0 <= f && f <= r.f1);
      return sh && sh.hidden.has(n) ? 0 : 1;
    };
    // chỉ cần xét các khung có thể đổi trạng thái
    const cands = new Set<number>([1]);
    for (const r of shotRanges) { cands.add(r.f0); cands.add(r.f1 + 1); }
    if (assembledFrom[n] !== undefined) cands.add(assembledFrom[n]);
    for (const f of [...cands].filter((f) => f >= 1 && f <= frames).sort((a, b) => a - b)) {
      const v = at(f);
      if (v !== prev) { keys.push([f, v]); prev = v; }
    }
    out[n] = keys;
  }
  return out;
}
