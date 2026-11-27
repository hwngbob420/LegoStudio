// Tự khớp giờ: giọng từng câu (file nạp tay trong voice/, hoặc giọng TTS) -> Whisper nghe -> mốc từng từ -> timing.json.
//   npx tsx apps/server/src/scripts/align.ts <thư mục tập>
// Whisper dùng chung bộ cài với pixel-story-engine nếu có (WHISPER_DIR trong .env để đổi chỗ).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { alignWords, Script, snapBlockStart, Timing, parseOrThrow, wordsFromTokens, wordsOf } from "@lse/shared";
import { lineVisemes } from "@lse/director";
import { loadEnv } from "../ai/env";
import { REPO } from "../workspace";

const WHISPER_VERSION = "1.5.5";
const MODEL = (process.env.WHISPER_MODEL ?? "medium") as "medium" | "small";

export function whisperDir(): string {
  loadEnv(REPO);
  const candidates = [process.env.WHISPER_DIR, path.join(REPO, "workspace", "_cache", "whisper"), "C:\\pixel-story-engine\\workspace\\_cache\\whisper", "D:\\pixel-story-engine\\workspace\\_cache\\whisper"];
  for (const c of candidates) if (c && existsSync(path.join(c, "models", `ggml-${MODEL}.bin`))) return c;
  throw new Error(`Chưa có Whisper (model ${MODEL}). Đặt WHISPER_DIR trong .env tới thư mục có engine/ và models/ggml-${MODEL}.bin, `
    + "hoặc chép thư mục workspace/_cache/whisper từ pixel-story-engine.");
}

const sr = (wav: string) => readFileSync(wav).readUInt32LE(24);

/** Đầu/cuối tiếng nói thật (giây) theo đường bao âm lượng — đáng tin hơn mốc cuối của Whisper (hay kéo vào khoảng lặng). */
export function speechSpan(wav: string): [number, number] {
  const buf = readFileSync(wav);
  let off = 12, rate = 44100, data = Buffer.alloc(0);
  while (off < buf.length - 8) {
    const id = buf.toString("ascii", off, off + 4), size = buf.readUInt32LE(off + 4);
    if (id === "fmt ") rate = buf.readUInt32LE(off + 12);
    if (id === "data") { data = buf.subarray(off + 8, off + 8 + size); break; }
    off += 8 + size + (size % 2);
  }
  const n = Math.floor(data.length / 2), win = Math.max(1, Math.floor(rate * 0.01));
  const env = new Float32Array(n);
  let acc = 0, max = 0;
  for (let i = 0; i < n; i++) {
    acc += Math.abs(data.readInt16LE(i * 2));
    if (i >= win) acc -= Math.abs(data.readInt16LE((i - win) * 2));
    env[i] = acc / win;
    if (env[i] > max) max = env[i];
  }
  const thr = max * 0.04;
  let a = 0, b = n - 1;
  while (a < n && env[a] <= thr) a++;
  while (b > a && env[b] <= thr) b--;
  return [Math.max(0, a - win / 2) / rate, b / rate];
}

const NUM: Record<string, string> = { "0": "zero", "1": "one", "2": "two", "3": "three", "4": "four", "5": "five", "6": "six", "7": "seven", "8": "eight", "9": "nine", "10": "ten" };
const spoken = (w: string) => NUM[w.replace(/[^0-9]/g, "")] ?? w;

