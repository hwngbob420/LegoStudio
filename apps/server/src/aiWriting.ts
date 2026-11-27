// Phòng biên kịch — một nút "Generate kịch bản": Claude (Claude Code + skill screenwriter) tự triển khai kịch bản từ tư liệu.
//   1. dàn ý (beat sheet; tập dài chia chương), Claude tự chấm BEAT_CHECKS và tự sửa trước khi trả; code kiểm lại những gì đo được
//   2. thoại viết theo từng phần (~40 câu/phần) trong CÙNG phiên Claude, mỗi phần tự chấm SCRIPT_CHECKS; code kiểm người nói,
//      đủ nhịp, đúng thứ tự, không thương hiệu -> sai thì gửi lại lỗi cho Claude sửa
//   3. ghi script.json + dàn ý + phiếu chấm; người dùng sửa dàn ý được và bấm viết lại thoại.
import { existsSync } from "node:fs";
import path from "node:path";
import { z, type ZodType } from "zod";
import {
  BEAT_CHECKS, BLOCK_TARGET_SEC, BeatSheet, blockId, CheckResult, CritiqueLog, POVS, SCRIPT_CHECKS, TONES, WritingInput, linesForDuration, passRate,
  type Beat,
} from "@lse/shared";
import type { TextAI } from "./ai/types";
import { ClaudeSession, type SessionOpts } from "./ai/claudeCode";
import { NewCast, castSummary, guideText, bibleText, knownCast, lineErrors, materializeCast, writeScriptFile } from "./aiScript";
import { readJson, writeJsonAtomic } from "./jsonStore";
import { listSources, sourcesForPrompt } from "./sources";
import { HttpError, assertValidId, type WorkspacePaths } from "./workspace";

type Check = z.infer<typeof CheckResult>;
const wdir = (paths: WorkspacePaths, ep: string) => path.join(paths.projectDir(ep), "writing");
export const WF = {
  input: (p: WorkspacePaths, ep: string) => path.join(wdir(p, ep), "input.json"),
  beats: (p: WorkspacePaths, ep: string) => path.join(wdir(p, ep), "beat_sheet.json"),
  beatLog: (p: WorkspacePaths, ep: string) => path.join(wdir(p, ep), "beat_critique.json"),
  scriptLog: (p: WorkspacePaths, ep: string) => path.join(wdir(p, ep), "script_critique.json"),
};

/** Số câu mỗi phần thoại (giữ câu trả lời của Claude vừa phải, tập 30 phút ~ 12 phần). */
export const CHUNK_LINES = 40;

// ---------------------------------------------------------------- phiên viết (Claude nhiều lượt, hoặc AI một lượt)
export interface WriterSession { ask<T>(label: string, task: string, schema: ZodType<T>, check?: (d: T) => string[]): Promise<T> }

/** Claude Code: lượt đầu gửi ngữ cảnh (tư liệu, luật), các lượt sau cùng phiên nên chỉ gửi việc. */
export function claudeWriter(context: string, opts: SessionOpts): WriterSession {
  const s = new ClaudeSession(opts);
  let first = true;
  return { ask: (label, task, schema, check) => { const p = first ? `${context}\n\n---\n\n${task}` : task; first = false; return s.ask(label, p, schema, check); } };
}

/** AI một lượt (Hộp thư Claude, test): mỗi lượt gửi kèm toàn bộ ngữ cảnh; sai thì gửi lại lỗi (tối đa 2 lần). */
export function statelessWriter(context: string, ai: TextAI, system: string): WriterSession {
  return {
    async ask(label, task, schema, check) {
      let feedback = "";
      for (let attempt = 0; ; attempt++) {
        const { data } = await ai.json({ label, system, schema, prompt: `${context}\n\n---\n\n${task}${feedback}` });
        const errs = check?.(data) ?? [];
        if (!errs.length) return data;
        if (attempt >= 2) throw new HttpError(422, `AI trả kết quả chưa đạt sau 3 lần (${label}): ${errs.slice(0, 3).join("; ")}`);
        feedback = `\n\nLần trước chưa đạt, hãy sửa:\n${errs.map((e) => `- ${e}`).join("\n")}`;
      }
    },
  };
}

// ---------------------------------------------------------------- ngữ cảnh + luật
export const WRITER_SYSTEM = "Bạn là biên kịch của kênh video hoạt hình mô hình gạch (minifig). Làm theo skill `screenwriter` của dự án. Chỉ trả JSON đúng khuôn.";

