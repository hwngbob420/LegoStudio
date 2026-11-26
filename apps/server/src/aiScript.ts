// AI đọc truyện/outline -> kịch bản thoại sạch + bảng tài nguyên (dùng lại diễn viên kho kênh, tạo diễn viên riêng cho tập).
// Phương án A: "viết nhanh" một bước. Phương án B (dàn ý -> phê bình -> thoại -> sửa) ở aiWriting.ts dùng chung các hàm dưới đây.
import { existsSync, readFileSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { CastRecipe, Script, linesForDuration, parseOrThrow } from "@lse/shared";
import { castRecipeFiles } from "@lse/director/io";
import type { AiRequest, TextAI } from "./ai/types";
import { writeJsonAtomic } from "./jsonStore";
import { sourcesForPrompt } from "./sources";
import { HttpError, assertValidId, type WorkspacePaths } from "./workspace";

const SKINS = ["yellow_classic", "skin_light", "skin_light_warm", "skin_medium", "skin_medium_brown", "skin_deep_brown"] as const;
const COLORS = ["white", "black", "red", "brick_red", "blue", "blue_dark", "orange", "green", "green_bright", "lime", "teal_dark", "tan",
  "brown_dark", "light_gray", "dark_gray", "charcoal", "mustard", "lavender", "slate_blue", "denim_blue", "sand_blue", "sand_green", "pink", "coral", "cream"] as const;

export const NewCast = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]{2,30}$/),
  name: z.string().max(30),
  vibe: z.string().max(120),
  age: z.string().max(20),
  skin: z.enum(SKINS),
  hair_style: z.enum(["messy", "ponytail", "bun", "short_crop", "bob", "cap", "bald"]),
  hair_color: z.enum(["hair_brown", "hair_black", "hair_grey", "hair_blonde", "hair_red"]),
  torso_print: z.enum(["hoodie", "blazer", "apron", "cardigan", "tee_star"]),
  torso_color: z.enum(COLORS),
  legs_color: z.enum(COLORS),
  glasses: z.enum(["none", "glasses_round", "glasses_square"]),
  face_details: z.array(z.enum(["blush", "freckles", "beard", "wrinkles", "lashes"])).max(2),
  voice: z.enum(["male", "female"]),
  default_expression: z.enum(["innocent_dot", "deadpan_tired", "smug_smirk", "happy_closed", "sweating_nervous", "angry_brow"]),
});
export type NewCast = z.infer<typeof NewCast>;

const Line = z.object({ speaker: z.string(), text: z.string().min(2).max(160) });

/** Khuôn kịch bản AI trả về; số câu theo độ dài mục tiêu (không còn trần cứng 24 câu). */
export const scriptPlanSchema = (maxLines: number, minLines = 2) => z.object({
  title: z.string().max(60),
  logline: z.string().max(200),
  new_cast: z.array(NewCast).max(3),
  lines: z.array(Line).min(minLines).max(maxLines),
});
/** Khuôn mặc định (giữ tương thích): đủ cho tập 5 phút. */
export const ScriptPlan = scriptPlanSchema(linesForDuration(300).max);
export type ScriptPlan = z.infer<typeof ScriptPlan>;

export function bibleText(paths: WorkspacePaths) {
  const f = path.join(paths.library, "series_bible.md");
  return existsSync(f) ? readFileSync(f, "utf8") : "";
}

/** Hướng dẫn biên kịch của kênh (skill Screenwriter): workspace/channel_library/screenwriting_guide.md */
export function guideText(paths: WorkspacePaths) {
  const f = path.join(paths.library, "screenwriting_guide.md");
  return existsSync(f) ? readFileSync(f, "utf8") : "";
}

export function castSummary(paths: WorkspacePaths, episode?: string) {
  return Object.entries(castRecipeFiles(paths.library)).map(([id, f]) => {
    const r = JSON.parse(readFileSync(f, "utf8"));
    return `- ${id}: ${r.name} — ${r.vibe}`;
  }).join("\n");
}

