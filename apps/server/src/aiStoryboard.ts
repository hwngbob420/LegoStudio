// AI đạo diễn: kịch bản + mốc giờ -> nhịp (beats) theo lô -> compose -> kiểm (schema, ID, không che mặt) -> tự gửi lại sửa (tối đa 2 lần).
// Không có AI (chưa có khóa) -> đạo diễn tự động theo luật, vẫn ra storyboard xem được ngay.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { ACTIONS, BeatSheet, Catalog, EXPRESSIONS, FX_KINDS, Script, Storyboard, Timing, parseOrThrow, storyboardRefErrors } from "@lse/shared";
import { BeatPlan, autoFix, autoPlan, bake, compose, overlayProps, validateLayout, type Beat } from "@lse/director";
import { loadLibrary, timingPath } from "@lse/director/io";
import { AiError, type TextAI } from "./ai/types";
import { bibleText } from "./aiScript";
import { readJson, writeJsonAtomic } from "./jsonStore";
import { HttpError, assertValidId, type WorkspacePaths } from "./workspace";

const BATCH = 8;

async function load(paths: WorkspacePaths, id: string) {
  assertValidId(id, "ID tập");
  const dir = paths.projectDir(id);
  const script = await readJson(path.join(dir, "script.json"), Script);
  const tp = timingPath(dir);
  if (!existsSync(tp)) throw new HttpError(409, "Chưa có giọng đọc. Sang tab Giọng đọc bấm \"Tạo giọng\" trước (AI đạo diễn cần mốc giờ từng từ).");
  const timing = await readJson(tp, Timing);
  for (const L of script.lines) if (!timing.lines[L.id] || timing.lines[L.id].text !== L.text)
    throw new HttpError(409, `Câu ${L.id} đã đổi sau khi tạo giọng. Bấm "Tạo giọng" lại để mốc giờ khớp kịch bản.`);
  const cat = await readJson(path.join(paths.library, "catalog.json"), Catalog);
  const lib = loadLibrary(paths.library);
  const sets = Object.fromEntries(Object.entries(cat.sets).map(([k, v]) => [k, { anchors: v.anchors, lighting: v.lighting }]));
  return { dir, script, timing, cat, lib, sets };
}

function evaluate(sb: Storyboard, ctx: Awaited<ReturnType<typeof load>>, episodeCast: string[]) {
  const cat = structuredClone(ctx.cat);
  for (const c of episodeCast) cat.cast[c] ??= { name: c, vibe: "", default_expr: "innocent_dot" };
  const refs = storyboardRefErrors(sb, cat);
  if (refs.length) return { errors: refs, issues: [] as ReturnType<typeof validateLayout> };
  const T = bake({ storyboard: sb, timing: ctx.timing, ...ctx.lib });
  const issues = validateLayout(T, sb, overlayProps(sb, ctx.timing, {}));
  return { errors: issues.filter((i) => i.level === "error").map((i) => i.message), issues };
}

function systemPrompt(paths: WorkspacePaths, ctx: Awaited<ReturnType<typeof load>>) {
  return [
    "Bạn là đạo diễn hình ảnh của kênh video giải thích hài phong cách mô hình gạch dừng hình. Chỉ trả JSON đúng schema.",
    "Mỗi câu thoại (line) là một beat. Chọn shot: mcu (trung cận người nói), ecu (cận mặt, cho câu sốc/cú lật), two_shot (cả hai, cho phản ứng), wide_establish (toàn cảnh, ít dùng).",
    "Biểu cảm dựng cung cảm xúc (ví dụ deadpan_tired -> shocked_wide -> smug_smirk); punch.word là số thứ tự từ (bắt đầu từ 1) nơi biểu cảm đổi.",
    "listener_expr: biểu cảm phản ứng của người nghe. action chỉ chọn trong danh sách. fx tối đa 1 mỗi beat, dùng tiết kiệm.",
    "ui: tối đa một thẻ cho mỗi 2–3 câu: part_callout (đếm đồ vật, ví dụ 3 cốc cà phê) hoặc brick_chart (2–4 cột số liệu, collapse_last cho cú lật). Còn lại type none.",
    "Code sẽ tự đặt thẻ chữ ở 1/3 đối diện người nói và tự lo mốc giờ; bạn KHÔNG viết toạ độ hay thời gian.",
    "Không dùng tên thương hiệu thật trong chữ hiển thị.",
    `Bộ set: ${Object.entries(ctx.cat.sets).map(([k, v]) => `${k} (${(v as { notes?: string }).notes ?? ""})`).join("; ")}`,
    `Động tác: ${ACTIONS.join(", ")}. Biểu cảm: ${EXPRESSIONS.join(", ")}. Hiệu ứng: ${FX_KINDS.join(", ")}.`,
    "\n# Series bible\n" + bibleText(paths),
  ].join("\n");
}