/** Khối ngữ cảnh gửi Claude ở lượt đầu: thông số người dùng chọn, luật kênh, diễn viên, tư liệu. */
export async function buildContext(paths: WorkspacePaths, ep: string, input: WritingInput): Promise<string> {
  const budget = linesForDuration(input.targetSec);
  const src = await sourcesForPrompt(paths, ep, input.sourceIds);
  const mins = input.targetSec >= 60 ? `${Math.round(input.targetSec / 60)} phút` : `${input.targetSec} giây`;
  return [
    "Dùng skill `screenwriter` của dự án (file .claude/skills/screenwriter/SKILL.md) để viết kịch bản cho một tập video từ tư liệu bên dưới.",
    "Thoại viết bằng TIẾNG ANH tự nhiên (phụ đề các thứ tiếng làm sau). Không tên thương hiệu thật (không viết LEGO, Duplo), không nhân vật có bản quyền.",
    "",
    "# Thông số người dùng chọn",
    `- Ngôi kể: ${POVS[input.pov].label} — ${POVS[input.pov].directive}`,
    `- Giọng văn: ${input.tones.map((t) => `${TONES[t].label} (${TONES[t].directive})`).join(" + ") || "theo series bible"}`,
    `- Độ dài: ${mins} -> khoảng ${budget.min}–${budget.max} câu thoại.`,
    input.message.trim() ? `- Thông điệp người xem cần mang về: ${input.message.trim()}` : "- Thông điệp: người dùng để trống -> tự rút MỘT thông điệp rõ ràng, đáng nhớ từ tư liệu.",
    input.notes.trim() ? `- Yêu cầu thêm của người dùng: ${input.notes.trim()}` : "",
    "",
    "# Diễn viên có sẵn (id: tên — tính cách)",
    castSummary(paths),
    "",
    "# Hướng dẫn biên kịch của kênh",
    guideText(paths),
    "",
    "# Series bible",
    bibleText(paths),
    "",
    "# Tư liệu",
    input.story.trim() ? `<outline_document name="dan_tay">\n${input.story}\n</outline_document>` : "",
    src.text,
    src.visionFiles.length ? `Tư liệu dạng ảnh chụp, đọc trực tiếp bằng công cụ Read: ${src.visionFiles.join(", ")}` : "",
  ].filter((l) => l !== "").join("\n");
}

const checklist = (c: Record<string, string>) => Object.entries(c).map(([id, q]) => `- ${id}: ${q}`).join("\n");
const checksSchema = (c: Record<string, string>) =>
  z.array(z.object({ id: z.enum(Object.keys(c) as [string, ...string[]]), pass: z.boolean(), reason: z.string().max(300) })).min(1).max(20);

export const BeatPlanOut = BeatSheet.omit({ approved: true }).extend({
  new_cast: z.array(NewCast).max(3).default([]),
  checks: checksSchema(BEAT_CHECKS),
  /** số vòng Claude đã tự sửa dàn ý trước khi trả */
  revisions: z.number().int().min(0).max(5).default(0),
});
type BeatPlanOut = z.infer<typeof BeatPlanOut>;

export const ChunkOut = z.object({
  lines: z.array(z.object({ beat: z.string().regex(/^B\d{1,3}$/), speaker: z.string(), text: z.string().min(1).max(220) })).min(1).max(CHUNK_LINES * 2 + 10),
  checks: checksSchema(SCRIPT_CHECKS),
  revisions: z.number().int().min(0).max(5).default(0),
});
type ChunkOut = z.infer<typeof ChunkOut>;

/** Kiểm dàn ý bằng code. */
export function beatErrors(d: BeatPlanOut, known: Set<string>, budget: { min: number; max: number }, pov: WritingInput["pov"]): string[] {
  const errs: string[] = [];
  const all = new Set([...known, ...d.new_cast.map((c) => c.id)]);
  const unknown = [...new Set([...d.cast, ...d.beats.flatMap((b) => b.speakers)].filter((c) => !all.has(c)))];
  if (unknown.length) errs.push(`Nhân vật không có trong kho hay new_cast: ${unknown.join(", ")}`);
  const ids = d.beats.map((b) => b.id);
  if (ids.some((id, i) => id !== `B${i + 1}`)) errs.push("id nhịp phải liên tục B1, B2, B3...");
  if (d.beats[0]?.kind !== "hook") errs.push("Nhịp đầu phải có kind = hook.");
  if (d.beats.at(-1)?.kind !== "button") errs.push("Nhịp cuối phải có kind = button.");
  const total = d.beats.reduce((a, b) => a + b.est_lines, 0);
  if (total < budget.min || total > Math.ceil(budget.max * 1.1)) errs.push(`Tổng est_lines = ${total}, phải trong ${budget.min}–${budget.max}.`);
  if ((pov === "second" || pov === "third") && !d.cast.includes("classic_yellow")) errs.push("Ngôi kể có người dẫn: cast phải có classic_yellow làm người dẫn.");
  return errs;
}

