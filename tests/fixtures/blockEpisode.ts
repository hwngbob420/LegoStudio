// Tập mẫu 2 block dùng chung cho test 5B/5C: kịch bản 14 câu (b01: L1–L7, b02: L8–L14) + xếp giờ giống tts_sapi.py.
import { Script, Timing, parseOrThrow, snapBlockStart } from "@lse/shared";

export const TEXTS = [
  "Three coffees and the bug is still hiding.", "Did you check the logs?", "The logs are lying to me!", "Logs cannot lie, Max.",
  "Then why do they say everything is fine?", "Because it compiles. That is not the same thing.", "Okay. Step one, breathe.",
  "Step two, read the error out loud.", "It says the variable is undefined.", "Which variable?", "All of them!",
  "That is impressive, in a bad way.", "So we start over?", "We start with lunch.",
];

export const blockScript = (blocks = true) => parseOrThrow(Script, {
  title: "Bug Hunt", start_offset: 2.5, tail: 1.2,
  lines: TEXTS.map((text, i) => ({ id: `L${i + 1}`, speaker: i % 2 ? "priya_lead" : "max_dev", text, gap_before: i ? 0.35 : 0,
    ...(blocks ? { block: i < 7 ? "b01" : "b02" } : {}) })),
}, "script");

/** Xếp giờ giống tts_sapi.py: cộng dồn, đầu block mới khớp lưới. `extra` = câu L3 dài thêm (giây). */
export function layoutTiming(sc: Script, extra = 0): Timing {
  let t = sc.start_offset;
  const lines: Timing["lines"] = {};
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  sc.lines.forEach((L, i) => {
    const words = L.text.split(/\s+/);
    const dur = words.length * 0.38 + 0.2 + (L.id === "L3" ? extra : 0);
    t += i ? (L.gap_before ?? 0.3) : 0;
    if (i > 0 && L.block && L.block !== sc.lines[i - 1].block) t = snapBlockStart(t);
    const start = t;
    lines[L.id] = {
      speaker: L.speaker, text: L.text, wav: `build/audio/${L.id}.wav`, wav_start: r3(start - 0.05), start: r3(start), end: r3(start + dur),
      visemes: words.map((_, k) => [r3(start + (k * dur) / words.length), (k * 7) % 21, r3(dur / words.length)] as [number, number, number]),
      words: words.map((w, k) => [r3(start + (k * dur) / words.length), w] as [number, string]),
      ...(L.block ? { block: L.block } : {}),
    };
    t = start + dur;
  });
  return parseOrThrow(Timing, { fps_world: 12, duration: r3(t + sc.tail), lines }, "timing");
}