const BatchOut = z.object({ set: z.string(), beats: z.array(z.object({ line: z.string() }).passthrough()), ending: z.object({ step: z.string(), title: z.string() }) });

export async function aiStoryboard(ai: TextAI | null, paths: WorkspacePaths, id: string, opts: { mode?: "ai" | "auto"; note?: string; set?: string } = {}) {
  const ctx = await load(paths, id);
  const episodeCast = existsSync(paths.episodeCast(id)) ? (await import("node:fs")).readdirSync(paths.episodeCast(id)).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)) : [];
  const composeCtx = { episode: id, script: ctx.script, timing: ctx.timing, sets: ctx.sets, defaultExpr: { ...ctx.lib.defaultExpr } };
  let source: "ai" | "auto" = "auto";
  let note = "";
  let plan: BeatPlan = autoPlan(ctx.script, opts.set && ctx.sets[opts.set] ? opts.set : "Set_BrickCreatorDesk", ctx.lib.defaultExpr);
  if (opts.mode !== "auto" && ai) {
    try {
      const lines = ctx.script.lines;
      const beats: Beat[] = [];
      // dàn ý đã duyệt ở phòng biên kịch: gợi ý thẻ chữ/biểu đồ theo nhịp
      const bsFile = path.join(paths.projectDir(id), "writing", "beat_sheet.json");
      const bs = existsSync(bsFile) ? BeatSheet.safeParse(JSON.parse(readFileSync(bsFile, "utf8"))) : null;
      const beatHints = bs?.success && bs.data.approved
        ? `Dàn ý đã duyệt (ý tưởng thẻ chữ theo nhịp, dùng làm gợi ý cho ui): ${bs.data.beats.map((b) => `${b.id} ${b.kind}: ${b.on_screen || b.summary}`).join(" | ")}`
        : "";
      let set = "", ending = { step: "02", title: "Your turn" }, prevSummary = "";
      for (let i = 0; i < lines.length; i += BATCH) {
        const chunk = lines.slice(i, i + BATCH);
        let feedback = "";
        for (let attempt = 0; attempt < 3; attempt++) {
          const prompt = [
            `Tập: ${ctx.script.title}. Lô ${i / BATCH + 1}/${Math.ceil(lines.length / BATCH)}.`,
            prevSummary ? `Tóm tắt các cảnh trước: ${prevSummary}` : "",
            beatHints,
            set ? `Bộ set đã chọn: ${set} (giữ nguyên).` : "Chọn MỘT bộ set hợp truyện.",
            "Các câu (id | người nói | số từ | lời):",
            ...chunk.map((l) => `${l.id} | ${l.speaker} | ${ctx.timing.lines[l.id].words.length} | ${l.text}`),
            opts.note ? `Ghi chú của đạo diễn: ${opts.note}` : "",
            feedback ? `Lần trước bị lỗi, hãy sửa: ${feedback}` : "",
          ].filter(Boolean).join("\n");
          const { data } = await ai.json({ label: "dao_dien", system: systemPrompt(paths, ctx), prompt, schema: BeatPlan, tier: "strong" });
          const got = data.beats.filter((b) => chunk.some((l) => l.id === b.line));
          const missing = chunk.filter((l) => !got.some((b) => b.line === l.id)).map((l) => l.id);
          if (missing.length && attempt < 2) { feedback = `Thiếu beat cho: ${missing.join(", ")}.`; continue; }
          // câu bị thiếu: dùng beat tự động
          const auto = autoPlan(ctx.script, data.set, ctx.lib.defaultExpr).beats;
          beats.push(...chunk.map((l) => got.find((b) => b.line === l.id) ?? auto.find((b) => b.line === l.id)!));
          set ||= data.set;
          ending = data.ending;
          prevSummary = (prevSummary + " " + got.map((b) => b.summary ?? "").join(" ")).slice(-400);
          // kiểm thử lô này bằng compose tạm
          const trial = compose({ set, beats: [...beats], ending }, composeCtx);
          const ev = evaluate(trial, ctx, episodeCast);
          if (ev.errors.length && attempt < 2) { beats.splice(beats.length - chunk.length, chunk.length); feedback = ev.errors.slice(0, 5).join(" "); continue; }
          break;
        }
      }
      plan = { set, beats, ending };
      source = "ai";
    } catch (e) {
      if (!(e instanceof AiError)) throw e;
      note = `Không gọi được AI (${e.message.slice(0, 160)}). Đã dùng đạo diễn tự động theo luật.`;
    }
  } else if (!ai) note = "Chưa cấu hình AI: đã dùng đạo diễn tự động theo luật (xem trước được ngay; thêm khóa AI trong .env để đạo diễn sáng tạo hơn).";
  // tự sửa bố cục: lật bên chủ thể -> cận thành trung cận -> bỏ thẻ chữ ở cảnh còn che mặt
  const fixed = autoFix(plan, composeCtx, ctx.lib);
  plan = fixed.plan;
  const sb = parseOrThrow(Storyboard, fixed.storyboard, "Storyboard");
  const ev = evaluate(sb, ctx, episodeCast);
  if (JSON.stringify(fixed.plan) !== JSON.stringify(plan)) note += " Đã tự sửa bố cục.";
  await writeJsonAtomic(path.join(ctx.dir, "storyboard.json"), Storyboard, sb);
  await writeJsonAtomic(path.join(ctx.dir, "beats.json"), BeatPlan, plan);
  return { storyboard: sb, issues: ev.issues, source, note: note.trim() };
}