/** Kiểm một phần thoại bằng code. */
export function chunkErrors(d: ChunkOut, beats: Beat[], known: Set<string>): string[] {
  const ids = beats.map((b) => b.id);
  const errs = lineErrors(d.lines, known);
  const stray = [...new Set(d.lines.filter((l) => !ids.includes(l.beat)).map((l) => l.beat))];
  if (stray.length) errs.push(`Câu gắn nhịp không thuộc phần này: ${stray.join(", ")} (chỉ dùng ${ids.join(", ")}).`);
  const missing = ids.filter((id) => !d.lines.some((l) => l.beat === id));
  if (missing.length) errs.push(`Thiếu thoại cho nhịp ${missing.join(", ")}.`);
  const order = d.lines.map((l) => ids.indexOf(l.beat));
  if (order.some((v, i) => i > 0 && v < order[i - 1])) errs.push("Thoại phải đi đúng thứ tự nhịp.");
  const est = beats.reduce((a, b) => a + b.est_lines, 0);
  if (d.lines.length > est * 2 + 4) errs.push(`Quá nhiều câu (${d.lines.length}) so với dàn ý (~${est}).`);
  return errs;
}

/** Gom nhịp thành từng phần ~size câu (không cắt giữa nhịp). Phần cuối quá ngắn (< 35%) thì gộp vào phần trước. */
export function chunkBeats(beats: Beat[], size = CHUNK_LINES): Beat[][] {
  const out: Beat[][] = [];
  let cur: Beat[] = [], n = 0;
  for (const b of beats) {
    if (cur.length && n + b.est_lines > size) { out.push(cur); cur = []; n = 0; }
    cur.push(b); n += b.est_lines;
  }
  if (cur.length) out.push(cur);
  const est = (p: Beat[]) => p.reduce((a, b) => a + b.est_lines, 0);
  if (out.length > 1 && est(out[out.length - 1]) < size * 0.35 && est(out[out.length - 2]) + est(out[out.length - 1]) <= size * 1.35) {
    const last = out.pop()!;
    out[out.length - 1].push(...last);
  }
  return out;
}

/** Giây trung bình mỗi câu khi đọc bằng giọng máy, kể cả khoảng nghỉ (đo thật ep06: 241 s / 74 câu = 3,26 s). */
export const SPOKEN_SEC_PER_LINE = 3.4;

/** Số câu của một block ~2 phút. `targetSec` giữ để sau này chỉnh theo độ dài tập. */
export function blockLines(_targetSec?: number): number {
  return Math.max(10, Math.min(CHUNK_LINES, Math.round(BLOCK_TARGET_SEC / SPOKEN_SEC_PER_LINE)));
}

// ---------------------------------------------------------------- pipeline
export async function getWriting(paths: WorkspacePaths, ep: string) {
  assertValidId(ep, "ID tập");
  const rd = async <T,>(f: string, s: z.ZodType<T>) => (existsSync(f) ? readJson(f, s) : null);
  return {
    input: await rd(WF.input(paths, ep), WritingInput),
    beats: await rd(WF.beats(paths, ep), BeatSheet),
    beatCritique: await rd(WF.beatLog(paths, ep), CritiqueLog),
    scriptCritique: await rd(WF.scriptLog(paths, ep), CritiqueLog),
  };
}

/** Lưu thông tin người dùng điền (kiểm bắt buộc) trước khi chạy. */
export async function saveInput(paths: WorkspacePaths, ep: string, raw: unknown) {
  assertValidId(ep, "ID tập");
  const input = WritingInput.parse(raw ?? {});
  if (!input.story.trim() && !input.sourceIds.length) throw new HttpError(400, "Chưa có tư liệu: gửi file hoặc dán truyện trước khi bấm Generate.");
  const have = new Set((await listSources(paths, ep)).map((s) => s.id));
  const gone = input.sourceIds.filter((id) => !have.has(id));
  if (gone.length) throw new HttpError(404, `Tư liệu đã bị xóa: ${gone.join(", ")}.`);
  return writeJsonAtomic(WF.input(paths, ep), WritingInput, input);
}

