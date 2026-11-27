// Dựng storyboard từ "nhịp" (beats) gọn mà AI (hoặc đạo diễn tự động) trả về. Code tự lo:
// mốc thời gian theo câu/từ, cảnh mở lắp ráp, vùng chủ thể đối diện thẻ chữ (không che mặt), phản ứng người nghe, thẻ STEP kết.
import { z } from "zod";
import { ACTIONS, CAMERA_ANGLES, CAMERA_MOVES, EXPRESSIONS, FX_KINDS, VISUAL_INTENTS, type Manifest, type Script, type Storyboard, type Timing } from "@lse/shared";
import { bake } from "./bake";
import type { FaceSpec } from "./faces";
import { overlayProps, validateLayout, type Issue } from "./overlay";

const Expr = z.enum(EXPRESSIONS);
export const Beat = z.object({
  line: z.string(),
  shot: z.enum(["mcu", "ecu", "two_shot", "wide_establish", "ews", "ws", "mls", "ms", "cu", "ots"]),
  /** Gđ 6: góc máy / chuyển động / bối cảnh (id bộ set) / ý đồ hình ảnh — không ghi thì như cũ */
  angle: z.enum(CAMERA_ANGLES).optional(),
  move: z.enum(CAMERA_MOVES).optional(),
  location: z.string().optional(),
  visual: z.enum(VISUAL_INTENTS).optional(),
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
  /** đổi bên: chủ thể sang 1/3 kia (bộ tự sửa dùng khi người đứng sau bị thẻ chữ che) */
  flip: z.boolean().optional(),
});
export type Beat = z.infer<typeof Beat>;
export const BeatPlan = z.object({
  set: z.string(),
  beats: z.array(Beat),
  ending: z.object({ step: z.string().max(3), title: z.string().max(22) }),
  /** Gđ 6: ánh sáng riêng theo bộ set (id set -> preset), ví dụ cửa hàng tiện lợi ban đêm */
  lighting: z.record(z.string(), z.string()).optional(),
});
export type BeatPlan = z.infer<typeof BeatPlan>;

export interface ComposeContext {
  episode: string;
  script: Script;
  timing: Timing;
  /** bộ set -> danh sách mốc đứng (theo thứ tự ưu tiên trái -> phải) và ánh sáng */
  sets: Record<string, { anchors: string[]; lighting: string; rings?: number; moods?: Record<string, string> }>;
  defaultExpr: Record<string, string>;
  speakerColors?: string[];
}

/** Mốc đứng ưu tiên cho từng bộ set: người thứ nhất bên trái, thứ hai bên phải... */
const MARK_ORDER: Record<string, string[]> = {
  Set_BrickCreatorDesk: ["max_mark", "priya_mark", "center", "desk_center"],
  Set_BrickCafeStreet: ["cafe_left", "cafe_right", "center", "door"],
  Set_BrickOfficeStage: ["stage_left", "stage_right", "stage_center", "floor_center"],
  // Gđ 6: hai mốc đầu là cặp hội thoại tự nhiên (~0,6–0,8 m, cùng quay về phía máy), rồi người thứ 3, 4...
  Set_CityStreetCorner: ["sidewalk_left", "sidewalk_right", "cafe_table", "bench", "book_door", "crosswalk"],
  Set_ApartmentCutaway: ["living_center", "bedroom_door", "couch", "bed", "tv_watch", "window_view"],
  Set_OfficeFloor: ["desk_a", "desk_b", "aisle", "cooler", "meeting_left", "meeting_right", "whiteboard"],
  Set_MiniMart: ["customer", "clerk", "aisle", "entrance", "fridge"],
  Set_ParkPlaza: ["path_left", "path_center", "fountain", "bench_left", "bench_right", "overlook"],
  Set_BusStop: ["curb_left", "curb_right", "stop_sign", "shelter", "sidewalk_front", "bus_door"],
  Set_InstructionVoid: ["narrator", "pedestal", "left", "right"],
};
/** Gđ 6: ý đồ hình ảnh -> cỡ cảnh + góc + chuyển động mặc định. */
export const VISUAL_TO_SHOT: Record<(typeof VISUAL_INTENTS)[number], { shot: Beat["shot"]; angle?: Beat["angle"]; move?: Beat["move"] }> = {
  establishing_scale: { shot: "ews", angle: "high_angle", move: "crane_reveal" },
  intimate_deadpan: { shot: "cu", move: "push_in" },
  satirical_low_angle: { shot: "mls", angle: "low_angle", move: "dolly_in" },
  overhead_chaos: { shot: "ws", angle: "birds_eye", move: "none" },
  cutaway_gag: { shot: "ms", move: "dolly_in" },
  conversation: { shot: "ots" },
  reveal: { shot: "ws", move: "dolly_out" },
  isolation: { shot: "ws", angle: "high_angle", move: "pull_out" },
};
const SINGLE = new Set(["mcu", "ecu", "mls", "ms", "cu"]);
const PALETTE = ["#5CE1E6", "#FFD43B", "#FF8787", "#B197FC", "#8CE99A"];
const BAR_COLORS = ["#3E9D4A", "#F2A20C", "#D7261E", "#1E6FD9"];

