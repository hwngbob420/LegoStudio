import { z } from "zod";
import {
  ACTIONS, CAMERA_MOVES, CAMERA_PRESETS, EXPRESSIONS, FX_KINDS, SFX_TYPES, SUBJECT_ZONES, UI_ZONE_NAMES,
} from "./constants";
import { TIME_REF_RX } from "./timeref";

// ---------------------------------------------------------------- thời gian
/** Giây, hoặc mốc tham chiếu "L2.w3", "S1.t1", "END" kèm +/- giây. */
export const TimeRef = z.union([
  z.number().nonnegative(),
  z.string().regex(TIME_REF_RX, "Mốc thời gian sai dạng (ví dụ đúng: 2.5, L1.start, L3.w2+0.1, S1.t1, END)"),
]);
export type TimeRef = z.infer<typeof TimeRef>;

const Id = z.string().regex(/^[A-Za-z0-9_]+$/, "ID chỉ gồm chữ, số, gạch dưới");
const Rect = z.tuple([z.number(), z.number(), z.number(), z.number()]);
const Pt = z.tuple([z.number(), z.number()]);
const Hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

// ---------------------------------------------------------------- script.json
export const ScriptLine = z.object({
  id: Id,
  speaker: Id,
  text: z.string().min(1),
  gap_before: z.number().min(0).max(5).optional(),
  rate: z.number().int().min(-10).max(10).optional(),
});
export const Script = z.object({
  title: z.string(),
  logline: z.string().optional(),
  fps_world: z.number().int().positive().default(12),
  start_offset: z.number().min(0).default(0),
  tail: z.number().min(0).default(1),
  lines: z.array(ScriptLine).min(1),
});
export type Script = z.infer<typeof Script>;

// ---------------------------------------------------------------- timing.json (sinh từ TTS / khớp giờ)
export const TimingLine = z.object({
  speaker: Id,
  text: z.string(),
  wav: z.string(),
  wav_start: z.number(),
  start: z.number(),
  end: z.number(),
  visemes: z.array(z.tuple([z.number(), z.number().int(), z.number()])),
  words: z.array(z.tuple([z.number(), z.string()])),
});
export const Timing = z.object({
  fps_world: z.number().int().positive(),
  duration: z.number().positive(),
  lines: z.record(z.string(), TimingLine),
});
export type Timing = z.infer<typeof Timing>;

// ---------------------------------------------------------------- storyboard.json
export const ActClip = z.object({
  a: z.enum(ACTIONS),
  t0: TimeRef,
  t1: TimeRef,
  intensity: z.number().min(0).max(2).optional(),
  mirror: z.boolean().optional(),
});
export const ExprKey = z.object({ t: TimeRef, e: z.enum(EXPRESSIONS) });
export const ActorInShot = z.object({
  appear: TimeRef.optional(),
  acts: z.array(ActClip).optional(),
  expr: z.array(ExprKey).optional(),
});
export const Camera = z.object({
  preset: z.enum(CAMERA_PRESETS),
  move: z.enum(CAMERA_MOVES).optional(),
  yaw: z.number().min(-60).max(60).optional(),
  lens: z.number().min(12).max(200).optional(),
  fstop: z.number().min(0.5).max(22).optional(),
  distance: z.number().positive().max(10).optional(),
  rise: z.number().min(-1).max(2).optional(),
  spread: z.number().min(0.1).max(0.9).optional(),
  shake: z.number().min(0).max(3).optional(),
  /** lệch ống kính dọc (đơn vị chiều lớn của khung); dương = chủ thể thấp xuống */
  shift_y: z.number().min(-0.3).max(0.3).optional(),
});
export const Fx = z.object({
  kind: z.enum(FX_KINDS),
  actor: Id,
  t0: TimeRef,
  t1: TimeRef,
  size: z.number().positive().max(1).optional(),
  offset: z.tuple([z.number(), z.number(), z.number()]).optional(),
});
export const Shot = z.object({
  id: Id,
  t0: TimeRef,
  t1: TimeRef,
  set: Id,
  summary: z.string().optional(),
  chapter: z.string().optional(),
  subjects: z.array(Id).max(2).optional(),
  camera: Camera,
  subject_zone: z.enum(SUBJECT_ZONES).default("center"),
  ui_safe_zone: z.enum(UI_ZONE_NAMES).default("none"),
  key_t: TimeRef.optional(),
  whoosh: z.boolean().optional(),
  assembly: z.object({ t0: TimeRef, t1: TimeRef }).optional(),
  actors: z.record(z.string(), ActorInShot).optional(),
  fx: z.array(Fx).optional(),
});
export type Shot = z.infer<typeof Shot>;

