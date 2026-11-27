// Block ~2 phút (5B/5C): danh sách block cho tab Duyệt, nhận xét tự động, góp ý của người dùng, xem trước riêng từng block.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { sliceOverlay, sliceTimeline, type Issue, visualLint } from "@lse/director";
import {
  BLOCK_TARGET_SEC, BlockReview, CritiqueLog, Review, ReviewComment, SCRIPT_CHECKS, Script, assignBlocks, blockList, estimateLineSec,
  parseOrThrow, type BakedTimeline, type ReviewNote, type Storyboard, type Timing,
} from "@lse/shared";
import { readJson, writeJsonAtomic } from "./jsonStore";
import { check, readProject } from "./projects";
import { HttpError, assertValidId, type WorkspacePaths } from "./workspace";

const reviewFile = (paths: WorkspacePaths, id: string) => path.join(paths.projectDir(id), "review.json");

export async function readReview(paths: WorkspacePaths, id: string): Promise<Review> {
  assertValidId(id, "ID tập");
  const f = reviewFile(paths, id);
  return existsSync(f) ? readJson(f, Review) : Review.parse({});
}
const saveReview = (paths: WorkspacePaths, id: string, r: Review) => writeJsonAtomic(reviewFile(paths, id), Review, r);
const blockReview = (r: Review, bid: string) => (r.blocks[bid] ??= BlockReview.parse({}));

export interface BlockView {
  id: string;
  index: number;
  f0: number;
  f1: number;
  t0: number;
  t1: number;
  hash: string;
  lines: { id: string; speaker: string; text: string; beat?: string }[];
  shots: string[];
  notes: ReviewNote[];
  review: BlockReview;
  /** bản render cuối của block (5D): fresh = khớp nội dung hiện tại (chưa sửa gì từ lần render) */
  output?: { file: string; fresh: boolean };
}

