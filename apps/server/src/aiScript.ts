// AI đọc truyện -> kịch bản thoại sạch + bảng tài nguyên (dùng lại diễn viên kho kênh, tạo diễn viên riêng cho tập).
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { CastRecipe, Script, parseOrThrow } from "@lse/shared";
import { castRecipeFiles } from "@lse/director/io";
import type { TextAI } from "./ai/types";
import { writeJsonAtomic } from "./jsonStore";
import { HttpError, assertValidId, type WorkspacePaths } from "./workspace";

const SKINS = ["yellow_classic", "skin_light", "skin_light_warm", "skin_medium", "skin_medium_brown", "skin_deep_brown"] as const;
const COLORS = ["white", "black", "red", "brick_red", "blue", "blue_dark", "orange", "green", "green_bright", "lime", "teal_dark", "tan",
  "brown_dark", "light_gray", "dark_gray", "charcoal", "mustard", "lavender", "slate_blue", "denim_blue", "sand_blue", "sand_green", "pink", "coral", "cream"] as const;

export const ScriptPlan = z.object({
  title: z.string().max(60),
  logline: z.string().max(200),
  new_cast: z.array(z.object({
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
  })).max(3),
  lines: z.array(z.object({ speaker: z.string(), text: z.string().min(2).max(160) })).min(2).max(24),
});
export type ScriptPlan = z.infer<typeof ScriptPlan>;

export function bibleText(paths: WorkspacePaths) {
  const f = path.join(paths.library, "series_bible.md");
  return existsSync(f) ? readFileSync(f, "utf8") : "";
}

export function castSummary(paths: WorkspacePaths) {
  return Object.entries(castRecipeFiles(paths.library)).map(([id, f]) => {
    const r = JSON.parse(readFileSync(f, "utf8"));
    return `- ${id}: ${r.name} — ${r.vibe}`;
  }).join("\n");
}

export async function analyzeStory(ai: TextAI, paths: WorkspacePaths, episode: string, input: { story: string; mood?: string; viewpoint?: string }) {
  assertValidId(episode, "ID tập");
  if (!input.story?.trim()) throw new HttpError(400, "Chưa có truyện để phân tích.");
  if (!input.viewpoint?.trim()) throw new HttpError(400, "Hãy điền \"Góc nhìn của tôi\" (AI phải lồng quan điểm riêng vào kịch bản).");
  const existing = Object.keys(castRecipeFiles(paths.library));
  const system = [
    "Bạn là biên kịch của một kênh video giải thích hài phong cách mô hình gạch (minifig).",
    "Chỉ trả JSON đúng schema. Lời thoại viết bằng TIẾNG ANH tự nhiên, câu ngắn (giọng đọc máy), có dấu chấm câu để ngắt nhịp.",
    "Không dùng tên thương hiệu thật (không viết LEGO, Duplo...), không nhân vật có bản quyền.",
    "Ưu tiên dùng lại diễn viên có sẵn; chỉ tạo diễn viên mới (new_cast) khi truyện thật sự cần, tối đa 3, khác nhau rõ về dáng/tóc/màu.",
    "speaker của mỗi câu phải là id có sẵn hoặc id trong new_cast.",
    "Cấu trúc: dựng tình huống, leo thang có số liệu, cú lật, chốt bằng một câu 'Step N: ...'. Tổng 6–14 câu.",
    "\n# Series bible\n" + bibleText(paths),
  ].join("\n");
  const prompt = `Diễn viên có sẵn:\n${castSummary(paths)}\n\nKhông khí: ${input.mood ?? "Hài hước"}\nGóc nhìn của tác giả (phải lồng vào): ${input.viewpoint}\n\nTruyện / ý tưởng:\n${input.story}`;
  const { data } = await ai.json({ label: "phan_tich_truyen", system, prompt, schema: ScriptPlan });
  const known = new Set([...existing, ...data.new_cast.map((c) => c.id)]);
  const bad = data.lines.filter((l) => !known.has(l.speaker));
  if (bad.length) throw new HttpError(422, `AI dùng người nói không có thật: ${[...new Set(bad.map((b) => b.speaker))].join(", ")}. Bấm lại để thử lần nữa.`);
  // diễn viên mới -> kho riêng của tập
  const dir = paths.episodeCast(episode);
  const newCast: string[] = [];
  for (const c of data.new_cast) {
    if (existing.includes(c.id)) continue;
    const recipe = parseOrThrow(CastRecipe, {
      id: c.id, name: c.name, vibe: c.vibe, age: c.age, skin: c.skin,
      hair: { style: c.hair_style, color: c.hair_color },
      torso: { color: c.torso_color, print: c.torso_print, print_color: c.torso_color === "white" ? "black" : "white" },
      arms: c.torso_color, hands: c.skin, hips: c.legs_color, legs: c.legs_color,
      accessories: c.glasses === "none" ? [] : [c.glasses], face_details: c.face_details, default_expression: c.default_expression,
      voice: { sapi: c.voice === "female" ? "Microsoft Zira Desktop" : "Microsoft David Desktop", rate: 0, pitch_semitones: c.voice === "female" ? 1 : -1.5 },
    }, `Diễn viên ${c.id}`);
    await writeJsonAtomic(path.join(dir, `${c.id}.json`), CastRecipe, recipe);
    newCast.push(c.id);
  }
  const script = parseOrThrow(Script, {
    title: data.title, logline: data.logline, fps_world: 12, start_offset: 2.5, tail: 1.2,
    lines: data.lines.map((l, i) => ({ id: `L${i + 1}`, speaker: l.speaker, text: l.text.trim(), gap_before: i === 0 ? 0 : 0.35 })),
  }, "Kịch bản");
  await writeJsonAtomic(path.join(paths.projectDir(episode), "script.json"), Script, script);
  await writeJsonAtomic(path.join(paths.projectDir(episode), "raw_story.json"), z.object({ story: z.string(), mood: z.string().optional(), viewpoint: z.string().optional() }), input);
  return { script, newCast };
}