export const knownCast = (paths: WorkspacePaths, episode?: string) =>
  Object.keys(castRecipeFiles(paths.library));

/** Lời dặn chung cho mọi bước viết. */
export function writerSystem(paths: WorkspacePaths, role: string) {
  return [
    `Bạn là ${role} của một kênh video giải thích hài phong cách mô hình gạch (minifig). Chỉ trả JSON đúng schema.`,
    "Lời thoại viết bằng TIẾNG ANH tự nhiên, câu ngắn (giọng đọc máy), có dấu câu để ngắt nhịp.",
    "Không dùng tên thương hiệu thật (không viết LEGO, Duplo...), không nhân vật có bản quyền, không bắt chước người thật.",
    "\n# Hướng dẫn biên kịch của kênh\n" + guideText(paths),
    "\n# Series bible\n" + bibleText(paths),
  ].join("\n");
}

/** Đầu vào chung của phòng biên kịch. */
export const WritingInput = z.object({
  story: z.string().max(200_000).default(""),
  sourceIds: z.array(z.string().regex(/^src_[a-f0-9]{10}$/)).max(10).default([]),
  mood: z.string().max(60).default("Hài hước"),
  viewpoint: z.string().max(1000).default(""),
  targetSec: z.number().min(10).max(600).default(45),
});
export type WritingInput = z.infer<typeof WritingInput>;

/** Gom truyện dán tay + tư liệu đã gửi thành khối lời nhắc; kiểm bắt buộc. */
export async function gatherMaterial(paths: WorkspacePaths, episode: string, raw: unknown) {
  assertValidId(episode, "ID tập");
  const input = WritingInput.parse(raw ?? {});
  if (!input.story.trim() && !input.sourceIds.length) throw new HttpError(400, "Chưa có truyện: dán truyện hoặc chọn ít nhất một file tư liệu.");
  if (!input.viewpoint.trim()) throw new HttpError(400, "Hãy điền \"Góc nhìn của tôi\" (AI phải lồng quan điểm riêng vào kịch bản).");
  const src = await sourcesForPrompt(paths, episode, input.sourceIds);
  const budget = linesForDuration(input.targetSec);
  const material = [
    `Không khí: ${input.mood}`,
    `Độ dài mục tiêu: ${input.targetSec} giây -> ${budget.min}–${budget.max} câu thoại.`,
    `Góc nhìn của tác giả (phải lồng vào): ${input.viewpoint}`,
    input.story.trim() ? `\nTruyện / ý tưởng dán tay:\n<outline_document name="dan_tay">\n${input.story}\n</outline_document>` : "",
    src.text ? `\n${src.text}` : "",
    src.visionFiles.length ? `\nTư liệu dạng ảnh chụp (không có lớp chữ), hãy đọc trực tiếp: ${src.visionFiles.join(", ")}` : "",
  ].filter(Boolean).join("\n");
  const attach: Pick<AiRequest<unknown>, "images" | "files"> = src.visionFiles.length
    ? { files: src.visionFiles, images: src.visionFiles.map((f) => ({ mime: "application/pdf", base64: readFileSync(f).toString("base64") })) }
    : {};
  return { input, material, budget, attach };
}

