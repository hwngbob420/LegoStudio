// Phương án B — phòng biên kịch nhiều bước (chạy được bằng Gemini hoặc Hộp thư Claude):
//   1. lập dàn ý (beat sheet) từ outline/truyện  -> 2. phê bình đạt/không đạt + sửa (tối đa 2 vòng)
//   3. NGƯỜI DÙNG duyệt/sửa dàn ý                 -> 4. viết thoại theo dàn ý -> 5. phê bình + một lượt sửa có mục tiêu
// Nghiên cứu (DOC, CritiCS, TTCW): đầu tư vào dàn ý; phê bình bằng danh sách đạt/không đạt; người thật là cửa kiểm cuối.
import { existsSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { BEAT_CHECKS, BeatSheet, CheckResult, Critique, CritiqueLog, SCRIPT_CHECKS, linesForDuration, passRate } from "@lse/shared";
import type { TextAI } from "./ai/types";
import {
  NewCast, WritingInput, castSummary, gatherMaterial, knownCast, lineErrors, materializeCast, writeScriptFile, writerSystem,
} from "./aiScript";
import { readJson, writeJsonAtomic } from "./jsonStore";
import { HttpError, assertValidId, type WorkspacePaths } from "./workspace";

type Check = z.infer<typeof CheckResult>;
export const MAX_BEAT_ROUNDS = 2;

const wdir = (paths: WorkspacePaths, ep: string) => path.join(paths.projectDir(ep), "writing");
const F = {
  input: (p: WorkspacePaths, ep: string) => path.join(wdir(p, ep), "input.json"),
  beats: (p: WorkspacePaths, ep: string) => path.join(wdir(p, ep), "beat_sheet.json"),
  beatLog: (p: WorkspacePaths, ep: string) => path.join(wdir(p, ep), "beat_critique.json"),
  scriptLog: (p: WorkspacePaths, ep: string) => path.join(wdir(p, ep), "script_critique.json"),
};

/** Khuôn dàn ý AI trả về (dàn ý + diễn viên mới nếu cần). */
const BeatDraft = BeatSheet.omit({ approved: true }).extend({ new_cast: z.array(NewCast).max(3).default([]) });

/** Khuôn phiếu phê bình với đúng các mục kiểm được giao. */
const critiqueFor = (checks: Record<string, string>) => Critique.extend({
  checks: z.array(z.object({ id: z.enum(Object.keys(checks) as [string, ...string[]]), pass: z.boolean(), reason: z.string().max(300) })).min(1).max(20),
});

const checklistText = (checks: Record<string, string>) => Object.entries(checks).map(([id, q]) => `- ${id}: ${q}`).join("\n");

/** Mục kiểm do code tính (đè kết quả AI): đúng sự thật hơn để AI tự chấm. */
function codeBeatChecks(sheet: z.infer<typeof BeatDraft>, known: Set<string>, budget: { min: number; max: number }): Check[] {
  const total = sheet.beats.reduce((a, b) => a + b.est_lines, 0);
  const unknown = [...new Set([...sheet.cast, ...sheet.beats.flatMap((b) => b.speakers)].filter((c) => !known.has(c)))];
  const out: Check[] = [{ id: "length_fit", pass: total >= budget.min && total <= budget.max, reason: `Tổng est_lines = ${total}, cho phép ${budget.min}–${budget.max}.` }];
  if (unknown.length) out.push({ id: "cast_fit", pass: false, reason: `Nhân vật không có trong kho hay new_cast: ${unknown.join(", ")}.` });
  if (sheet.beats.at(-1)?.kind !== "button") out.push({ id: "button", pass: false, reason: "Nhịp cuối phải có kind = button (câu 'Step N: ...')." });
  return out;
}

const mergeChecks = (ai: Check[], code: Check[]) => {
  const m = new Map(ai.map((c) => [c.id, c]));
  for (const c of code) if (!c.pass || !m.has(c.id) || c.id === "length_fit") m.set(c.id, c);
  return [...m.values()];
};

export async function getWriting(paths: WorkspacePaths, ep: string) {
  assertValidId(ep, "ID tập");
  const rd = async <T,>(f: string, s: z.ZodType<T>) => (existsSync(f) ? readJson(f, s) : null);
  return {
    input: await rd(F.input(paths, ep), WritingInput),
    beats: await rd(F.beats(paths, ep), BeatSheet),
    beatCritique: await rd(F.beatLog(paths, ep), CritiqueLog),
    scriptCritique: await rd(F.scriptLog(paths, ep), CritiqueLog),
  };
}

/** Bước 1 + 2: lập dàn ý rồi tự phê bình/sửa tối đa MAX_BEAT_ROUNDS vòng. Kết quả chờ người dùng duyệt. */
export async function makeBeats(ai: TextAI, paths: WorkspacePaths, ep: string, raw: unknown) {
  const { input, material, budget, attach } = await gatherMaterial(paths, ep, raw);
  const cast = castSummary(paths);
  const system = [
    writerSystem(paths, "trưởng phòng biên kịch"),
    "Nhiệm vụ: lập DÀN Ý (beat sheet), chưa viết thoại. Mỗi nhịp: kind, tóm tắt, giá trị đổi, cú hài chính, ý tưởng thẻ chữ, người nói, số câu ước tính.",
    "Ưu tiên diễn viên có sẵn; chỉ thêm new_cast khi thật cần (tối đa 3). cast và speakers chỉ dùng id có sẵn hoặc id trong new_cast.",
    `Tổng est_lines phải nằm trong ${budget.min}–${budget.max}. Nhịp đầu kind = hook, nhịp cuối kind = button. id nhịp là B1, B2, ...`,
  ].join("\n");
  const first = await ai.json({ label: "lap_dan_y", system, schema: BeatDraft, prompt: `Diễn viên có sẵn:\n${cast}\n\n${material}`, ...attach });
  let draft = first.data;
  const log: CritiqueLog = { stage: "beats", rounds: [] };
  const critic = critiqueFor(BEAT_CHECKS);
  for (let round = 1; round <= MAX_BEAT_ROUNDS; round++) {
    const known = new Set([...knownCast(paths), ...draft.new_cast.map((c) => c.id)]);
    const crit = await ai.json({
      label: "phe_binh_dan_y", schema: critic,
      system: writerSystem(paths, "nhà phê bình kịch bản khó tính") + "\nChấm từng mục ĐẠT/KHÔNG ĐẠT kèm một dòng lý do; đề xuất tối đa 3 sửa đổi cụ thể, quan trọng nhất trước.",
      prompt: `Danh sách kiểm:\n${checklistText(BEAT_CHECKS)}\n\nKhoảng số câu cho phép: ${budget.min}–${budget.max}.\n\nTư liệu gốc:\n${material}\n\nDàn ý cần chấm:\n${JSON.stringify(draft, null, 1)}`,
    });
    const checks = mergeChecks(crit.data.checks, codeBeatChecks(draft, known, budget));
    const rate = passRate({ checks, fixes: [] });
    const needs = checks.some((c) => !c.pass);
    const entry = { round, pass_rate: rate, checks, fixes: crit.data.fixes, applied: false };
    log.rounds.push(entry);
    if (!needs) break;
    const fixes = [...checks.filter((c) => !c.pass).map((c) => `[${c.id}] ${c.reason}`), ...crit.data.fixes.map((f) => `[${f.target}] ${f.change}`)];
    const rev = await ai.json({
      label: "sua_dan_y", schema: BeatDraft, ...attach,
      system: system + "\nSửa dàn ý theo đúng các lỗi được nêu. Giữ nguyên những nhịp đã ổn.",
      prompt: `Diễn viên có sẵn:\n${cast}\n\n${material}\n\nDàn ý hiện tại:\n${JSON.stringify(draft, null, 1)}\n\nCần sửa:\n${fixes.join("\n")}`,
    });
    draft = rev.data;
    entry.applied = true;
  }
  const known = new Set([...knownCast(paths), ...draft.new_cast.map((c) => c.id)]);
  const bad = codeBeatChecks(draft, known, budget).find((c) => c.id === "cast_fit");
  if (bad) throw new HttpError(422, `${bad.reason} Bấm lại để thử lần nữa.`);
  const newCast = await materializeCast(paths, ep, draft.new_cast);
  const { new_cast: _nc, ...sheetOnly } = draft;
  const sheet = await writeJsonAtomic(F.beats(paths, ep), BeatSheet, { ...sheetOnly, approved: false });
  await writeJsonAtomic(F.beatLog(paths, ep), CritiqueLog, log);
  await writeJsonAtomic(F.input(paths, ep), WritingInput, input);
  return { beats: sheet, critique: log, newCast };
}

/** Bước 3: người dùng sửa/duyệt dàn ý. */
export async function saveBeats(paths: WorkspacePaths, ep: string, body: unknown) {
  assertValidId(ep, "ID tập");
  const sheet = BeatSheet.parse(body);
  const known = new Set(knownCast(paths));
  const unknown = [...new Set([...sheet.cast, ...sheet.beats.flatMap((b) => b.speakers)].filter((c) => !known.has(c)))];
  if (unknown.length) throw new HttpError(400, `Nhân vật không có trong kho: ${unknown.join(", ")}.`);
  return writeJsonAtomic(F.beats(paths, ep), BeatSheet, sheet);
}

/** Khuôn thoại theo nhịp. */
const draftSchema = (budget: { min: number; max: number }) => z.object({
  title: z.string().max(60),
  logline: z.string().max(200),
  lines: z.array(z.object({ beat: z.string().regex(/^B\d{1,2}$/), speaker: z.string(), text: z.string().min(2).max(160) })).min(budget.min).max(budget.max),
});
type Draft = z.infer<ReturnType<typeof draftSchema>>;

function codeScriptChecks(d: Draft, sheet: BeatSheet, known: Set<string>): Check[] {
  const missing = sheet.beats.filter((b) => !d.lines.some((l) => l.beat === b.id)).map((b) => b.id);
  const order = d.lines.map((l) => sheet.beats.findIndex((b) => b.id === l.beat));
  const inOrder = order.every((v, i) => i === 0 || v >= order[i - 1]);
  const errs = lineErrors(d.lines, known);
  const long = d.lines.filter((l) => l.text.split(/\s+/).length > 22).length;
  return [
    { id: "covers_beats", pass: !missing.length && inOrder, reason: missing.length ? `Thiếu thoại cho nhịp ${missing.join(", ")}.` : inOrder ? "Đủ nhịp, đúng thứ tự." : "Thoại nhảy ngược thứ tự nhịp." },
    { id: "natural_english", pass: !errs.some((e) => e.includes("thương hiệu")), reason: errs.find((e) => e.includes("thương hiệu")) ?? "Không có tên thương hiệu." },
    ...(errs.some((e) => e.startsWith("Người nói")) ? [{ id: "distinct_voices", pass: false, reason: errs.find((e) => e.startsWith("Người nói"))! }] : []),
    ...(long ? [{ id: "short_lines", pass: false, reason: `${long} câu dài quá 22 từ.` }] : []),
  ];
}

/** Bước 4 + 5: viết thoại từ dàn ý ĐÃ DUYỆT, phê bình, sửa một lượt có mục tiêu, ghi script.json. */
export async function writeFromBeats(ai: TextAI, paths: WorkspacePaths, ep: string) {
  assertValidId(ep, "ID tập");
  const w = await getWriting(paths, ep);
  if (!w.beats) throw new HttpError(409, "Chưa có dàn ý. Bấm \"Lập dàn ý\" trước.");
  if (!w.beats.approved) throw new HttpError(409, "Hãy đọc và bấm \"Duyệt dàn ý\" trước khi viết thoại.");
  const sheet = w.beats;
  const { material, attach } = await gatherMaterial(paths, ep, w.input ?? {});
  const budget = linesForDuration(w.input?.targetSec ?? 45);
  const total = sheet.beats.reduce((a, b) => a + b.est_lines, 0);
  const b2 = { min: 2, max: Math.max(budget.max, total + 4) };
  const schema = draftSchema(b2);
  const known = new Set(knownCast(paths));
  const cast = castSummary(paths);
  const system = [
    writerSystem(paths, "biên kịch thoại hài"),
    "Viết THOẠI theo đúng dàn ý đã duyệt: mỗi câu gắn id nhịp (beat), đi đúng thứ tự nhịp, số câu mỗi nhịp xấp xỉ est_lines.",
    "Chỉ dùng người nói trong dàn ý. Punch đặt cuối câu. Gài running gag sớm, gọi lại ở cuối. Câu cuối là câu 'Step N: ...' của nhịp button.",
  ].join("\n");
  const first = await ai.json({ label: "viet_thoai", system, schema, ...attach,
    prompt: `Diễn viên:\n${cast}\n\nDàn ý ĐÃ DUYỆT:\n${JSON.stringify(sheet, null, 1)}\n\n${material}` });
  let draft = first.data;
  const log: CritiqueLog = { stage: "script", rounds: [] };
  const critic = critiqueFor(SCRIPT_CHECKS);
  const crit = await ai.json({
    label: "phe_binh_kich_ban", schema: critic,
    system: writerSystem(paths, "biên tập viên hài khó tính") + "\nChấm từng mục ĐẠT/KHÔNG ĐẠT kèm một dòng lý do; đề xuất tối đa 3 sửa đổi cụ thể (ghi rõ nhịp/câu).",
    prompt: `Danh sách kiểm:\n${checklistText(SCRIPT_CHECKS)}\n\nDàn ý đã duyệt:\n${JSON.stringify(sheet, null, 1)}\n\nTư liệu gốc:\n${material}\n\nKịch bản cần chấm:\n${draft.lines.map((l, i) => `${i + 1}. [${l.beat}] ${l.speaker}: ${l.text}`).join("\n")}`,
  });
  const checks = mergeChecks(crit.data.checks, codeScriptChecks(draft, sheet, known));
  const entry = { round: 1, pass_rate: passRate({ checks, fixes: [] }), checks, fixes: crit.data.fixes, applied: false };
  log.rounds.push(entry);
  if (checks.some((c) => !c.pass)) {
    const fixes = [...checks.filter((c) => !c.pass).map((c) => `[${c.id}] ${c.reason}`), ...crit.data.fixes.map((f) => `[${f.target}] ${f.change}`)];
    const rev = await ai.json({ label: "sua_kich_ban", schema, ...attach,
      system: system + "\nSửa ĐÚNG những chỗ được nêu, giữ nguyên các câu đã ổn (nhất là các câu hài đã đạt).",
      prompt: `Dàn ý đã duyệt:\n${JSON.stringify(sheet, null, 1)}\n\nKịch bản hiện tại:\n${JSON.stringify(draft, null, 1)}\n\nCần sửa:\n${fixes.join("\n")}` });
    // chỉ nhận bản sửa nếu không làm hỏng các mục code kiểm được
    const after = codeScriptChecks(rev.data, sheet, known);
    if (after.filter((c) => !c.pass).length <= codeScriptChecks(draft, sheet, known).filter((c) => !c.pass).length) {
      draft = rev.data;
      entry.applied = true;
    }
  }
  const hard = lineErrors(draft.lines, known);
  if (hard.length) throw new HttpError(422, `${hard[0]}. Bấm lại để thử lần nữa.`);
  const script = await writeScriptFile(paths, ep, { title: draft.title || sheet.title, logline: draft.logline || sheet.logline, lines: draft.lines });
  await writeJsonAtomic(F.scriptLog(paths, ep), CritiqueLog, log);
  return { script, critique: log, lineBeats: draft.lines.map((l) => l.beat) };
}