/** Người dùng sửa dàn ý (rồi bấm viết lại thoại). */
export async function saveBeats(paths: WorkspacePaths, ep: string, body: unknown) {
  assertValidId(ep, "ID tập");
  const sheet = BeatSheet.parse(body);
  const known = new Set(knownCast(paths));
  const unknown = [...new Set([...sheet.cast, ...sheet.beats.flatMap((b) => b.speakers)].filter((c) => !known.has(c)))];
  if (unknown.length) throw new HttpError(400, `Nhân vật không có trong kho: ${unknown.join(", ")}.`);
  return writeJsonAtomic(WF.beats(paths, ep), BeatSheet, sheet);
}

export function beatTask(input: WritingInput) {
  const budget = linesForDuration(input.targetSec);
  const long = input.targetSec > 300;
  return [
    "## Việc 1: lập DÀN Ý (beat sheet), chưa viết thoại",
    "Đọc kỹ tư liệu. Lập dàn ý theo khung trong hướng dẫn biên kịch: nhịp đầu kind=hook, nhịp cuối kind=button, id liên tục B1, B2, ...",
    `Tổng est_lines của mọi nhịp phải nằm trong ${budget.min}–${budget.max}.`,
    long ? "Tập dài: chia 3–10 chương (ghi tên ở field chapter của mỗi nhịp); mỗi chương có móc riêng, leo thang và một lật nhỏ; nhịp 3–8 câu. Giữ một running gag xuyên tập." : "",
    "Ưu tiên diễn viên có sẵn; chỉ thêm new_cast khi tư liệu thật sự cần (tối đa 3). cast/speakers chỉ dùng id có sẵn hoặc trong new_cast.",
    "Sau khi lập xong, TỰ CHẤM theo danh sách dưới (ĐẠT/KHÔNG ĐẠT + một dòng lý do, khó tính thật), tự sửa tối đa 2 vòng, rồi mới trả bản cuối.",
    "Trả checks là kết quả chấm của BẢN CUỐI; revisions là số vòng đã sửa.",
    checklist(BEAT_CHECKS),
  ].filter(Boolean).join("\n");
}

export function chunkTask(part: Beat[], k: number, n: number, prev: { speaker: string; text: string }[], sheet: BeatSheet) {
  return [
    `## Việc 2 (block ${k}/${n}, khoảng 2 phút): viết THOẠI cho các nhịp ${part[0].id}–${part.at(-1)!.id}`,
    k === 1 ? `Dàn ý đầy đủ để nắm mạch (đã chốt):\n${JSON.stringify({ title: sheet.title, idea: sheet.idea, runner: sheet.runner, beats: sheet.beats.map((b) => ({ id: b.id, chapter: b.chapter, kind: b.kind, summary: b.summary })) })}` : "",
    `Các nhịp của phần này (viết đúng thứ tự, mỗi câu gắn beat, số câu mỗi nhịp xấp xỉ est_lines):\n${JSON.stringify(part)}`,
    prev.length ? `Các câu ngay trước phần này (nối mạch, không lặp lại):\n${prev.map((l) => `${l.speaker}: ${l.text}`).join("\n")}` : "",
    "Chỉ dùng người nói trong dàn ý. Punch đặt cuối câu. Câu ngắn nói được bằng giọng máy.",
    k === n ? "Đây là phần CUỐI: câu cuối cùng là câu chốt 'Step N: ...' của nhịp button, gọi lại running gag." : "",
    "Viết xong, TỰ CHẤM phần này theo danh sách dưới, tự sửa chỗ KHÔNG ĐẠT rồi mới trả. checks là kết quả của bản cuối.",
    checklist(SCRIPT_CHECKS),
  ].filter(Boolean).join("\n\n");
}

/**
 * Chạy phòng biên kịch. `from = "dialogue"`: giữ dàn ý hiện có (người dùng vừa sửa), chỉ viết lại thoại.
 * `log` nhận dòng tiến độ; dòng "[progress] write k/N" để hàng đợi việc nền vẽ thanh tiến độ.
 */
