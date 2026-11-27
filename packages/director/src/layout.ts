// Gđ 6: bộ kiểm bố cục + an toàn máy quay cho set 3 vòng (thuần TS, không cần Blender).
//  - floatingObjects: gạch/vật lơ lửng (không chạm sàn, không tựa vật nào) trong sân diễn
//  - checkStage: máy ra ngoài vòm (lộ khoảng trống), mặt chủ thể bị vật đang hiện che khuất
//  - matrixEpisode: tập thử đi qua MỌI cỡ cảnh x góc máy trên một set (test tự động + contact sheet thật)
import type { BakedTimeline, Manifest, ManifestObject, Script, Storyboard, Timing, V3 } from "@lse/shared";
import { parseOrThrow, Storyboard as StoryboardSchema, Timing as TimingSchema } from "@lse/shared";
import { RigModel } from "./rig";
import { rayBox, worldBoxes } from "./stage";

export interface LayoutIssue {
  set: string;
  shot?: string;
  code: "floating" | "face_occluded" | "outside_dome" | "below_floor";
  message: string;
}

type BB = [number, number, number, number, number, number];

/** Vật trong sân diễn (vòng 1) không chạm sàn và không tựa vào vật nào (dung sai 4 mm). */
export function floatingObjects(manifest: Manifest, setId: string): LayoutIssue[] {
  const ms = manifest.sets[setId];
  if (!ms?.extent) return [];
  const objs = ms.objects.filter((o) => o.bb);
  const hero = objs.filter((o) => (o.ring ?? 1) === 1 && !o.float_ok && o.step >= 0);
  const ground = 0.02;
  const tol = 0.004;
  const boxesOf = (o: ManifestObject): BB[] => (o.parts?.length ? o.parts : [o.bb!]);
  const all = objs.flatMap((o) => boxesOf(o).map((b) => ({ o, b })));
  const out: LayoutIssue[] = [];
  for (const o of hero) {
    const bbs = boxesOf(o);
    const supported = bbs.every((a) => {
      if (a[2] <= ground) return true;
      return all.some(({ o: q, b }) => {
        if (q === o) return false;
        const ox = Math.min(a[3], b[3]) - Math.max(a[0], b[0]);
        const oy = Math.min(a[4], b[4]) - Math.max(a[1], b[1]);
        const oz = Math.min(a[5], b[5]) - Math.max(a[2], b[2]);
        // đứng lên trên (mặt trên của vật dưới gần mặt đáy) hoặc tựa ngang (chạm một mặt, chồng hai trục kia)
        if (ox > 0.0005 && oy > 0.0005 && Math.abs(b[5] - a[2]) <= tol) return true;
        if (ox > 0.0005 && oy > 0.0005 && b[2] < a[2] && b[5] > a[2]) return true; // xuyên/đặt vào trong
        return [ox, oy, oz].filter((v) => v > 0.0005).length === 2 && [ox, oy, oz].some((v) => v > -tol && v <= 0.0005) && oz > -tol;
      });
    });
    if (!supported) out.push({ set: setId, code: "floating", message: `${setId}: vật ${o.name} lơ lửng (z=${o.bb![2].toFixed(3)} m, không chạm gì).` });
  }
  return out;
}

const visibleAt = (T: BakedTimeline, name: string, f: number) => {
  const keys = T.stage?.visibility[name];
  if (!keys) return true;
  let v: 0 | 1 = 1;
  for (const [kf, kv] of keys) if (kf <= f) v = kv;
  return v === 1;
};

