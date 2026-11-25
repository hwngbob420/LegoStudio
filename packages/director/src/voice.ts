// Giọng thật: từ mốc từng từ (Whisper) suy ra viseme theo chữ cái để khẩu hình 2D chạy được như với giọng SAPI.
// Viseme dùng bảng SAPI 0-21 để đi chung một đường lip-sync (faces.ts).
const DIGRAPHS: [string, number][] = [["th", 17], ["sh", 16], ["ch", 16], ["ph", 18], ["ck", 20], ["ng", 20], ["oo", 7], ["ee", 6], ["ou", 9], ["ow", 9], ["oy", 10], ["ai", 11], ["ay", 4]];
const LETTER: Record<string, number> = {
  a: 2, e: 4, i: 6, o: 8, u: 7, y: 6, w: 7, h: 12, r: 13, l: 14, s: 15, z: 15, c: 15, x: 15, j: 16,
  f: 18, v: 18, t: 19, d: 19, n: 19, k: 20, g: 20, q: 20, m: 21, b: 21, p: 21,
};

/** Chuỗi viseme SAPI cho một từ, chia đều theo số âm, trong khoảng [t0, t1] giây. */
export function graphemeVisemes(word: string, t0: number, t1: number): [number, number, number][] {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  const units: number[] = [];
  for (let i = 0; i < w.length;) {
    const dg = DIGRAPHS.find(([d]) => w.startsWith(d, i));
    if (dg) { units.push(dg[1]); i += 2; continue; }
    const v = LETTER[w[i]];
    // chữ câm cuối từ (e cuối) và chữ lặp liền nhau không tạo âm mới
    if (v !== undefined && !(w[i] === "e" && i === w.length - 1 && w.length > 2) && units[units.length - 1] !== v) units.push(v);
    i += 1;
  }
  if (!units.length) return [];
  const d = Math.max(0.04, (t1 - t0) / units.length);
  return units.map((v, k) => [t0 + k * d, v, d]);
}

export interface HeardSpan { text: string; start: number; end: number }

/** Viseme cho cả câu: từng từ theo chữ cái, khoảng nghỉ giữa các từ > 0.12 s là miệng nghỉ (0). */
export function lineVisemes(words: HeardSpan[]): [number, number, number][] {
  const out: [number, number, number][] = [];
  words.forEach((w, i) => {
    out.push(...graphemeVisemes(w.text, w.start, w.end));
    const next = words[i + 1];
    if (next && next.start - w.end > 0.12) out.push([w.end, 0, next.start - w.end]);
  });
  return out;
}
