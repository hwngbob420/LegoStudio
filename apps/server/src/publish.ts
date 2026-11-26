// Xuất bản thêm: phụ đề đa ngôn ngữ (locales/<lang>.json, AI dịch) và Shorts dọc 1080x1920 từ cùng storyboard.
import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { SHORTS_MAX_SEC, makeShorts } from "@lse/director";
import { timingPath } from "@lse/director/io";
import { Project, Script, Storyboard, Timing } from "@lse/shared";
import type { TextAI } from "./ai/types";
import { readJson, writeJsonAtomic } from "./jsonStore";
import { HttpError, assertValidId, type WorkspacePaths } from "./workspace";

export const LANGS = { vi: "Tiếng Việt", en: "English", es: "Español", fr: "Français", ja: "日本語", ko: "한국어", zh: "中文" } as const;
export const Locale = z.object({
  lang: z.string(),
  lines: z.record(z.string(), z.string()),
  /** chữ trên thẻ theo thứ tự trong storyboard.ui */
  cues: z.array(z.object({ title: z.string().optional(), label: z.string().optional(), note: z.string().optional() })).default([]),
});
export type Locale = z.infer<typeof Locale>;

const localeFile = (paths: WorkspacePaths, id: string, lang: string) => path.join(paths.projectDir(id), "locales", `${lang}.json`);

export async function readLocale(paths: WorkspacePaths, id: string, lang: string): Promise<Locale> {
  assertValidId(id, "ID tập");
  if (!(lang in LANGS)) throw new HttpError(400, `Ngôn ngữ không hỗ trợ: ${lang}`);
  const f = localeFile(paths, id, lang);
  if (existsSync(f)) return readJson(f, Locale);
  // chưa có: khởi tạo từ bản gốc để người dùng sửa tay
  const script = await readJson(path.join(paths.projectDir(id), "script.json"), Script);
  const sb = await readJson(path.join(paths.projectDir(id), "storyboard.json"), Storyboard);
  return { lang, lines: Object.fromEntries(script.lines.map((l) => [l.id, l.text])), cues: sb.ui.map(cueText) };
}

const cueText = (c: Storyboard["ui"][number]) =>
  c.type === "step_badge" ? { title: c.title } : c.type === "part_callout" ? { label: c.label, note: c.note } : c.type === "brick_chart" ? { title: c.title } : {};

export async function saveLocale(paths: WorkspacePaths, id: string, body: unknown) {
  const loc = Locale.parse(body);
  if (!(loc.lang in LANGS)) throw new HttpError(400, `Ngôn ngữ không hỗ trợ: ${loc.lang}`);
  mkdirSync(path.dirname(localeFile(paths, id, loc.lang)), { recursive: true });
  return writeJsonAtomic(localeFile(paths, id, loc.lang), Locale, loc);
}

const TranslateOut = z.object({ lines: z.array(z.object({ id: z.string(), text: z.string() })), cues: z.array(z.object({ title: z.string().optional(), label: z.string().optional(), note: z.string().optional() })) });

/** AI dịch phụ đề + chữ trên thẻ (giữ giọng hài, câu ngắn, không thương hiệu). */
export async function translate(ai: TextAI, paths: WorkspacePaths, id: string, lang: string) {
  const base = await readLocale(paths, id, "en").catch(() => null);
  const script = await readJson(path.join(paths.projectDir(id), "script.json"), Script);
  const sb = await readJson(path.join(paths.projectDir(id), "storyboard.json"), Storyboard);
  const src = { lines: script.lines.map((l) => ({ id: l.id, text: l.text })), cues: sb.ui.map(cueText) };
  void base;
  const { data } = await ai.json({
    label: "dich_phu_de", schema: TranslateOut,
    system: `Bạn dịch phụ đề cho video hài ngắn sang ${LANGS[lang as keyof typeof LANGS]}. Giữ nguyên id, giữ nhịp hài, câu ngắn tự nhiên, không thêm tên thương hiệu. Chỉ trả JSON.`,
    prompt: JSON.stringify(src),
  });
  const loc: Locale = { lang, lines: Object.fromEntries(script.lines.map((l) => [l.id, data.lines.find((x) => x.id === l.id)?.text ?? l.text])),
    cues: src.cues.map((c, i) => ({ ...c, ...(data.cues[i] ?? {}) })) };
  return saveLocale(paths, id, loc);
}

/** Tạo tập Shorts dọc `<id>_shorts` từ tập gốc (dùng lại giọng + mốc giờ, không cần tạo giọng lại). */
export async function createShorts(paths: WorkspacePaths, id: string, now: string) {
  assertValidId(id, "ID tập");
  const src = paths.projectDir(id);
  const tp = timingPath(src);
  if (!existsSync(tp)) throw new HttpError(409, "Tập gốc chưa có giọng đọc. Tạo giọng trước.");
  const timing = await readJson(tp, Timing);
  if (timing.duration > SHORTS_MAX_SEC) throw new HttpError(422, `Shorts tối đa ${SHORTS_MAX_SEC} giây; tập này dài ${timing.duration.toFixed(1)} giây. Hãy làm một tập ngắn riêng cho Shorts.`);
  const sid = `${id}_shorts`.slice(0, 60);
  const dst = paths.projectDir(sid);
  mkdirSync(path.join(dst, "build"), { recursive: true });
  const sb = await readJson(path.join(src, "storyboard.json"), Storyboard);
  await writeJsonAtomic(path.join(dst, "storyboard.json"), Storyboard, makeShorts(sb, sid));
  cpSync(path.join(src, "script.json"), path.join(dst, "script.json"));
  cpSync(tp, path.join(dst, "build", "timing.json"));
  if (existsSync(path.join(src, "build", "audio"))) cpSync(path.join(src, "build", "audio"), path.join(dst, "build", "audio"), { recursive: true });
  if (existsSync(path.join(src, "assets"))) cpSync(path.join(src, "assets"), path.join(dst, "assets"), { recursive: true });
  const title = JSON.parse(readFileSync(path.join(src, "storyboard.json"), "utf8")).title;
  await writeJsonAtomic(path.join(dst, "project.json"), Project, { id: sid, title: `${title} (Shorts)`, created: now, settings: { quality: "final", chunk_sec: 60 } });
  return { id: sid };
}
