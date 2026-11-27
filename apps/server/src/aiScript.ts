// Hàm dùng chung cho phòng biên kịch (aiWriting.ts): diễn viên mới, luật kênh, kiểm thoại bằng code, ghi script.json.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { CastRecipe, Script, parseOrThrow } from "@lse/shared";
import { castRecipeFiles } from "@lse/director/io";
import { writeJsonAtomic } from "./jsonStore";
import type { WorkspacePaths } from "./workspace";

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

export async function writeScriptFile(paths: WorkspacePaths, episode: string, data: { title: string; logline: string; lines: { speaker: string; text: string; beat?: string; block?: string }[] }) {
  const script = parseOrThrow(Script, {
    title: data.title, logline: data.logline, fps_world: 12, start_offset: 2.5, tail: 1.2,
    lines: data.lines.map((l, i) => ({ id: `L${i + 1}`, speaker: l.speaker, text: l.text.trim(), gap_before: i === 0 ? 0 : 0.35,
      ...(l.beat ? { beat: l.beat } : {}), ...(l.block ? { block: l.block } : {}) })),
  }, "Kịch bản");
  await writeJsonAtomic(path.join(paths.projectDir(episode), "script.json"), Script, script);
  return script;
}