export function compose(plan: BeatPlan, ctx: ComposeContext): Storyboard {
  const { script, timing } = ctx;
  const lineOf0 = (id: string) => script.lines.find((l) => l.id === id);
  // Gđ 6: bối cảnh của từng nhịp = beat.location -> câu thoại.location -> set chung của kế hoạch
  const locOfBeat = (b: Beat) => {
    const l = b.location && ctx.sets[b.location] ? b.location : lineOf0(b.line)?.location;
    return l && ctx.sets[l] ? l : undefined;
  };
  const firstLoc = plan.beats.map(locOfBeat).find(Boolean);
  const setId = firstLoc ?? (ctx.sets[plan.set] ? plan.set : Object.keys(ctx.sets)[0]);
  const speakers = [...new Set(script.lines.map((l) => l.speaker))];
  const marksOf = (sid: string) => {
    const anchors = ctx.sets[sid].anchors;
    const pref = (MARK_ORDER[sid] ?? anchors.filter((a) => a !== "center")).filter((m) => anchors.includes(m));
    return pref.length ? pref : anchors;
  };
  const marks = marksOf(setId);
  const cast = speakers.map((id, i) => ({ id, set: setId, mark: marks[i % marks.length] }));
  /** Bên "nhà" của từng người: người đứng trái khung -> 1/3 trái. */
  const side = (id: string) => (speakers.indexOf(id) % 2 === 0 ? "left_third" : "right_third") as "left_third" | "right_third";
  const opposite = (z: string) => (z === "left_third" ? "right_third" : "left_third") as "left_third" | "right_third";
  const lineOf = (id: string) => script.lines.find((l) => l.id === id);
  const words = (lid: string) => timing.lines[lid]?.words.length ?? 1;
  const w = (lid: string, n: number) => `${lid}.w${Math.min(Math.max(1, n), words(lid))}`;
  const L1 = script.lines[0].id;
  // block (5B) của từng câu: câu chưa ghi block theo câu trước
  const blockOfLine = new Map<string, string>();
  { let cur = script.lines.find((l) => l.block)?.block ?? "b01"; for (const l of script.lines) { if (l.block) cur = l.block; blockOfLine.set(l.id, cur); } }
  const blockOf = (lid: string) => blockOfLine.get(lid) ?? "b01";
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
  const locOf = (b: Beat) => locOfBeat(b) ?? setId;
  const groups: Beat[][] = [];
  for (const b of beats) {
    const prev = groups[groups.length - 1]?.[groups[groups.length - 1].length - 1];
    const sp = lineOf(b.line)!.speaker;
    // không gộp qua ranh giới block (mỗi cảnh nằm gọn trong một block) và qua chỗ đổi bối cảnh / góc máy
    if (prev && blockOf(prev.line) === blockOf(b.line) && lineOf(prev.line)!.speaker === sp && prev.shot === b.shot && (b.ui?.type ?? "none") === "none" && (prev.ui?.type ?? "none") === "none" && b.shot !== "two_shot"
      && locOf(prev) === locOf(b) && prev.angle === b.angle && prev.move === b.move) groups[groups.length - 1].push(b);
    else groups.push([b]);
  }
  // Gđ 6: chia đoạn theo bối cảnh; người tham gia mỗi đoạn được dời tới mốc của set đó ở cảnh đầu đoạn
  const where: Record<string, string> = Object.fromEntries(cast.map((c) => [c.id, `${c.set}|${c.mark}`]));
  const multiLoc = groups.some((g) => locOf(g[0]) !== setId);
  const segStart = groups.map((g, gi) => gi === 0 || locOf(g[0]) !== locOf(groups[gi - 1][0]));
  const segPeople = groups.map((_, gi) => {
    if (!segStart[gi]) return [] as string[];
    const ppl: string[] = [];
    for (let k = gi; k < groups.length && (k === gi || !segStart[k]); k++) {
      for (const b of groups[k]) {
        const sp = lineOf(b.line)!.speaker;
        if (!ppl.includes(sp)) ppl.push(sp);
        if (b.subject && speakers.includes(b.subject) && !ppl.includes(b.subject)) ppl.push(b.subject);
      }
    }
    return ppl;
  });
  // thứ tự cảnh trong block (luân phiên chuyển động máy tính theo block, để block khác thêm/bớt cảnh không làm đổi block này)
  const inBlock: number[] = [];
  groups.forEach((g, gi) => { inBlock.push(gi > 0 && blockOf(groups[gi - 1][0].line) === blockOf(g[0].line) ? inBlock[gi - 1] + 1 : 0); });
  groups.forEach((g, gi) => {
    const first = g[0], last = g[g.length - 1];
    const id = `S${gi + 2}`;
    const loc = locOf(first);
    // dời người tham gia đoạn mới tới set của đoạn (mốc theo thứ tự xuất hiện)
    const moves: Record<string, { mark: string; set: string }> = {};
    if (segStart[gi] && multiLoc) {
      const mk = marksOf(loc);
      segPeople[gi].forEach((a, k) => {
        const target = `${loc}|${mk[k % mk.length]}`;
        if (where[a] !== target) { moves[a] = { mark: mk[k % mk.length], set: loc }; where[a] = target; }
      });
    }
    let k0 = gi;
    while (k0 > 0 && !segStart[k0]) k0--;
    const present = segPeople[k0];
    const sp = lineOf(first.line)!.speaker;
    const subject = first.subject && speakers.includes(first.subject) ? first.subject : sp;
    const isLast = gi === groups.length - 1;
    const nextLine = groups[gi + 1]?.[0].line;
    const t1 = isLast ? "END" : `${nextLine}.start-0.12`;
    const t0 = gi === 0 ? `${L1}.start-0.1` : `${first.line}.start-0.12`;
    let preset = first.shot as Beat["shot"];
    const cue = g.find((b) => b.ui && b.ui.type !== "none")?.ui;
    if (cue && preset === "ecu") preset = "mcu"; // cận mặt không có thẻ chữ
    if (cue && (preset === "cu" || preset === "ews" || preset === "ws")) preset = "ms"; // thẻ chữ cần chỗ trống 1/3
    if (isLast) preset = speakers.length > 1 ? "two_shot" : "mcu";
    // cảnh hai người / qua vai: ưu tiên người cùng đoạn bối cảnh
    const pool = multiLoc && present?.length ? present : speakers;
    const other = pool.find((x) => x !== subject);
    let subjects: string[] = preset === "two_shot" ? (multiLoc ? [subject, other].filter((x): x is string => !!x) : speakers.slice(0, 2))
      : preset === "wide_establish" || preset === "ews" ? [] : preset === "ws" ? pool.slice(0, 2)
        : preset === "ots" ? [subject, other].filter((x): x is string => !!x) : [subject];
    if (preset === "two_shot" && subjects.length < 2) { preset = "mcu"; subjects = [subject]; }
    if (preset === "ots" && subjects.length < 2) { preset = "ms"; subjects = [subject]; }
    const home = first.flip ? opposite(side(subject)) : side(subject);
    let zone: "left_third" | "center" | "right_third" = preset === "mcu" || preset === "ots" || (SINGLE.has(preset) && preset !== "ecu") ? home : "center";
    let uiZone: "left_third" | "right_third" | "top_center" | "top_left" | "none" = "none";
    if (cue) { uiZone = opposite(zone === "center" ? home : zone); zone = opposite(uiZone as "left_third" | "right_third"); }
    if (isLast) uiZone = "top_center";
    const actors: NonNullable<Storyboard["shots"][number]["actors"]> = {};
    for (const [a, mv] of Object.entries(moves)) actors[a] = { at: mv, acts: [], expr: [] };
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
    const legacyMove = isLast ? "pull_out" : preset === "ecu" ? "push_in" : inBlock[gi] % 2 ? "drift_right" : "push_in";
    const NEW_DEFAULT: Record<string, string> = { ews: "dolly_out", ws: "truck_pan", mls: "push_in", ms: inBlock[gi] % 2 ? "drift_right" : "push_in", cu: "push_in", ots: "none" };
    const move = first.move ?? (isLast ? "pull_out" : NEW_DEFAULT[preset] ?? legacyMove);
    const camera = { preset, move, ...(first.angle && first.angle !== "eye_level" ? { angle: first.angle } : {}) } as Storyboard["shots"][number]["camera"];
    // Gđ 6: đổi bối cảnh -> cảnh mở toàn rộng ngắn (EWS) trên mấy từ đầu, rồi mới vào cảnh chính
    const nw = words(first.line);
    const establish = multiLoc && segStart[gi] && gi > 0 && !["ews", "ws", "wide_establish"].includes(preset) && nw >= 5;
    let t0Main: string | number = t0;
    if (establish) {
      const cut = w(first.line, Math.min(3, nw - 2));
      const atOnly = Object.fromEntries(Object.entries(moves).map(([a, mv]) => [a, { at: mv }]));
      shots.push({ id: `${id}e`, t0, t1: cut, set: loc, summary: `Mở cảnh ${loc}`, subjects: [],
        camera: { preset: "ews", move: "crane_reveal", ...(gi % 2 ? { angle: "high_angle" } : {}) }, subject_zone: "center", ui_safe_zone: "none",
        whoosh: true, actors: atOnly } as Storyboard["shots"][number]);
      t0Main = cut;
      for (const a of Object.keys(moves)) { delete actors[a].at; }
    }
    shots.push({ id, t0: t0Main, t1, set: multiLoc ? loc : setId, summary: first.summary, subjects, camera,
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
    sets: [...new Set([setId, ...shots.map((s) => s.set)])].map((id) => ({ id, lighting: plan.lighting?.[id] ?? ctx.sets[id].lighting })), cast,
    shots, ui, sfx: [{ t: `${lastLine}.w1`, type: "ding", gain: 0.8 }],
    subtitles: { speaker_colors: Object.fromEntries(speakers.map((s, i) => [s, (ctx.speakerColors ?? PALETTE)[i % PALETTE.length]])) },
  };
}

/** Đạo diễn tự động theo luật (không cần AI): xen kẽ cận người nói, thỉnh thoảng hai người, phản ứng người nghe. */
/** Gđ 6: nhịp hình ảnh mặc định trong một đoạn bối cảnh (câu không ghi ý đồ hình ảnh). */
const RICH_CYCLE: { shot: Beat["shot"]; angle?: Beat["angle"]; move?: Beat["move"] }[] = [
  { shot: "ms" }, { shot: "ots" }, { shot: "cu" }, { shot: "ots" }, { shot: "mls", angle: "low_angle" }, { shot: "two_shot" },
  { shot: "cu" }, { shot: "ws", angle: "high_angle", move: "dolly_out" },
];

export function autoPlan(script: Script, setId: string, defaultExpr: Record<string, string>): BeatPlan {
  const speakers = [...new Set(script.lines.map((l) => l.speaker))];
  const rich = script.lines.some((l) => l.location || l.visual);
  let si = 0;
  let k = 0;
  const beats: Beat[] = script.lines.map((l, j) => {
    // i = thứ tự câu trong block (5B), để nhịp luân phiên cỡ cảnh không phụ thuộc block trước
    const i = j > 0 && l.block && l.block !== script.lines[j - 1].block ? (k = 0) : (j === 0 ? (k = 0) : ++k);
    const q = /\?\s*$/.test(l.text), ex = /!\s*$/.test(l.text);
    const shot = i > 0 && i % 4 === 3 && speakers.length > 1 ? "two_shot" : q && i > 1 ? "ecu" : "mcu";
    // Gđ 6: kịch bản có bối cảnh / ý đồ hình ảnh -> đủ thang cỡ cảnh, luân phiên theo vị trí trong đoạn bối cảnh
    let extra: Partial<Beat> = {};
    if (rich) {
      const seg = j === 0 || l.location !== script.lines[j - 1].location ? (si = 0) : ++si;
      const v = l.visual ? VISUAL_TO_SHOT[l.visual] : null;
      const cyc = RICH_CYCLE[seg % RICH_CYCLE.length];
      const pick = v ?? (q && seg > 1 ? { shot: "cu" as const } : ex ? { shot: "mls" as const, angle: "low_angle" as const } : cyc);
      extra = { shot: speakers.length < 2 && (pick.shot === "ots" || pick.shot === "two_shot") ? "ms" : pick.shot,
        ...(pick.angle ? { angle: pick.angle } : {}), ...(pick.move ? { move: pick.move } : {}), ...(l.location ? { location: l.location } : {}),
        ...(l.visual ? { visual: l.visual } : {}) };
    }
    return {
      ...{ line: l.id, shot }, ...extra, speaker_expr: (q ? "side_glance" : ex ? "shocked_wide" : defaultExpr[l.speaker] ?? "innocent_dot") as Beat["speaker_expr"],
      listener_expr: q ? "deadpan_tired" : ex ? "sweating_nervous" : undefined,
      action: ex ? "shock_jump" : q ? "shrug_confused" : undefined,
      fx: ex ? { kind: "exclaim", word: 1 } : q ? { kind: "question", word: 1 } : undefined,
      summary: l.text.slice(0, 60),
    };
  });
  return { set: setId, beats, ending: { step: "02", title: "Your turn" } };
}

/** Tự sửa bố cục: cảnh có lỗi che mặt -> lật bên chủ thể -> cận mặt thành trung cận -> bỏ thẻ chữ. Trả kế hoạch cuối + storyboard + lỗi còn lại. */
export function autoFix(plan: BeatPlan, ctx: ComposeContext, lib: { manifest: Manifest; faceSpec: FaceSpec; defaultExpr: Record<string, string> }) {
  const evalPlan = (p: BeatPlan) => {
    const sb = compose(p, ctx);
    const T = bake({ storyboard: sb, timing: ctx.timing, ...lib });
    return { sb, issues: validateLayout(T, sb, overlayProps(sb, ctx.timing, {})) };
  };
  const shotLines = (sb: Storyboard, shotId: string) => {
    const i = sb.shots.findIndex((s) => s.id === shotId);
    const from = String(sb.shots[i].t0).split(".")[0];
    const to = i + 1 < sb.shots.length ? String(sb.shots[i + 1].t0).split(".")[0] : null;
    const ids = ctx.script.lines.map((l) => l.id);
    const a = ids.indexOf(from), b = to ? ids.indexOf(to) : ids.length;
    return a < 0 ? [] : ids.slice(a, b);
  };
  let cur = plan;
  let res = evalPlan(cur);
  const steps: ((b: Beat) => Beat)[] = [
    (b) => ({ ...b, flip: !b.flip }),
    (b) => ({ ...b, flip: !b.flip, shot: b.shot === "ecu" ? "mcu" : b.shot }),
    (b) => ({ ...b, ui: { type: "none" }, shot: b.shot === "ecu" ? "mcu" : b.shot }),
  ];
  for (const fix of steps) {
    const bad = new Set(res.issues.filter((i) => i.level === "error").map((i) => i.shot));
    if (!bad.size) break;
    const lines = new Set([...bad].filter((s) => s !== "S1").flatMap((s) => shotLines(res.sb, s)));
    const next: BeatPlan = { ...cur, beats: cur.beats.map((b) => (lines.has(b.line) ? fix(b) : b)) };
    const r2 = evalPlan(next);
    const errs = (x: { issues: Issue[] }) => x.issues.filter((i) => i.level === "error").length;
    if (errs(r2) <= errs(res)) { cur = next; res = r2; }
  }
  return { plan: cur, storyboard: res.sb, issues: res.issues };
}

/**
 * Ghép storyboard sau khi dựng lại vài block (5C): giữ nguyên cảnh/thẻ chữ/âm thanh của block khác (kể cả chỗ người dùng
 * đã sửa tay ở tab Đạo diễn), lấy phần của block được dựng lại từ `fresh`. ID cảnh mới đổi thành `<block>_S<k>` để không
 * trùng ID cũ. Câu đầu block đổi ID (viết lại thoại) -> cảnh cuối block trước được nối lại cho khớp.
 */
export function spliceBlocks(old: Storyboard, fresh: Storyboard, script: Script, targets: Set<string>): Storyboard {
  const blocks: string[] = [];
  const blockOfLine = new Map<string, string>();
  { let cur = script.lines.find((l) => l.block)?.block ?? "b01"; for (const l of script.lines) { if (l.block) cur = l.block; blockOfLine.set(l.id, cur); if (blocks.at(-1) !== cur) blocks.push(cur); } }
  const first = blocks[0], lastB = blocks[blocks.length - 1];
  const anyTarget = [...targets][0];
  const rank = (b: string) => { const i = blocks.indexOf(b); return i < 0 ? blocks.length : i; };
  /** block của một mốc thời gian; câu không còn trong kịch bản = câu cũ của block đang dựng lại */
  const ownerOf = (sb: Storyboard) => {
    const shotOwner = new Map<string, string>();
    const of = (ref: unknown): string => {
      if (typeof ref === "number") return first;
      const m = /^([A-Za-z0-9_]+)(?:\.([a-z0-9]+))?/.exec(String(ref));
      if (!m) return first;
      if (m[1] === "END") return lastB;
      if (shotOwner.has(m[1])) return shotOwner.get(m[1])!;
      return blockOfLine.get(m[1]) ?? anyTarget;
    };
    for (const s of sb.shots) shotOwner.set(s.id, of(s.t0));
    return of;
  };
  const ownOld = ownerOf(old), ownFresh = ownerOf(fresh);
  // đổi ID cảnh mới của block dựng lại + sửa các mốc "S7.t1" trỏ tới chúng
  const rename = new Map<string, string>();
  const perBlock: Record<string, number> = {};
  for (const s of fresh.shots) { const b = ownFresh(s.t0); if (targets.has(b)) rename.set(s.id, `${b}_S${(perBlock[b] = (perBlock[b] ?? 0) + 1)}`); }
  const fix = (v: unknown) => {
    if (typeof v !== "string") return v;
    const m = /^([A-Za-z0-9_]+)(\..*)$/.exec(v);
    return m && rename.has(m[1]) ? `${rename.get(m[1])}${m[2]}` : v;
  };
  const deep = <T,>(o: T): T => JSON.parse(JSON.stringify(o), (_k, v) => fix(v));
  type Item<T> = { item: T; b: string; src: number; i: number };
  const pick = <T,>(oldList: T[], freshList: T[], refOf: (x: T) => unknown): T[] => {
    const all: Item<T>[] = [
      ...oldList.map((item, i) => ({ item, b: ownOld(refOf(item)), src: 0, i })).filter((x) => !targets.has(x.b)),
      ...freshList.map((item, i) => ({ item, b: ownFresh(refOf(item)), src: 1, i })).filter((x) => targets.has(x.b)),
    ];
    return all.sort((a, b) => rank(a.b) - rank(b.b) || a.src - b.src || a.i - b.i).map((x) => x.item);
  };
  const shots = pick(old.shots, fresh.shots.map((s) => ({ ...deep(s), id: rename.get(s.id) ?? s.id })), (s) => s.t0);
  // nối lại: cảnh giữ nguyên mà mốc kết thúc trỏ tới câu đã bị xoá -> kết thúc ở đầu cảnh kế tiếp
  const live = (ref: unknown) => typeof ref !== "string" || /^(END|S\w*|b\d+_S\d+)/.test(ref) || blockOfLine.has(ref.split(".")[0]);
  for (let i = 0; i + 1 < shots.length; i++) if (!live(shots[i].t1)) shots[i] = { ...shots[i], t1: shots[i + 1].t0 };
  const ui = pick(old.ui, fresh.ui.map((c) => deep(c)), (c) => c.t0);
  const sfx = pick(old.sfx, fresh.sfx, (e) => e.t);
  // diễn viên: hợp hai danh sách (block mới có thể thêm người nói)
  const cast = [...old.cast, ...fresh.cast.filter((c) => !old.cast.some((o) => o.id === c.id))];
  const colors = { ...(fresh.subtitles?.speaker_colors ?? {}), ...(old.subtitles?.speaker_colors ?? {}) };
  return { ...old, cast, shots, ui, sfx, subtitles: { speaker_colors: colors } };
}