export async function generateScript(paths: WorkspacePaths, ep: string, session: WriterSession, opts: { from?: "beats" | "dialogue" } = {}, log: (l: string) => void = () => {}) {
  assertValidId(ep, "ID tập");
  if (!existsSync(WF.input(paths, ep))) throw new HttpError(409, "Chưa có thông tin tập (writing/input.json).");
  const input = await readJson(WF.input(paths, ep), WritingInput);
  const budget = linesForDuration(input.targetSec);
  let sheet: BeatSheet;
  const steps = (b: number) => 1 + b;
  if (opts.from === "dialogue") {
    if (!existsSync(WF.beats(paths, ep))) throw new HttpError(409, "Chưa có dàn ý để viết lại thoại.");
    sheet = await readJson(WF.beats(paths, ep), BeatSheet);
  } else {
    log("== beats ==");
    log("[progress] write 0/1");
    const known = new Set(knownCast(paths));
    const plan = await session.ask("lap_dan_y", beatTask(input), BeatPlanOut, (d) => beatErrors(d, known, budget, input.pov));
    await materializeCast(paths, ep, plan.new_cast);
    const { new_cast: _nc, checks, revisions, ...rest } = plan;
    sheet = await writeJsonAtomic(WF.beats(paths, ep), BeatSheet, { ...rest, approved: true });
    const codeChecks: Check[] = [{ id: "length_fit", pass: true, reason: `Tổng ${rest.beats.reduce((a, b) => a + b.est_lines, 0)} câu, trong khoảng ${budget.min}–${budget.max}.` }];
    const merged = [...checks.filter((c) => c.id !== "length_fit"), ...codeChecks];
    await writeJsonAtomic(WF.beatLog(paths, ep), CritiqueLog, { stage: "beats", rounds: [{ round: 1, pass_rate: passRate({ checks: merged, fixes: [] }), checks: merged, fixes: [], applied: revisions > 0 }] });
    log(`dàn ý: ${sheet.beats.length} nhịp, Claude tự sửa ${revisions} vòng`);
  }
  log("== dialogue ==");
  // mỗi phần thoại = một block ~2 phút (đơn vị duyệt, sửa, render ở bước sau)
  const parts = chunkBeats(sheet.beats, blockLines(input.targetSec));
  const known = new Set(knownCast(paths));
  const lines: { speaker: string; text: string; beat?: string; block?: string }[] = [];
  const rounds: CritiqueLog["rounds"] = [];
  for (let k = 0; k < parts.length; k++) {
    log(`[progress] write ${k + 1}/${steps(parts.length)}`);
    const out = await session.ask(`viet_thoai_${k + 1}`, chunkTask(parts[k], k + 1, parts.length, lines.slice(-4), sheet), ChunkOut, (d) => chunkErrors(d, parts[k], known));
    lines.push(...out.lines.map((l) => ({ speaker: l.speaker, text: l.text, beat: l.beat, block: blockId(k) })));
    rounds.push({ round: k + 1, label: parts.length > 1 ? `Block ${blockId(k)} (${parts[k][0].id}–${parts[k].at(-1)!.id})` : `Block ${blockId(k)}`, pass_rate: passRate({ checks: out.checks, fixes: [] }), checks: out.checks, fixes: [], applied: out.revisions > 0 });
    log(`thoại phần ${k + 1}/${parts.length}: ${out.lines.length} câu`);
  }
  const script = await writeScriptFile(paths, ep, { title: sheet.title, logline: sheet.logline, lines });
  await writeJsonAtomic(WF.scriptLog(paths, ep), CritiqueLog, { stage: "script", rounds });
  log(`[progress] write ${steps(parts.length)}/${steps(parts.length)}`);
  log(`xong: ${script.lines.length} câu thoại, ${sheet.beats.length} nhịp`);
  return { script, beats: sheet };
}

/** Đọc thông tin + dựng ngữ cảnh (cho script chạy nền). */
export async function contextFor(paths: WorkspacePaths, ep: string) {
  // tập làm trước khi có phòng biên kịch (không có writing/input.json): ngữ cảnh mặc định, tư liệu là chính kịch bản
  const input = existsSync(WF.input(paths, ep)) ? await readJson(WF.input(paths, ep), WritingInput) : WritingInput.parse({ story: "", targetSec: 300 });
  return buildContext(paths, ep, input);
}

