// Dựng storyboard từ "nhịp" (beats) gọn mà AI (hoặc đạo diễn tự động) trả về. Code tự lo:
// mốc thời gian theo câu/từ, cảnh mở lắp ráp, vùng chủ thể đối diện thẻ chữ (không che mặt), phản ứng người nghe, thẻ STEP kết.
import { z } from "zod";
import { ACTIONS, EXPRESSIONS, FX_KINDS, type Script, type Storyboard, type Timing } from "@lse/shared";

const Expr = z.enum(EXPRESSIONS);
export const Beat = z.object({
  line: z.string(),
  shot: z.enum(["mcu", "ecu", "two_shot", "wide_establish"]),
  subject: z.string().optional(),
  speaker_expr: Expr.optional(),
  punch: z.object({ word: z.number().int().min(1), expr: Expr }).optional(),
  listener_expr: Expr.optional(),
  action: z.enum(ACTIONS).optional(),
  fx: z.object({ kind: z.enum(FX_KINDS), word: z.number().int().min(1) }).optional(),
  ui: z.discriminatedUnion("type", [
    z.object({ type: z.literal("none") }),
    z.object({ type: z.literal("part_callout"), count: z.number().int().min(1).max(9), label: z.string().max(24), note: z.string().max(28).optional() }),
    z.object({ type: z.literal("brick_chart"), title: z.string().max(28), bars: z.array(z.object({ label: z.string().max(8), value: z.number().int().min(1).max(12) })).min(2).max(4), collapse_last: z.boolean().optional() }),
  ]).optional(),
  summary: z.string().max(80).optional(),
});
export type Beat = z.infer<typeof Beat>;
export const BeatPlan = z.object({
  set: z.string(),
  beats: z.array(Beat),
  ending: z.object({ step: z.string().max(3), title: z.string().max(22) }),
});
export type BeatPlan = z.infer<typeof BeatPlan>;

export interface ComposeContext {
  episode: string;
  script: Script;
  timing: Timing;
  /** bộ set -> danh sách mốc đứng (theo thứ tự ưu tiên trái -> phải) và ánh sáng */
  sets: Record<string, { anchors: string[]; lighting: string }>;
  defaultExpr: Record<string, string>;
  speakerColors?: string[];
}

/** Mốc đứng ưu tiên cho từng bộ set: người thứ nhất bên trái, thứ hai bên phải... */
const MARK_ORDER: Record<string, string[]> = {
  Set_BrickCreatorDesk: ["max_mark", "priya_mark", "center", "desk_center"],
  Set_BrickCafeStreet: ["cafe_left", "cafe_right", "center", "door"],
  Set_BrickOfficeStage: ["stage_left", "stage_right", "stage_center", "floor_center"],
};
const PALETTE = ["#5CE1E6", "#FFD43B", "#FF8787", "#B197FC", "#8CE99A"];
const BAR_COLORS = ["#3E9D4A", "#F2A20C", "#D7261E", "#1E6FD9"];

