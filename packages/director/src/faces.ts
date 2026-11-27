// Mặt 2D: biểu cảm theo mốc + chớp mắt tự động + khẩu hình (bản TS của key_faces và lipsync_2d.py).
import { Rng } from "./rng";

export interface FaceSpec {
  eyes: string[];
  mouths: string[];
  expression_rest_mouth: Record<string, string>;
}

/** SAPI viseme (0-21) -> hình miệng Rhubarb/Preston-Blair. */
export const SAPI_TO_SHAPE: Record<number, string> = {
  0: "X", 1: "C", 2: "D", 3: "E", 4: "C", 5: "E", 6: "B", 7: "F", 8: "E", 9: "D", 10: "E", 11: "D",
  12: "C", 13: "B", 14: "H", 15: "B", 16: "B", 17: "H", 18: "G", 19: "B", 20: "B", 21: "A",
};
const PRIORITY: Record<string, number> = { A: 1.6, F: 1.2, G: 1.2, D: 1.1 };

export type Segment = [number, number, string]; // [bắt đầu, kết thúc, hình miệng]

export function segmentsFromSapi(visemes: [number, number, number][]): Segment[] {
  return visemes.map(([t, v, d]) => [t, t + Math.max(d, 0.04), SAPI_TO_SHAPE[v] ?? "X"]);
}

/** Mỗi khung chọn hình miệng chồng lấn nhiều nhất (môi khép A được ưu tiên để không mất âm b/p/m). */
export function quantise(segs: Segment[], fps: number, fLo: number, fHi: number): Map<number, string> {
  const out = new Map<number, string>();
  for (let f = fLo; f <= fHi; f++) {
    const a = (f - 1) / fps, b = f / fps;
    const score = new Map<string, number>();
    for (const [s0, s1, shp] of segs) {
      const ov = Math.min(b, s1) - Math.max(a, s0);
      if (ov > 0) score.set(shp, (score.get(shp) ?? 0) + ov * (PRIORITY[shp] ?? 1));
    }
    let best: string | null = null, bv = -Infinity;
    for (const [k, v] of score) if (v > bv) { best = k; bv = v; }
    if (best !== null) out.set(f, best);
  }
  const fs = [...out.keys()].sort((x, y) => x - y);
  for (let i = 1; i < fs.length - 1; i++) {
    const cur = out.get(fs[i]), prev = out.get(fs[i - 1]) as string, next = out.get(fs[i + 1]);
    if (cur === "X" && prev !== "X" && next !== "X") out.set(fs[i], prev === "D" || prev === "C" ? "C" : "B");
  }
  return out;
}

/** Ghép các câu thoại của một người nói thành rãnh miệng theo khung: số ô atlas, -1 = miệng nghỉ. */
export function mouthTrack(
  lines: { start: number; end: number; visemes: [number, number, number][] }[],
  fps: number,
  spec: FaceSpec,
): Map<number, number> {
  const tr = new Map<number, number>();
  for (const L of lines) {
    const q = quantise(segmentsFromSapi(L.visemes), fps, Math.floor(L.start * fps), Math.floor(L.end * fps) + 2);
    for (const [f, shp] of q) tr.set(f, shp === "X" ? -1 : spec.mouths.indexOf(shp));
  }
  return tr;
}

export function bakeFace(
  exprTrack: [number, string][],
  mouth: Map<number, number>,
  fps: number,
  frames: number,
  seed: number,
  spec: FaceSpec,
  /** khung không được chớp mắt (khung QA, khung chính của cảnh) */
  noBlink: Set<number> = new Set(),
  /** block (5B): lịch chớp mắt bắt đầu lại ở đầu mỗi block, hạt giống riêng từng block */
  segments: { f0: number; seed: number }[] = [{ f0: 1, seed: 0 }],
): [number, number][] {
  const track = [...exprTrack].sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  const blinks = new Set<number>();
  segments.forEach((sg, i) => {
    const rng = new Rng((seed ^ sg.seed) >>> 0);
    const end = i + 1 < segments.length ? segments[i + 1].f0 : frames + 1;
    let t = rng.uniform(0.8, 2.0);
    while (sg.f0 + Math.round(t * fps) < end) {
      const bf = sg.f0 + Math.round(t * fps);
      if (!noBlink.has(bf)) blinks.add(bf);
      t += rng.uniform(2.2, 4.2);
    }
  });
  const out: [number, number][] = [];
  for (let f = 1; f <= frames; f++) {
    const tt = (f - 1) / fps;
    let e = track[0][1];
    for (const [te, name] of track) if (te <= tt + 1e-6) e = name;
    let ei = spec.eyes.indexOf(e);
    if (ei < 0) throw new Error(`Biểu cảm không có trong atlas: ${e}`);
    if (blinks.has(f) && !["happy_closed", "blink", "shocked_wide"].includes(e)) ei = spec.eyes.indexOf("blink");
    const m = mouth.get(f);
    const mi = m === undefined || m === -1 ? spec.mouths.indexOf(spec.expression_rest_mouth[e]) : m;
    out.push([ei, mi]);
  }
  return out;
}