async function main(prod: string) {
  const script = parseOrThrow(Script, JSON.parse(readFileSync(path.join(prod, "script.json"), "utf8")), "script.json");
  const wdir = whisperDir();
  const { transcribe } = await import("@remotion/install-whisper-cpp");
  const audioDir = path.join(prod, "build", "audio");
  mkdirSync(audioDir, { recursive: true });
  const tmp = path.join(os.tmpdir(), "lse_align");
  mkdirSync(tmp, { recursive: true });
  const voiceDir = path.join(prod, "voice");
  const uploaded = existsSync(voiceDir) ? readdirSync(voiceDir) : [];
  let t = script.start_offset;
  const lines: Timing["lines"] = {};
  // block của câu i (câu chưa ghi block theo câu trước)
  const blockAt = (i: number) => { for (let k = i; k >= 0; k--) if (script.lines[k].block) return script.lines[k].block; return undefined; };
  for (const [i, L] of script.lines.entries()) {
    const up = uploaded.find((f) => f.startsWith(`${L.id}.`));
    const src = up ? path.join(voiceDir, up) : path.join(audioDir, `${L.id}.wav`);
    if (!existsSync(src)) throw new Error(`Câu ${L.id} chưa có giọng: nạp file ở tab Giọng đọc hoặc bấm "Tạo giọng".`);
    const out = path.join(audioDir, `${L.id}.wav`);
    if (up) execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", src, "-ac", "1", "-ar", "44100", out]);
    const w16 = path.join(tmp, `${L.id}_16k.wav`);
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", out, "-ac", "1", "-ar", "16000", w16]);
    const res = await transcribe({ inputPath: w16, whisperPath: path.join(wdir, "engine"), whisperCppVersion: WHISPER_VERSION, model: MODEL,
      modelFolder: path.join(wdir, "models"), tokenLevelTimestamps: true, language: "en", printOutput: false });
    const heard = wordsFromTokens(res.transcription.flatMap((s) => s.tokens.map((k) => ({ text: k.text, offsets: k.offsets }))));
    const sw = wordsOf(L.text);
    const map = alignWords(sw, heard.map((h) => spoken(h.text)));
    // từ không khớp: nội suy giữa hai từ khớp kề nhau
    const spans = sw.map((text, k) => (map[k] >= 0 ? { text, start: heard[map[k]].startMs / 1000, end: heard[map[k]].endMs / 1000 } : null));
    const total = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out]).toString().trim());
    for (let k = 0; k < spans.length; k++) if (!spans[k]) {
      const prevEnd = k > 0 && spans[k - 1] ? spans[k - 1]!.end : 0;
      let j = k; while (j < spans.length && !spans[j]) j++;
      const nextStart = j < spans.length ? spans[j]!.start : total;
      const n = j - k, step = Math.max(0.05, (nextStart - prevEnd) / n);
      for (let q = 0; q < n; q++) spans[k + q] = { text: sw[k + q], start: prevEnd + q * step, end: prevEnd + (q + 1) * step };
    }
    const [on0, off0] = speechSpan(out);
    // đệm giống tts_sapi.trim_info: miệng mở sớm 30 ms, khép muộn 50 ms
    const onset = Math.max(0, on0 - 0.03), offset = Math.min(total, off0 + 0.05);
    // kẹp mốc từ vào khoảng có tiếng thật
    const S = (spans as { text: string; start: number; end: number }[]).map((x) => ({ ...x, start: Math.min(Math.max(x.start, onset), offset), end: Math.min(Math.max(x.end, onset), offset) }));
    if (S.length) { S[0].start = onset; S[S.length - 1].end = Math.max(S[S.length - 1].start + 0.05, offset); }
    t += i === 0 ? 0 : (L.gap_before ?? 0.3);
    // đầu block mới khớp lưới 0,25 s, giống tts_sapi.py (block sau không phụ thuộc độ dài block trước)
    const pb = i > 0 ? blockAt(i - 1) : undefined;
    if (L.block && pb && L.block !== pb) t = snapBlockStart(t);
    const wavStart = t - onset;
    const abs = S.map((s) => ({ ...s, start: wavStart + s.start, end: wavStart + s.end }));
    lines[L.id] = {
      speaker: L.speaker, text: L.text, wav: `build/audio/${L.id}.wav`, wav_start: r3(wavStart), start: r3(t), end: r3(wavStart + offset),
      visemes: lineVisemes(abs).map(([a, v, d]) => [r3(a), v, r3(d)]), words: abs.map((s) => [r3(s.start), s.text]),
      ...(L.block ? { block: L.block } : {}),
    };
    t = wavStart + offset;
    const conf = map.filter((x) => x >= 0).length / Math.max(1, sw.length);
    console.log(`  ${L.id} ${r3(lines[L.id].start)}-${r3(lines[L.id].end)}  khớp ${Math.round(conf * 100)}% từ  (${sr(out)} Hz${up ? ", giọng nạp tay" : ""})`);
  }
  const timing = parseOrThrow(Timing, { fps_world: script.fps_world, duration: r3(t + script.tail), lines }, "timing");
  writeFileSync(path.join(prod, "build", "timing.json"), JSON.stringify(timing, null, 1));
  console.log(`[align] ${script.lines.length} câu, dài ${timing.duration}s -> build/timing.json`);
}
const r3 = (x: number) => Math.round(x * 1000) / 1000;

if (process.argv[2]) main(path.resolve(process.argv[2])).catch((e) => { console.error(e.message ?? e); process.exit(1); });