/** Máy ở trong vòm, trên sàn; mặt chủ thể không bị vật (đang hiện) che. Chỉ xét cảnh ở set 3 vòng. */
export function checkStage(T: BakedTimeline, sb: Storyboard, manifest: Manifest): LayoutIssue[] {
  const out: LayoutIssue[] = [];
  const rig = new RigModel(manifest);
  const origin = (id: string) => T.sets.find((s) => s.id === id)?.origin ?? [0, 0, 0];
  T.shots.forEach((bs, i) => {
    const s = sb.shots[i];
    const ms = manifest.sets[s.set];
    if (!ms?.extent) return;
    const o = origin(s.set);
    const c: V3 = [o[0] + (ms.center?.[0] ?? 0), o[1] + (ms.center?.[1] ?? 0), o[2] + (ms.center?.[2] ?? 0)];
    for (const k of [bs.keys[0], bs.keys[Math.floor(bs.keys.length / 2)], bs.keys[bs.keys.length - 1]]) {
      const r = Math.hypot(k[0] - c[0], k[1] - c[1]);
      if (r > ms.extent - 0.4 || k[2] > c[2] + (ms.dome_h ?? 7) - 0.3) {
        out.push({ set: s.set, shot: s.id, code: "outside_dome", message: `Cảnh ${s.id}: máy ra sát/ngoài vòm trời (cách tâm ${r.toFixed(2)} m) -> lộ khoảng trống.` });
        break;
      }
      if (k[2] < c[2] + (ms.floor_z ?? 0.048) + 0.01) {
        out.push({ set: s.set, shot: s.id, code: "below_floor", message: `Cảnh ${s.id}: máy thấp hơn mặt sàn.` });
        break;
      }
    }
    const subj = s.subjects ?? [];
    const fg = s.camera.preset === "ots" ? subj[1] : undefined;
    const objs = ms.objects.filter((x) => (x.bb || x.parts) && x.ring !== 3 && !x.see_through);
    const q = T.qa[i];
    for (const smp of q.samples) {
      const key = bs.keys[Math.min(bs.keys.length - 1, Math.max(0, smp.f - bs.f0))];
      const cam: V3 = [key[0], key[1], key[2]];
      for (const a of subj) {
        if (a === fg || !smp.heads[a]) continue;
        const A = T.actors[a];
        const joints = Object.fromEntries(Object.entries(A.joints).map(([b, arr]) => [b, arr[smp.f - 1]])) as Record<string, V3>;
        const h = rig.headCenter(A.root[smp.f - 1], joints);
        // 3 điểm trên mặt: giữa + hai bên (ngang theo hướng vuông góc tia nhìn) -> bắt vật che nửa mặt
        const dc: V3 = [h[0] - cam[0], h[1] - cam[1], h[2] - cam[2]];
        const hl = Math.hypot(dc[0], dc[1]) || 1;
        const side: V3 = [-dc[1] / hl * 0.035, dc[0] / hl * 0.035, 0];
        const pts: V3[] = [h, [h[0] + side[0], h[1] + side[1], h[2]], [h[0] - side[0], h[1] - side[1], h[2]]];
        for (const ob of objs) {
          if (!visibleAt(T, ob.name, smp.f)) continue;
          const hit = worldBoxes(ob, o).find((b) => {
            // bỏ vật sát đầu (tóc, cốc cầm tay, mái che ngay trên đầu): chỉ tính vật chắn ở đoạn giữa
            if (h[0] > b[0] - 0.06 && h[0] < b[3] + 0.06 && h[1] > b[1] - 0.06 && h[1] < b[4] + 0.06 && h[2] > b[2] - 0.06 && h[2] < b[5] + 0.06) return false;
            return pts.some((p) => rayBox(cam, [p[0] - cam[0], p[1] - cam[1], p[2] - cam[2]], b, 0.02, 0.97) !== null);
          });
          if (hit) {
            out.push({ set: s.set, shot: s.id, code: "face_occluded", message: `Cảnh ${s.id} lúc ${smp.t.toFixed(2)} s: mặt ${a} bị ${ob.name}${ob.label ? ` (${ob.label})` : ""} che.` });
            break;
          }
        }
      }
    }
  });
  const seen = new Set<string>();
  return out.filter((x) => { const k = `${x.shot}|${x.code}|${x.message.replace(/lúc [0-9.]+ s/, "")}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

/** Các khung máy mà mọi set mới phải qua: đủ thang cỡ cảnh và 4 góc máy, cả chuyển động. */
export const CAMERA_MATRIX: { preset: string; angle?: string; move?: string; subjects: 0 | 1 | 2; zone?: string }[] = [
  { preset: "ews", subjects: 0 },
  { preset: "ews", angle: "high_angle", subjects: 0, move: "crane_reveal" },
  { preset: "ws", subjects: 2 },
  { preset: "ws", angle: "birds_eye", subjects: 1 },
  { preset: "ws", angle: "high_angle", subjects: 1, move: "dolly_out" },
  { preset: "mls", angle: "low_angle", subjects: 1 },
  { preset: "ms", subjects: 1, zone: "left_third", move: "truck_pan" },
  { preset: "cu", subjects: 1, zone: "right_third" },
  { preset: "ots", subjects: 2, zone: "right_third" },
  { preset: "ms", angle: "high_angle", subjects: 1, move: "dolly_in" },
];

/** Tập thử 1 set x CAMERA_MATRIX (mỗi cảnh 1,5 giây, một câu thoại ngắn mỗi cảnh). */
export function matrixEpisode(setId: string, manifest: Manifest, cast: [string, string], marks?: [string, string], lighting = "studio_bright"):
  { storyboard: Storyboard; timing: Timing; script: Script } {
  const ms = manifest.sets[setId];
  const anchors = Object.keys(ms.anchors).filter((a) => a !== "center");
  // cặp mốc cách nhau gần 0,8 m nhất (khoảng hội thoại tự nhiên), ưu tiên cả hai cùng quay về phía máy
  let best: [string, string] = [anchors[0], anchors[1] ?? anchors[0]], score = Infinity;
  for (const a of anchors) for (const b of anchors) {
    if (a >= b) continue;
    const pa = ms.anchors[a], pb = ms.anchors[b];
    const d = Math.hypot(pa.location[0] - pb.location[0], pa.location[1] - pb.location[1]);
    const away = (Math.abs(pa.facing_deg) > 90 ? 1 : 0) + (Math.abs(pb.facing_deg) > 90 ? 1 : 0);
    const sc = Math.abs(d - 0.8) + away * 0.5;
    if (sc < score) { score = sc; best = [a, b]; }
  }
  const [m0, m1] = marks ?? best;
  const D = 1.5;
  const lines: Timing["lines"] = {};
  const scLines: Script["lines"] = [];
  CAMERA_MATRIX.forEach((_, i) => {
    const id = `L${i + 1}`;
    const start = 0.3 + i * D, end = start + D - 0.4;
    const speaker = cast[i % 2];
    lines[id] = { speaker, text: "Check.", wav: `build/audio/${id}.wav`, wav_start: start, start, end,
      visemes: [[start, 1, 0.3]], words: [[start, "Check."]] };
    scLines.push({ id, speaker, text: "Check." });
  });
  const timing = parseOrThrow(TimingSchema, { fps_world: 12, duration: 0.3 + CAMERA_MATRIX.length * D, lines }, "timing");
  const storyboard = parseOrThrow(StoryboardSchema, {
    episode: `matrix_${setId}`, title: `Camera matrix ${setId}`,
    sets: [{ id: setId, lighting }],
    cast: [{ id: cast[0], set: setId, mark: m0 }, { id: cast[1], set: setId, mark: m1 }],
    shots: CAMERA_MATRIX.map((c, i) => ({
      id: `S${i + 1}`, t0: i === 0 ? 0 : `L${i + 1}.start-0.3`, t1: i === CAMERA_MATRIX.length - 1 ? "END" : `L${i + 2}.start-0.3`,
      set: setId, summary: `${c.preset}${c.angle ? " " + c.angle : ""}${c.move ? " " + c.move : ""}`,
      subjects: c.subjects === 0 ? undefined : c.subjects === 1 ? [cast[i % 2]] : [cast[i % 2], cast[(i + 1) % 2]],
      camera: { preset: c.preset, ...(c.angle ? { angle: c.angle } : {}), ...(c.move ? { move: c.move } : {}) },
      subject_zone: c.zone ?? "center",
    })),
  }, "storyboard");
  return { storyboard, timing, script: { title: storyboard.title, fps_world: 12, start_offset: 0, tail: 1, lines: scLines } };
}