/** "AI viết lại riêng cảnh này": làm lại nhịp của các câu trong một cảnh, giữ nguyên các cảnh khác (kể cả chỗ đã sửa tay). */
export async function rewriteShot(ai: TextAI | null, paths: WorkspacePaths, id: string, shotId: string, note: string) {
  const ctx = await load(paths, id);
  const bp = path.join(ctx.dir, "beats.json");
  if (!existsSync(bp)) throw new HttpError(409, "Tập này chưa có storyboard do AI dựng. Bấm \"AI tạo Storyboard\" trước.");
  const plan = parseOrThrow(BeatPlan, JSON.parse(readFileSync(bp, "utf8")), "beats.json");
  const old = await readJson(path.join(ctx.dir, "storyboard.json"), Storyboard);
  const idx = old.shots.findIndex((s) => s.id === shotId);
  if (idx < 1) throw new HttpError(400, "Chọn một cảnh thoại (không phải cảnh lắp ráp mở đầu).");
  const startLine = String(old.shots[idx].t0).split(".")[0];
  const endLine = idx + 1 < old.shots.length ? String(old.shots[idx + 1].t0).split(".")[0] : null;
  const ids = ctx.script.lines.map((l) => l.id);
  const lines = ids.slice(ids.indexOf(startLine === "L1" ? "L1" : startLine), endLine ? ids.indexOf(endLine) : ids.length);
  let fresh: Beat[];
  if (ai) {
    const { data } = await ai.json({ label: "dao_dien_canh", system: systemPrompt(paths, ctx), tier: "strong", schema: BeatPlan,
      prompt: `Làm lại riêng cảnh này (bộ set ${plan.set}), sáng tạo hơn: ${note || "đổi góc máy, biểu cảm, động tác"}\n` +
        lines.map((l) => { const L = ctx.script.lines.find((x) => x.id === l)!; return `${l} | ${L.speaker} | ${ctx.timing.lines[l].words.length} | ${L.text}`; }).join("\n") });
    fresh = lines.map((l) => data.beats.find((b) => b.line === l) ?? plan.beats.find((b) => b.line === l)!);
  } else {
    fresh = plan.beats.filter((b) => lines.includes(b.line)).map((b) => ({ ...b, shot: b.shot === "mcu" ? "ecu" as const : "mcu" as const }));
  }
  const next: BeatPlan = { ...plan, beats: plan.beats.map((b) => fresh.find((f) => f.line === b.line) ?? b) };
  const composed = compose(next, { episode: id, script: ctx.script, timing: ctx.timing, sets: ctx.sets, defaultExpr: ctx.lib.defaultExpr });
  // giữ nguyên các cảnh khác như đang có (kể cả sửa tay); chỉ thay cảnh của các câu vừa làm lại
  const replaced = composed.shots.filter((s) => lines.some((l) => String(s.t0).startsWith(`${l}.`)) || (startLine === "L1" && String(s.t0).startsWith("L1.")));
  const shots = [...old.shots.slice(0, idx), ...replaced.map((s, k) => ({ ...s, id: k === 0 ? shotId : `${shotId}${String.fromCharCode(97 + k)}` })), ...old.shots.slice(idx + 1)];
  const sb = parseOrThrow(Storyboard, { ...old, shots }, "Storyboard");
  await writeJsonAtomic(path.join(ctx.dir, "storyboard.json"), Storyboard, sb);
  await writeJsonAtomic(bp, BeatPlan, next);
  return { storyboard: sb };
}
