// Chép từ pixel-story-engine (packages/shared/src/align.ts): căn từ kịch bản với từ Whisper nghe được.
/** Một từ do Whisper nhận ra, kèm thời điểm (mili giây). */
export interface HeardWord {
  text: string;
  startMs: number;
  endMs: number;
}

export interface AlignedCue {
  index: number;
  startSec: number;
  endSec: number;
  text: string;
  /** Tỉ lệ từ của câu khớp được với Whisper (0..1). Thấp thì nên nghe lại. */
  confidence: number;
}

const stripMarks = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");
/** Chuẩn hóa một từ để so: chữ thường, bỏ dấu câu. */
export const normWord = (t: string) => t.normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
const looseWord = (t: string) => stripMarks(normWord(t));

/** Tách chữ thành các từ có nội dung (bỏ dấu gạch, dấu câu đứng riêng). */
export const wordsOf = (text: string): string[] => text.split(/\s+/).filter((w) => normWord(w).length > 0);

const MATCH = 3;
const LOOSE = 1; // khác dấu thanh nhưng cùng chữ: Whisper hay nghe sai dấu
const MISMATCH = -2;
const GAP = -1;

/**
 * Khớp từng từ của kịch bản với các từ Whisper nghe được (căn chuỗi, cho phép bỏ sót, nghe sai, thừa).
 * Trả về, với mỗi từ kịch bản, chỉ số từ Whisper tương ứng hoặc -1.
 */
export function alignWords(script: string[], heard: string[]): number[] {
  const n = script.length;
  const m = heard.length;
  const S = script.map(normWord);
  const SL = script.map(looseWord);
  const H = heard.map(normWord);
  const HL = heard.map(looseWord);
  // 0 = chéo (khớp/lệch), 1 = bỏ từ kịch bản, 2 = bỏ từ Whisper
  const trace = new Uint8Array((n + 1) * (m + 1));
  let prev = new Int32Array(m + 1);
  let cur = new Int32Array(m + 1);
  for (let j = 1; j <= m; j++) { prev[j] = j * GAP; trace[j] = 2; }
  for (let i = 1; i <= n; i++) {
    cur[0] = i * GAP;
    trace[i * (m + 1)] = 1;
    for (let j = 1; j <= m; j++) {
      const sub = S[i - 1] === H[j - 1] ? MATCH : SL[i - 1] === HL[j - 1] ? LOOSE : MISMATCH;
      const diag = prev[j - 1] + sub;
      const up = prev[j] + GAP;
      const left = cur[j - 1] + GAP;
      if (diag >= up && diag >= left) { cur[j] = diag; trace[i * (m + 1) + j] = 0; }
      else if (up >= left) { cur[j] = up; trace[i * (m + 1) + j] = 1; }
      else { cur[j] = left; trace[i * (m + 1) + j] = 2; }
    }
    [prev, cur] = [cur, prev];
  }
  const map = new Array<number>(n).fill(-1);
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    const t = trace[i * (m + 1) + j];
    if (i > 0 && j > 0 && t === 0) {
      // Chỉ tính là khớp khi hai từ thật sự giống (kể cả lệch dấu), không tính cặp bị "lệch hẳn".
      if (S[i - 1] === H[j - 1] || SL[i - 1] === HL[j - 1]) map[i - 1] = j - 1;
      i--; j--;
    } else if (i > 0 && (t === 1 || j === 0)) i--;
    else j--;
  }
  return map;
}

/**
 * Gán mốc giờ Whisper cho từng câu của kịch bản sạch.
 * Giờ lấy từ Whisper, chữ lấy từ kịch bản (nên đúng chính tả). Câu không khớp được từ nào thì nội suy theo số từ.
 */
export function alignScriptToHeard(sentences: string[], heard: HeardWord[], totalSec?: number): AlignedCue[] {
  const scriptWords: string[] = [];
  const owner: number[] = [];
  sentences.forEach((s, si) => { for (const w of wordsOf(s)) { scriptWords.push(w); owner.push(si); } });
  const map = alignWords(scriptWords, heard.map((h) => h.text));

  const first = new Array<number>(sentences.length).fill(-1);
  const last = new Array<number>(sentences.length).fill(-1);
  const counts = new Array<number>(sentences.length).fill(0);
  const hits = new Array<number>(sentences.length).fill(0);
  map.forEach((hj, wi) => {
    const si = owner[wi];
    counts[si]++;
    if (hj >= 0) { hits[si]++; if (first[si] < 0) first[si] = hj; last[si] = hj; }
  });

  const start = new Array<number>(sentences.length).fill(NaN);
  const end = new Array<number>(sentences.length).fill(NaN);
  sentences.forEach((_, si) => {
    if (first[si] >= 0) { start[si] = heard[first[si]].startMs / 1000; end[si] = heard[last[si]].endMs / 1000; }
  });

  // Nội suy các câu chưa có giờ giữa hai câu đã có giờ (chia theo số từ).
  const total = totalSec ?? (heard.length ? heard[heard.length - 1].endMs / 1000 : 0);
  let si = 0;
  while (si < sentences.length) {
    if (!Number.isNaN(start[si])) { si++; continue; }
    let k = si;
    while (k < sentences.length && Number.isNaN(start[k])) k++;
    const from = si > 0 ? end[si - 1] : 0;
    const to = k < sentences.length ? start[k] : Math.max(total, from);
    const words = counts.slice(si, k).reduce((a, b) => a + Math.max(1, b), 0);
    let t = from;
    for (let x = si; x < k; x++) {
      const share = (Math.max(1, counts[x]) / words) * Math.max(0, to - from);
      start[x] = t; end[x] = t + share; t += share;
    }
    si = k;
  }

  // Giữ thứ tự: không câu nào bắt đầu trước khi câu trước kết thúc, không đảo ngược.
  for (let x = 0; x < sentences.length; x++) {
    if (x > 0 && start[x] < end[x - 1]) {
      const mid = (start[x] + end[x - 1]) / 2;
      end[x - 1] = Math.max(start[x - 1], Math.min(end[x - 1], mid));
      start[x] = Math.max(start[x], end[x - 1]);
    }
    if (end[x] < start[x]) end[x] = start[x];
  }

  return sentences.map((text, x) => ({
    index: x + 1, startSec: round3(start[x]), endSec: round3(end[x]), text,
    confidence: counts[x] === 0 ? 0 : Math.round((hits[x] / counts[x]) * 100) / 100,
  }));
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Ghép các mảnh (token) của Whisper thành từ: mảnh bắt đầu bằng dấu cách mở từ mới;
 * bỏ các mảnh đặc biệt như [_BEG_], [_TT_123].
 */
export function wordsFromTokens(tokens: Array<{ text: string; offsets: { from: number; to: number } }>): HeardWord[] {
  const out: HeardWord[] = [];
  for (const t of tokens) {
    if (/^\[_.*_\]$/.test(t.text.trim()) || /^\[_/.test(t.text)) continue;
    const startsWord = /^\s/.test(t.text) || out.length === 0;
    const piece = t.text.trim();
    if (!piece) continue;
    if (startsWord) out.push({ text: piece, startMs: t.offsets.from, endMs: t.offsets.to });
    else {
      const w = out[out.length - 1];
      w.text += piece;
      w.endMs = Math.max(w.endMs, t.offsets.to);
    }
  }
  return out;
}
