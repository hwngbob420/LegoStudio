// Nướng storyboard -> baked_timeline (nguồn sự thật DUY NHẤT cho chuyển động; Blender và Three.js chỉ phát lại).
import type { BakedTimeline, Manifest, Storyboard, Timing, V3 } from "@lse/shared";
import { Timeline, frameOf } from "@lse/shared";
import { bakeActor, type Clip } from "./acting";
import { cameraRight, planCamera, project } from "./camera";
import { bakeFace, mouthTrack, type FaceSpec } from "./faces";
import { add, scale } from "./math3";
import { crc32 } from "./rng";
import { RigModel } from "./rig";
import { sliceHash } from "./slice";

export interface BakeInput {
  storyboard: Storyboard;
  timing: Timing;
  manifest: Manifest;
  faceSpec: FaceSpec;
  /** id diễn viên -> biểu cảm mặc định (từ công thức minifig) */
  defaultExpr: Record<string, string>;
}

const SET_SPACING = 14.0;
const ASSEMBLY_LIFT = 0.55 * 0.35;
const r5 = (x: number) => Math.round(x * 1e5) / 1e5;
const r5v = <T extends number[]>(v: T) => v.map(r5) as T;

export function bake(inp: BakeInput): BakedTimeline {
  const { storyboard: sb, timing, manifest, faceSpec } = inp;
  const fps = sb.fps_world;
  const [W, H] = sb.resolution;
  const tl = new Timeline(timing);
  const shots = tl.resolveShots(sb.shots);
  const duration = shots[shots.length - 1]._t1;
  const frames = frameOf(duration, fps) - 1;
  const rig = new RigModel(manifest);

  // ---- block (5B): cảnh thuộc block của câu ở mốc t0; block bắt đầu ở khung đầu cảnh đầu tiên của nó
  const shotBlock: string[] = [];
  const firstBlock = Object.values(timing.lines).find((L) => L.block)?.block ?? "b01";
  for (const s of shots) {
    const m = typeof s.t0 === "string" ? /^([A-Za-z0-9_]+)\.(?:start|end|w\d+)/.exec(s.t0) : null;
    shotBlock.push((m && timing.lines[m[1]]?.block) || shotBlock[shotBlock.length - 1] || firstBlock);
  }
  const segments: { id: string; f0: number; seed: number }[] = [];
  shots.forEach((s, i) => {
    if (i === 0 || shotBlock[i] !== shotBlock[i - 1]) segments.push({ id: shotBlock[i], f0: i === 0 ? 1 : frameOf(s._t0, fps), seed: crc32(`block:${shotBlock[i]}`) });
  });

  const sets = sb.sets.map((s, i) => ({ id: s.id, origin: [i * SET_SPACING, 0, 0] as V3, lighting: s.lighting }));
  const setOrigin = (id: string) => sets.find((s) => s.id === id)?.origin ?? ([0, 0, 0] as V3);
  const sfx: BakedTimeline["sfx"] = [];

  // ---- gom động tác, biểu cảm, lúc xuất hiện theo diễn viên
  const clips: Record<string, Clip[]> = {};
  const exprs: Record<string, [number, string][]> = {};
  const appear: Record<string, number> = {};
  for (const c of sb.cast) { clips[c.id] = []; exprs[c.id] = []; }
  for (const s of shots) {
    for (const [aid, A] of Object.entries(s.actors ?? {})) {
      for (const k of A.acts ?? []) clips[aid].push({ action: k.a, t0: tl.t(k.t0), t1: tl.t(k.t1), intensity: k.intensity ?? 1, mirror: k.mirror ?? false });
      for (const e of A.expr ?? []) exprs[aid].push([tl.t(e.t), e.e]);
      if (A.appear !== undefined) appear[aid] = tl.t(A.appear);
    }
  }

  // khung chính của cảnh và mốc QA phụ: không chớp mắt đúng lúc đó (ảnh duyệt phải thấy rõ biểu cảm)
  const noBlink = new Set<number>();
  for (const s of shots) if (s.key_t !== undefined) noBlink.add(frameOf(tl.t(s.key_t), fps));
  for (const v of Object.values(sb.qa_extra ?? {})) noBlink.add(frameOf(tl.t(v), fps));

  // ---- diễn viên
  const actors: BakedTimeline["actors"] = {};
  const facing: Record<string, number> = {};
  for (const c of sb.cast) {
    const anchor = manifest.sets[c.set]?.anchors[c.mark];
    if (!anchor) throw new Error(`Không thấy mốc ${c.mark} trong bộ set ${c.set} (manifest)`);
    const home = add(setOrigin(c.set), anchor.location);
    facing[c.id] = anchor.facing_deg;
    const body = bakeActor({ clips: clips[c.id], fps, frames, home, facingDeg: anchor.facing_deg,
      seed: crc32(c.id) % 1000, appear: appear[c.id], segments });
    if (appear[c.id] !== undefined) sfx.push({ t: appear[c.id], type: "clack", gain: 1.1 });
    let ex = exprs[c.id].slice().sort((a, b) => a[0] - b[0]);
    if (!ex.length) ex = [[0, inp.defaultExpr[c.id] ?? "innocent_dot"]];
    if (ex[0][0] > 0) ex.unshift([0, ex[0][1]]);
    const lines = Object.values(timing.lines).filter((L) => L.speaker === c.id);
    const face = bakeFace(ex, mouthTrack(lines, fps, faceSpec), fps, frames, crc32(c.id) % 997, faceSpec, noBlink, segments);
    actors[c.id] = { fig: c.id, set: c.set, mark: c.mark, props: c.props ?? [], prop_color: c.prop_color, root: body.root, joints: body.joints, face };
  }
  const jointsAt = (aid: string, f: number) =>
    Object.fromEntries(Object.entries(actors[aid].joints).map(([b, arr]) => [b, arr[f - 1]])) as Record<string, V3>;
  const headAt = (aid: string, f: number) => rig.headCenter(actors[aid].root[f - 1], jointsAt(aid, f));

  // ---- lắp ráp
  const assembly: BakedTimeline["assembly"] = [];
  for (const s of shots) {
    if (!s.assembly) continue;
    const f0 = frameOf(tl.t(s.assembly.t0), fps), f1 = frameOf(tl.t(s.assembly.t1), fps);
    const objs = manifest.sets[s.set].objects;
    const steps = [...new Set(objs.filter((o) => o.step >= 1).map((o) => o.step))].sort((a, b) => a - b);
    if (!steps.length) continue;
    const per = Math.max(1, f1 - f0) / steps.length;
    const show: Record<string, number> = {};
    steps.forEach((st, si) => {
      const group = objs.filter((o) => o.step === st).slice()
        .sort((a, b) => a.loc[2] - b.loc[2] || (a.loc[0] + a.loc[1]) - (b.loc[0] + b.loc[1]));
      const base = f0 + Math.floor(si * per);
      sfx.push({ t: (base - 1) / fps, type: "clack", gain: 1.0 });
      group.forEach((o, k) => { show[o.name] = base + (k > group.length / 2 && per >= 2 ? 1 : 0); });
      if (per >= 3) sfx.push({ t: base / fps + 0.04, type: "clack", gain: 0.6 });
    });
    assembly.push({ set: s.set, lift: ASSEMBLY_LIFT, show });
  }

  // ---- camera từng cảnh
  const bshots: BakedTimeline["shots"] = [];
  shots.forEach((s, i) => {
    const f0 = frameOf(s._t0, fps);
    const f1 = Math.max(f0, frameOf(s._t1, fps) - 1);
    const mid = f0 + Math.floor((f1 - f0) / 2);
    const subj = s.subjects ?? [];
    const plan = planCamera({ ...s.camera, subject_zone: s.subject_zone }, f0, f1, subj.map((a) => headAt(a, mid)), subj,
      // hạt giống theo mốc t0 (neo theo câu), không theo số thứ tự cảnh: thêm/bớt cảnh ở block khác không đổi rung tay
      subj.length ? facing[subj[0]] : 0, setOrigin(s.set), crc32(`shot:${String(s.t0)}`), W / H);
    bshots.push({ id: s.id, f0, f1, lens: plan.lens, fstop: plan.fstop, shift: plan.shift, focus: plan.focus,
      keys: plan.keys.map((k) => r5v(k)) });
    if (i > 0 && s.whoosh) sfx.push({ t: s._t0 - 0.08, type: "whoosh", gain: 0.7 });
  });
  const shotAt = (f: number) => bshots.find((b) => b.f0 <= f && f <= b.f1) ?? bshots[bshots.length - 1];
  const keyAt = (b: BakedTimeline["shots"][number], f: number) => b.keys[Math.min(b.keys.length - 1, Math.max(0, f - b.f0))];

  // ---- hiệu ứng
  const fx: BakedTimeline["fx"] = [];
  for (const s of shots) {
    for (const e of s.fx ?? []) {
      const t0 = tl.t(e.t0), t1 = tl.t(e.t1);
      const f0 = frameOf(t0, fps), f1 = frameOf(t1, fps);
      const b = shotAt(f0);
      const off = e.offset ?? [0.055, -0.02, 0.06];
      const loc = add(add(headAt(e.actor, f0), scale(cameraRight(keyAt(b, f0)), off[0])), [0, off[1], off[2]]);
      fx.push({ kind: e.kind, actor: e.actor, f0, f1, loc: r5v(loc), shot: b.id, size: e.size ?? 0.06 });
      sfx.push({ t: t0, type: e.kind === "shock_lines" ? "boing" : "pop", gain: 0.8 });
    }
  }

  // ---- QA: hộp đầu dự đoán ở các khung mẫu của mỗi cảnh
  const qa: BakedTimeline["qa"] = [];
  shots.forEach((s, i) => {
    const b = bshots[i];
    let kf = s.key_t !== undefined ? frameOf(tl.t(s.key_t), fps) : Math.floor((b.f0 + b.f1) / 2);
    kf = Math.min(Math.max(kf, b.f0), b.f1);
    const fs = [...new Set([b.f0, b.f0 + Math.floor((b.f1 - b.f0) / 4), Math.floor((b.f0 + b.f1) / 2),
      b.f0 + Math.floor((3 * (b.f1 - b.f0)) / 4), b.f1, kf])].sort((x, y) => x - y);
    const samples = fs.map((f) => {
      const heads: Record<string, [number, number, number, number]> = {};
      for (const aid of Object.keys(actors)) {
        const pts = rig.headPoints(aid, actors[aid].root[f - 1], jointsAt(aid, f))
          .map((p) => project(p, keyAt(b, f), b.lens, b.shift, W, H)).filter((x): x is [number, number] => x !== null);
        if (!pts.length) continue;
        const bb: [number, number, number, number] = [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])),
          Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
        if (bb[2] > 0 && bb[0] < 1 && bb[3] > 0 && bb[1] < 1) heads[aid] = r5v(bb);
      }
      return { f, t: r5((f - 1) / fps), heads };
    });
    qa.push({ shot: s.id, key_f: kf, samples });
  });

  // làm tròn để file nhỏ và ổn định
  for (const a of Object.values(actors)) {
    a.root = a.root.map((v) => r5v(v));
    for (const b of Object.keys(a.joints)) a.joints[b] = a.joints[b].map((v) => r5v(v));
  }
  sfx.sort((a, b) => a.t - b.t);
  const T: BakedTimeline = {
    version: 1, episode: sb.episode, fps, fps_out: sb.fps_out, frames, duration: r5(duration), resolution: [W, H],
    samples: sb.samples, sets, actors, shots: bshots, assembly, fx, sfx: sfx.map((e) => ({ ...e, t: r5(e.t) })), qa,
  };
  T.blocks = segments.map((sg, i) => {
    const f1 = i + 1 < segments.length ? segments[i + 1].f0 - 1 : frames;
    return { id: sg.id, f0: sg.f0, f1, hash: sliceHash(T, sg.f0, f1) };
  });
  return T;
}