export function compose(plan: BeatPlan, ctx: ComposeContext): Storyboard {
  const { script, timing } = ctx;
  const setId = ctx.sets[plan.set] ? plan.set : Object.keys(ctx.sets)[0];
  const speakers = [...new Set(script.lines.map((l) => l.speaker))];
  const marks = (MARK_ORDER[setId] ?? ctx.sets[setId].anchors).filter((m) => ctx.sets[setId].anchors.includes(m));
  const cast = speakers.map((id, i) => ({ id, set: setId, mark: marks[i % marks.length] }));
  /** Bên "nhà" của từng người: người đứng trái khung -> 1/3 trái. */
  const side = (id: string) => (speakers.indexOf(id) % 2 === 0 ? "left_third" : "right_third") as "left_third" | "right_third";
  const opposite = (z: string) => (z === "left_third" ? "right_third" : "left_third") as "left_third" | "right_third";
  const lineOf = (id: string) => script.lines.find((l) => l.id === id);
  const words = (lid: string) => timing.lines[lid]?.words.length ?? 1;
  const w = (lid: string, n: number) => `${lid}.w${Math.min(Math.max(1, n), words(lid))}`;
  const L1 = script.lines[0].id;
  const appearT = Math.max(0.6, script.start_offset - 0.6);

  const shots: Storyboard["shots"] = [];
  const ui: Storyboard["ui"] = [];
  // ---- cảnh mở: lắp ráp + diễn viên rơi xuống + thẻ STEP 01
  shots.push({
    id: "S1", t0: 0, t1: `${L1}.start-0.1`, set: setId, summary: "Lắp ráp bộ set",
    camera: { preset: "assembly_high", move: "push_in" }, subject_zone: "center", ui_safe_zone: "top_left", key_t: appearT + 0.3,
    assembly: { t0: 0.1, t1: Math.max(0.8, appearT - 0.2) },
    actors: Object.fromEntries(speakers.map((id, i) => [id, { appear: Number((appearT + i * 0.15).toFixed(2)), expr: [{ t: 0, e: (ctx.defaultExpr[id] ?? "innocent_dot") as Beat["speaker_expr"] & string }] }])),
  } as Storyboard["shots"][number]);
  ui.push({ type: "step_badge", t0: Math.min(1.0, appearT - 0.4), t1: "S1.t1", zone: "top_left", step: "01", title: script.title.slice(0, 22) });

  // ---- mỗi nhịp một cảnh; gộp nhịp liền nhau cùng người nói + cùng cỡ cảnh, không có thẻ chữ
  const beats = plan.beats.filter((b) => lineOf(b.line) && timing.lines[b.line]);
  const groups: Beat[][] = [];
  for (const b of beats) {
    const prev = groups[groups.length - 1]?.[groups[groups.length - 1].length - 1];
    const sp = lineOf(b.line)!.speaker;
    if (prev && lineOf(prev.line)!.speaker === sp && prev.shot === b.shot && (b.ui?.type ?? "none") === "none" && (prev.ui?.type ?? "none") === "none" && b.shot !== "two_shot") groups[groups.length - 1].push(b);
    else groups.push([b]);
  }
  groups.forEach((g, gi) => {
    const first = g[0], last = g[g.length - 1];
    const id = `S${gi + 2}`;
    const sp = lineOf(first.line)!.speaker;
    const subject = first.subject && speakers.includes(first.subject) ? first.subject : sp;
    const isLast = gi === groups.length - 1;
    const nextLine = groups[gi + 1]?.[0].line;
    const t1 = isLast ? "END" : `${nextLine}.start-0.12`;
    const t0 = gi === 0 ? `${L1}.start-0.1` : `${first.line}.start-0.12`;
    let preset = first.shot as "mcu" | "ecu" | "two_shot" | "wide_establish";
    const cue = g.find((b) => b.ui && b.ui.type !== "none")?.ui;
    if (cue && preset === "ecu") preset = "mcu"; // cận mặt không có thẻ chữ
    if (isLast) preset = speakers.length > 1 ? "two_shot" : "mcu";
    let subjects: string[] = preset === "two_shot" ? speakers.slice(0, 2) : preset === "wide_establish" ? [] : [subject];
    if (preset === "two_shot" && subjects.length < 2) { preset = "mcu"; subjects = [subject]; }
    let zone: "left_third" | "center" | "right_third" = preset === "mcu" ? side(subject) : "center";
    let uiZone: "left_third" | "right_third" | "top_center" | "top_left" | "none" = "none";
    if (cue) { uiZone = opposite(zone === "center" ? side(subject) : zone); zone = opposite(uiZone as "left_third" | "right_third"); }
    if (isLast) uiZone = "top_center";
    const actors: NonNullable<Storyboard["shots"][number]["actors"]> = {};
    for (const b of g) {
      const bs = lineOf(b.line)!.speaker;
      const A = (actors[bs] ??= { acts: [], expr: [] });
      if (b.speaker_expr) A.expr!.push({ t: `${b.line}.start`, e: b.speaker_expr });
      if (b.punch) A.expr!.push({ t: w(b.line, b.punch.word), e: b.punch.expr });
      const act = b.action ?? (cue && b === g[0] && cue.type === "brick_chart" ? "point_explain" : "talk_gestures");
      A.acts!.push({ a: act, t0: `${b.line}.start`, t1: `${b.line}.end`, ...(act === "talk_gestures" && side(bs) === "right_third" ? { mirror: true } : {}),
        ...(act === "shock_jump" && preset === "ecu" ? { intensity: 0.45 } : {}) });
      if (b.listener_expr) for (const o of speakers.filter((x) => x !== bs)) {
        const O = (actors[o] ??= { acts: [], expr: [] });
        O.expr!.push({ t: `${b.line}.start+0.3`, e: b.listener_expr });
      }
    }
    const fx = g.filter((b) => b.fx).map((b) => ({ kind: b.fx!.kind, actor: lineOf(b.line)!.speaker, t0: w(b.line, b.fx!.word), t1: `${b.line}.end+0.4`,
      size: b.fx!.kind === "shock_lines" ? 0.07 : 0.05 }));
    shots.push({ id, t0, t1, set: setId, summary: first.summary, subjects, camera: { preset, move: isLast ? "pull_out" : preset === "ecu" ? "push_in" : gi % 2 ? "drift_right" : "push_in" },
      subject_zone: zone, ui_safe_zone: uiZone, key_t: w(first.line, Math.ceil(words(first.line) / 2)), whoosh: true, actors, fx } as Storyboard["shots"][number]);
    // thẻ chữ
    if (cue?.type === "part_callout") ui.push({ type: "part_callout", t0: `${first.line}.w1`, t1: `${id}.t1-0.15`, zone: uiZone as "left_third" | "right_third",
      count: cue.count, label: cue.label, icon: "mug", note: cue.note });
    if (cue?.type === "brick_chart") {
      const lid = g.find((b) => b.ui?.type === "brick_chart")!.line;
      const n = words(lid);
      ui.push({ type: "brick_chart", t0: `${lid}.start-0.2`, t1: `${id}.t1-0.15`, zone: uiZone as "left_third" | "right_third", title: cue.title,
        bars: cue.bars.map((b, i) => ({ label: b.label, value: b.value, color: BAR_COLORS[i % BAR_COLORS.length],
          t: w(lid, 1 + Math.floor((i * n) / cue.bars.length)),
          ...(cue.collapse_last && i === cue.bars.length - 1 ? { collapse_t: `${last.line}.end-0.3` } : {}) })) });
    }
  });
  const lastLine = script.lines[script.lines.length - 1].id;
  ui.push({ type: "step_badge", t0: `${lastLine}.w1`, t1: "END", zone: "top_center", step: plan.ending.step, title: plan.ending.title, check: true });
  return {
    episode: ctx.episode, title: script.title, fps_world: 12, fps_out: 60, resolution: [1920, 1080], samples: 32,
    sets: [{ id: setId, lighting: ctx.sets[setId].lighting }], cast,
    shots, ui, sfx: [{ t: `${lastLine}.w1`, type: "ding", gain: 0.8 }],
    subtitles: { speaker_colors: Object.fromEntries(speakers.map((s, i) => [s, (ctx.speakerColors ?? PALETTE)[i % PALETTE.length]])) },
  };
}

/** Đạo diễn tự động theo luật (không cần AI): xen kẽ cận người nói, thỉnh thoảng hai người, phản ứng người nghe. */
export function autoPlan(script: Script, setId: string, defaultExpr: Record<string, string>): BeatPlan {
  const speakers = [...new Set(script.lines.map((l) => l.speaker))];
  const beats: Beat[] = script.lines.map((l, i) => {
    const q = /\?\s*$/.test(l.text), ex = /!\s*$/.test(l.text);
    const shot = i > 0 && i % 4 === 3 && speakers.length > 1 ? "two_shot" : q && i > 1 ? "ecu" : "mcu";
    return {
      line: l.id, shot, speaker_expr: (q ? "side_glance" : ex ? "shocked_wide" : defaultExpr[l.speaker] ?? "innocent_dot") as Beat["speaker_expr"],
      listener_expr: q ? "deadpan_tired" : ex ? "sweating_nervous" : undefined,
      action: ex ? "shock_jump" : q ? "shrug_confused" : undefined,
      fx: ex ? { kind: "exclaim", word: 1 } : q ? { kind: "question", word: 1 } : undefined,
      summary: l.text.slice(0, 60),
    };
  });
  return { set: setId, beats, ending: { step: "02", title: "Your turn" } };
}