const CueBase = { t0: TimeRef, t1: TimeRef };
const ZonedCue = { ...CueBase, zone: z.enum(["left_third", "right_third", "top_left", "top_right", "top_center", "upper"]) };
export const UiCue = z.discriminatedUnion("type", [
  z.object({ type: z.literal("step_badge"), ...ZonedCue, step: z.string(), title: z.string(), check: z.boolean().optional() }),
  z.object({ type: z.literal("part_callout"), ...ZonedCue, count: z.number().int().min(1).max(9), label: z.string(),
    icon: z.literal("mug").optional(), note: z.string().optional() }),
  z.object({ type: z.literal("brick_chart"), ...ZonedCue, title: z.string(),
    bars: z.array(z.object({ label: z.string(), value: z.number().int().min(1).max(12), color: Hex, t: TimeRef,
      collapse_t: TimeRef.optional() })).min(1).max(6) }),
  z.object({ type: z.literal("arrow"), ...CueBase, from: Pt, to: Pt }),
]);
export type UiCue = z.infer<typeof UiCue>;

export const Storyboard = z.object({
  episode: z.string(),
  title: z.string(),
  fps_world: z.number().int().positive().default(12),
  fps_out: z.number().int().positive().default(60),
  resolution: z.tuple([z.number().int(), z.number().int()]).default([1920, 1080]),
  samples: z.number().int().min(1).max(256).optional(),
  sets: z.array(z.object({ id: Id, lighting: z.string() })).min(1),
  cast: z.array(z.object({ id: Id, set: Id, mark: Id, props: z.array(z.literal("mug")).optional(),
    prop_color: z.string().optional() })),
  shots: z.array(Shot).min(1),
  ui: z.array(UiCue).default([]),
  sfx: z.array(z.object({ t: TimeRef, type: z.enum(SFX_TYPES), gain: z.number().min(0).max(3).optional() })).default([]),
  qa_extra: z.record(z.string(), TimeRef).optional(),
  subtitles: z.object({ speaker_colors: z.record(z.string(), Hex) }).optional(),
});
export type Storyboard = z.infer<typeof Storyboard>;

// ---------------------------------------------------------------- kho kênh
export const CastRecipe = z.object({
  id: Id,
  name: z.string(),
  vibe: z.string(),
  age: z.string().optional(),
  skin: z.string(),
  hair: z.object({ style: z.enum(["messy", "ponytail", "bun", "short_crop", "bob", "cap", "bald"]), color: z.string() }),
  torso: z.object({ color: z.string(), print: z.enum(["hoodie", "blazer", "apron", "cardigan", "tee_star"]), print_color: z.string() }),
  arms: z.string(),
  hands: z.string(),
  hips: z.string(),
  legs: z.string(),
  accessories: z.array(z.enum(["glasses_round", "glasses_square"])).default([]),
  face_details: z.array(z.enum(["blush", "freckles", "beard", "wrinkles", "lashes"])).default([]),
  default_expression: z.enum(EXPRESSIONS),
  voice: z.object({ sapi: z.string(), rate: z.number().int().optional(), pitch_semitones: z.number().optional(),
    gain_db: z.number().optional() }),
});
export type CastRecipe = z.infer<typeof CastRecipe>;

export const LightingPreset = z.object({
  name: z.string(),
  hdri: z.string().optional(),
  hdri_strength: z.number().optional(),
  hdri_rotation_deg: z.number().optional(),
  world_tint: z.string().optional(),
  world_color: z.string().optional(),
  lights: z.array(z.object({
    name: z.string(), type: z.enum(["AREA", "SUN", "POINT", "SPOT"]), offset: z.tuple([z.number(), z.number(), z.number()]),
    energy: z.number(), color: z.string().optional(), size: z.number().optional(),
    aim_offset: z.tuple([z.number(), z.number(), z.number()]).optional(),
  })),
});
export type LightingPreset = z.infer<typeof LightingPreset>;