/** Nhận xét tự động cho từng block: độ dài, lỗi bố cục (không che mặt...), đổi góc máy, phiếu chấm thoại của Claude. */
export function autoNotes(T: BakedTimeline, sb: Storyboard, issues: Issue[], blocks: { id: string; f0: number; f1: number; shots: string[] }[],
  critique: CritiqueLog | null, timing?: Timing | null): Record<string, ReviewNote[]> {
  const out: Record<string, ReviewNote[]> = {};
  const last = blocks.length - 1;
  blocks.forEach((b, i) => {
    const notes: ReviewNote[] = (out[b.id] = []);
    const sec = (b.f1 - b.f0 + 1) / T.fps;
    if (blocks.length > 1 && i < last && sec > BLOCK_TARGET_SEC * 1.3)
      notes.push({ id: `${b.id}_long`, source: "auto", kind: "timing", level: "warn", text: `Block dài ${fmt(sec)} (mục tiêu khoảng 2:00). Có thể tách hoặc cắt bớt thoại.` });
    if (blocks.length > 1 && i < last && sec < BLOCK_TARGET_SEC * 0.5)
      notes.push({ id: `${b.id}_short`, source: "auto", kind: "timing", level: "info", text: `Block ngắn ${fmt(sec)}.` });
    // gộp lỗi giống nhau ở nhiều cảnh thành một dòng ("... ở 5 cảnh: S3, S4, ...")
    const groups = new Map<string, { level: Issue["level"]; text: string; shots: string[] }>();
    for (const is of issues.filter((x) => b.shots.includes(x.shot))) {
      const key = `${is.level}|${is.code}|${is.message.replace(/^Cảnh \S+?( lúc [0-9.]+ s)?: /, "")}`;
      const g = groups.get(key) ?? { level: is.level, text: is.message.replace(/^Cảnh \S+?( lúc [0-9.]+ s)?: /, ""), shots: [] };
      if (!g.shots.includes(is.shot)) g.shots.push(is.shot);
      groups.set(key, g);
    }
    [...groups.values()].sort((x, y) => (x.level === y.level ? 0 : x.level === "error" ? -1 : 1)).forEach((g, k) => {
      const where = g.shots.length === 1 ? `Cảnh ${g.shots[0]}` : `${g.shots.length} cảnh (${g.shots.slice(0, 6).join(", ")}${g.shots.length > 6 ? ", ..." : ""})`;
      notes.push({ id: `${b.id}_v${k}`, source: "auto", kind: "visual", level: g.level, text: `${where}: ${g.text.charAt(0).toUpperCase()}${g.text.slice(1)}`, shot: g.shots[0] });
    });
    // Gđ 6: bộ lọc đơn điệu hình ảnh (cùng cỡ cảnh > 22 s, cùng bối cảnh + góc > 60 s, một kiểu máy > 1/2 số cảnh)
    if (timing) {
      const own = { ...sb, shots: sb.shots.filter((s) => b.shots.includes(s.id)) };
      if (own.shots.length) visualLint(own, timing).forEach((v, k) => notes.push({ id: `${b.id}_mono${k}`, source: "auto", kind: "visual",
        level: v.code === "low_variety" ? "info" : "warn", text: `Hình đơn điệu: ${v.message} Gợi ý: ${v.suggest}.`, shot: v.shots[0] }));
    } else {
      const presets = sb.shots.filter((s) => b.shots.includes(s.id)).map((s) => s.camera.preset);
      if (presets.length >= 6) {
        const top = Math.max(...Object.values(presets.reduce<Record<string, number>>((a, p) => ((a[p] = (a[p] ?? 0) + 1), a), {})));
        if (top / presets.length > 0.7) notes.push({ id: `${b.id}_var`, source: "auto", kind: "visual", level: "info", text: `${Math.round((100 * top) / presets.length)}% cảnh cùng một cỡ cảnh. Thêm cận mặt hoặc hai người cho đỡ đều.` });
      }
    }
    // phiếu chấm thoại của Claude cho block này (lúc viết)
    const round = critique?.rounds.find((r) => r.label?.startsWith(`Block ${b.id}`));
    for (const c of round?.checks.filter((x) => !x.pass) ?? [])
      notes.push({ id: `${b.id}_c_${c.id}`, source: "claude", kind: "content", level: "warn", text: `${SCRIPT_CHECKS[c.id] ?? c.id} Không đạt: ${c.reason}` });
    if (round && round.checks.every((x) => x.pass))
      notes.push({ id: `${b.id}_c_ok`, source: "claude", kind: "content", level: "info", text: `Claude tự chấm thoại block này: đạt ${round.checks.length}/${round.checks.length} mục.` });
  });
  return out;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** Danh sách block của tập (nướng + kiểm bố cục, không cần Blender). */
export async function listBlocks(paths: WorkspacePaths, id: string) {
  const st = await readProject(paths, id);
  if (!st.script) throw new HttpError(409, "Tập chưa có kịch bản.");
  const r = await check(paths, id, st.storyboard, st.timing);
  const review = await readReview(paths, id);
  const lines = st.script.lines;
  if (!r.timeline || !st.timing) {
    // chưa có giọng/storyboard: vẫn liệt kê block theo kịch bản để người dùng đọc thoại
    return { ready: false, reason: r.refErrors[0] ?? r.issues[0]?.message ?? "Chưa xem trước được.", blocks: blockList(lines).map((b, index) => ({
      id: b.id, index, f0: 0, f1: 0, t0: 0, t1: 0, hash: "", shots: [], notes: [],
      lines: b.lineIds.map((lid) => pickLine(lines, lid)), review: review.blocks[b.id] ?? BlockReview.parse({}),
    })) };
  }
  const T = r.timeline;
  const ranges = (T.blocks ?? [{ id: "b01", f0: 1, f1: T.frames, hash: "" }]).map((b) => ({
    ...b, shots: T.shots.filter((s) => s.f0 >= b.f0 && s.f0 <= b.f1).map((s) => s.id),
  }));
  const critFile = path.join(paths.projectDir(id), "writing", "script_critique.json");
  const crit = existsSync(critFile) ? CritiqueLog.safeParse(JSON.parse(readFileSync(critFile, "utf8"))) : null;
  const notes = autoNotes(T, st.storyboard, r.issues, ranges, crit?.success ? crit.data : null, st.timing);
  const byBlock = new Map(blockList(lines).map((b) => [b.id, b.lineIds]));
  const outFile = path.join(paths.projectDir(id), "build", "block_outputs.json");
  const outputs: { id: string; file: string; hash: string }[] = existsSync(outFile) ? JSON.parse(readFileSync(outFile, "utf8")) : [];
  const blocks: BlockView[] = ranges.map((b, index) => ({
    id: b.id, index, f0: b.f0, f1: b.f1, t0: round3((b.f0 - 1) / T.fps), t1: round3(b.f1 / T.fps), hash: b.hash,
    lines: (byBlock.get(b.id) ?? []).map((lid) => pickLine(lines, lid)), shots: b.shots,
    notes: [...notes[b.id] ?? [], ...(review.blocks[b.id]?.notes ?? []).filter((n) => n.source === "claude")],
    review: review.blocks[b.id] ?? BlockReview.parse({}),
    ...(() => {
      const o = outputs.find((x) => x.id === b.id && existsSync(path.join(paths.projectDir(id), x.file)));
      return o ? { output: { file: o.file, fresh: o.hash === b.hash } } : {};
    })(),
  }));
  return { ready: true, reason: "", duration: T.duration, blocks };
}

const round3 = (x: number) => Math.round(x * 1000) / 1000;
const pickLine = (lines: Script["lines"], lid: string) => {
  const l = lines.find((x) => x.id === lid)!;
  return { id: l.id, speaker: l.speaker, text: l.text, ...(l.beat ? { beat: l.beat } : {}) };
};

/** Dữ liệu Player cho một block: lát timeline + lớp chữ + giọng, mốc thời gian tính từ đầu block. */
export async function blockPreview(paths: WorkspacePaths, id: string, bid: string, full: { timeline: BakedTimeline; overlay: Parameters<typeof sliceOverlay>[0]; timing: Timing }) {
  const T = full.timeline;
  const b = T.blocks?.find((x) => x.id === bid);
  if (!b) throw new HttpError(404, `Không thấy block ${bid}.`);
  const t0 = (b.f0 - 1) / T.fps, t1 = b.f1 / T.fps;
  const voice = Object.fromEntries(Object.entries(full.timing.lines)
    .filter(([, L]) => L.end > t0 && L.start < t1)
    .map(([k, L]) => [k, { url: `/ws/projects/${id}/${L.wav}`, start: round3(L.wav_start - t0) }]));
  return { timeline: sliceTimeline(T, b.f0, b.f1), overlay: sliceOverlay(full.overlay, t0, t1), voice, block: { id: bid, t0, t1 } };
}

// ---------------------------------------------------------------- góp ý + trạng thái
export async function addComment(paths: WorkspacePaths, id: string, bid: string, body: unknown, now: string) {
  const r = await readReview(paths, id);
  const br = blockReview(r, bid);
  const next = 1 + Math.max(0, ...Object.values(r.blocks).flatMap((b) => b.comments.map((c) => Number(c.id.slice(1)))));
  const raw = (body ?? {}) as Record<string, unknown>;
  const c = parseOrThrow(ReviewComment, { ...raw, id: `c${next}`, created: now, resolved: false }, "Góp ý");
  br.comments.push(c);
  if (br.status === "approved") br.status = "needs_fix";
  else if (br.status === "draft") br.status = "needs_fix";
  await saveReview(paths, id, r);
  return c;
}

export async function updateComment(paths: WorkspacePaths, id: string, bid: string, cid: string, body: { resolved?: boolean; text?: string } | null, remove = false) {
  const r = await readReview(paths, id);
  const br = blockReview(r, bid);
  const i = br.comments.findIndex((c) => c.id === cid);
  if (i < 0) throw new HttpError(404, `Không thấy góp ý ${cid}.`);
  if (remove) br.comments.splice(i, 1);
  else br.comments[i] = parseOrThrow(ReviewComment, { ...br.comments[i], ...(body ?? {}) }, "Góp ý");
  if (!br.comments.some((c) => !c.resolved) && br.status === "needs_fix") br.status = "draft";
  await saveReview(paths, id, r);
  return br;
}

export async function setBlockStatus(paths: WorkspacePaths, id: string, bid: string, status: unknown) {
  const r = await readReview(paths, id);
  const br = blockReview(r, bid);
  br.status = BlockReview.shape.status.parse(status);
  await saveReview(paths, id, r);
  return br;
}

/** Ghi kết quả một lần Claude sửa block: đánh dấu góp ý đã xử lý, lưu tóm tắt, đưa block về "chờ duyệt". */
export async function recordFix(paths: WorkspacePaths, id: string, bid: string, done: string[], summary: string, notes: ReviewNote[], now: string) {
  const r = await readReview(paths, id);
  const br = blockReview(r, bid);
  for (const c of br.comments) if (done.includes(c.id)) { c.resolved = true; c.resolved_by = now; }
  br.history.push({ at: now, summary });
  br.notes = notes;
  br.status = br.comments.some((c) => !c.resolved) ? "needs_fix" : "draft";
  await saveReview(paths, id, r);
}

/** Tập cũ chưa chia block: gán block theo thời lượng thật (timing) hoặc ước lượng. Sau đó phải tạo giọng lại để đầu block khớp lưới. */
export async function splitBlocks(paths: WorkspacePaths, id: string, timing: Timing | null) {
  assertValidId(id, "ID tập");
  const f = path.join(paths.projectDir(id), "script.json");
  const sc = await readJson(f, Script);
  const dur = (l: Script["lines"][number]) => {
    const L = timing?.lines[l.id];
    return L ? L.end - L.start + (l.gap_before ?? 0.3) : estimateLineSec(l.text);
  };
  const ids = assignBlocks(sc.lines, dur);
  const next = parseOrThrow(Script, { ...sc, lines: sc.lines.map((l, i) => ({ ...l, block: ids[i] })) }, "Kịch bản");
  await writeJsonAtomic(f, Script, next);
  return { blocks: blockList(next.lines).map((b) => ({ id: b.id, lines: b.lineIds.length })) };
}