/** Ghi diễn viên mới vào kho riêng của tập; trả danh sách id đã tạo. */
export async function materializeCast(paths: WorkspacePaths, episode: string, cast: NewCast[]) {
  const existing = knownCast(paths);
  const out: string[] = [];
  for (const c of cast) {
    if (existing.includes(c.id)) continue;
    const recipe = parseOrThrow(CastRecipe, {
      id: c.id, name: c.name, vibe: c.vibe, age: c.age, skin: c.skin,
      hair: { style: c.hair_style, color: c.hair_color },
      torso: { color: c.torso_color, print: c.torso_print, print_color: c.torso_color === "white" ? "black" : "white" },
      arms: c.torso_color, hands: c.skin, hips: c.legs_color, legs: c.legs_color,
      accessories: c.glasses === "none" ? [] : [c.glasses], face_details: c.face_details, default_expression: c.default_expression,
      voice: { sapi: c.voice === "female" ? "Microsoft Zira Desktop" : "Microsoft David Desktop", rate: 0, pitch_semitones: c.voice === "female" ? 1 : -1.5 },
    }, `Diễn viên ${c.id}`);
    await writeJsonAtomic(path.join(paths.episodeCast(episode), `${c.id}.json`), CastRecipe, recipe);
    out.push(c.id);
  }
  return out;
}

const BRAND = /\b(lego|duplo)\b/i;

/** Kiểm bằng code (không AI): người nói có thật, không chữ thương hiệu. Trả danh sách lỗi. */
export function lineErrors(lines: { speaker: string; text: string }[], known: Set<string>): string[] {
  const errs: string[] = [];
  const bad = [...new Set(lines.filter((l) => !known.has(l.speaker)).map((l) => l.speaker))];
  if (bad.length) errs.push(`Người nói không có thật: ${bad.join(", ")}`);
  lines.forEach((l, i) => { if (BRAND.test(l.text)) errs.push(`Câu ${i + 1} có tên thương hiệu: "${l.text}"`); });
  return errs;
}

export async function writeScriptFile(paths: WorkspacePaths, episode: string, data: { title: string; logline: string; lines: { speaker: string; text: string }[] }) {
  const script = parseOrThrow(Script, {
    title: data.title, logline: data.logline, fps_world: 12, start_offset: 2.5, tail: 1.2,
    lines: data.lines.map((l, i) => ({ id: `L${i + 1}`, speaker: l.speaker, text: l.text.trim(), gap_before: i === 0 ? 0 : 0.35 })),
  }, "Kịch bản");
  await writeJsonAtomic(path.join(paths.projectDir(episode), "script.json"), Script, script);
  return script;
}

/** Phương án A: một lời gọi AI viết thẳng kịch bản (từ truyện dán tay và/hoặc file tư liệu). */
export async function analyzeStory(ai: TextAI, paths: WorkspacePaths, episode: string, raw: unknown) {
  const { input, material, budget, attach } = await gatherMaterial(paths, episode, raw);
  const system = [
    writerSystem(paths, "biên kịch"),
    "Ưu tiên dùng lại diễn viên có sẵn; chỉ tạo diễn viên mới (new_cast) khi truyện thật sự cần, tối đa 3, khác nhau rõ về dáng/tóc/màu.",
    "speaker của mỗi câu phải là id có sẵn hoặc id trong new_cast.",
    `Đi đúng khung nhịp: hook -> setup -> leo thang có số liệu -> cú lật -> chốt bằng một câu 'Step N: ...'. Tổng ${budget.min}–${budget.max} câu.`,
  ].join("\n");
  const prompt = `Diễn viên có sẵn:\n${castSummary(paths, episode)}\n\n${material}`;
  const { data } = await ai.json({ label: "phan_tich_truyen", system, prompt, schema: scriptPlanSchema(budget.max), ...attach });
  const known = new Set([...knownCast(paths, episode), ...data.new_cast.map((c) => c.id)]);
  const errs = lineErrors(data.lines, known);
  if (errs.length) throw new HttpError(422, `${errs[0]}. Bấm lại để thử lần nữa.`);
  const newCast = await materializeCast(paths, episode, data.new_cast);
  const script = await writeScriptFile(paths, episode, data);
  await fs.mkdir(path.join(paths.projectDir(episode), "writing"), { recursive: true });
  await writeJsonAtomic(path.join(paths.projectDir(episode), "writing", "input.json"), WritingInput, input);
  return { script, newCast };
}