export const SetEntry = z.object({
  id: Id,
  name: z.string(),
  lighting: z.string(),
  anchors: z.array(Id).min(1),
  notes: z.string().optional(),
  builder: z.string(),
});
export type SetEntry = z.infer<typeof SetEntry>;

export const Catalog = z.looseObject({
  version: z.number(),
  cast: z.record(z.string(), z.looseObject({ name: z.string(), vibe: z.string(), default_expr: z.enum(EXPRESSIONS) })),
  sets: z.record(z.string(), z.looseObject({ lighting: z.string(), anchors: z.array(Id) })),
  expressions: z.array(z.enum(EXPRESSIONS)),
  actions: z.record(z.string(), z.string()),
  lighting_presets: z.array(z.string()),
});
export type Catalog = z.infer<typeof Catalog>;

// ---------------------------------------------------------------- project.json
export const StageState = z.object({
  status: z.enum(["idle", "queued", "running", "done", "error"]).default("idle"),
  at: z.string().optional(),
  message: z.string().optional(),
});
export const Project = z.object({
  id: Id,
  title: z.string().min(1),
  created: z.string(),
  language: z.enum(["vi", "en"]).default("vi"),
  settings: z.object({
    quality: z.enum(["draft", "final"]).default("final"),
    chunk_sec: z.number().min(10).max(600).default(120),
  }).default({ quality: "final", chunk_sec: 120 }),
  stages: z.record(z.string(), StageState).default({}),
  timeline_hash: z.string().optional(),
  chunks: z.array(z.object({ index: z.number().int(), f0: z.number().int(), f1: z.number().int(),
    status: z.enum(["pending", "done", "error"]), file: z.string().optional() })).default([]),
});
export type Project = z.infer<typeof Project>;

/** Đọc và kiểm; ném lỗi tiếng Việt dễ đọc. */
export function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown, label: string): T {
  const r = schema.safeParse(data);
  if (!r.success) {
    const msg = r.error.issues.slice(0, 8).map((i) => `${i.path.join(".") || "(gốc)"}: ${i.message}`).join("; ");
    throw new Error(`${label} không hợp lệ: ${msg}`);
  }
  return r.data;
}

/** Kiểm ID trong storyboard có thật trong catalog; trả danh sách lỗi (rỗng = sạch). */
export function storyboardRefErrors(sb: Storyboard, cat: Catalog): string[] {
  const errs: string[] = [];
  const castIds = new Set(sb.cast.map((c) => c.id));
  for (const c of sb.cast) {
    if (!cat.cast[c.id]) errs.push(`Diễn viên "${c.id}" không có trong kho.`);
    const set = cat.sets[c.set];
    if (!set) errs.push(`Bộ set "${c.set}" không có trong kho.`);
    else if (!set.anchors.includes(c.mark)) errs.push(`Mốc "${c.mark}" không có trong bộ set "${c.set}".`);
  }
  for (const s of sb.sets) if (!cat.sets[s.id]) errs.push(`Bộ set "${s.id}" không có trong kho.`);
  for (const sh of sb.shots) {
    if (!sb.sets.some((s) => s.id === sh.set)) errs.push(`Cảnh ${sh.id}: bộ set "${sh.set}" chưa khai báo ở "sets".`);
    for (const a of sh.subjects ?? []) if (!castIds.has(a)) errs.push(`Cảnh ${sh.id}: chủ thể "${a}" không có trong cast.`);
    for (const a of Object.keys(sh.actors ?? {})) if (!castIds.has(a)) errs.push(`Cảnh ${sh.id}: diễn viên "${a}" không có trong cast.`);
    for (const f of sh.fx ?? []) if (!castIds.has(f.actor)) errs.push(`Cảnh ${sh.id}: hiệu ứng gắn vào "${f.actor}" không có trong cast.`);
    if (sh.camera.preset === "two_shot" && (sh.subjects?.length ?? 0) < 2) errs.push(`Cảnh ${sh.id}: two_shot cần 2 chủ thể.`);
    if (["mcu", "ecu"].includes(sh.camera.preset) && !(sh.subjects?.length)) errs.push(`Cảnh ${sh.id}: ${sh.camera.preset} cần 1 chủ thể.`);
  }
  return errs;
}
