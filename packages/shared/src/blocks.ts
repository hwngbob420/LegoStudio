// Block ~2 phút: đơn vị viết, duyệt, sửa và render của tập dài (5B).
// Mỗi câu thoại mang `block` (b01, b02...). Ranh giới block chỉ nằm giữa hai câu, và câu đầu của block mới được dời tới
// lưới 0,25 giây (= 3 khung ở 12 hình/giây, biểu diễn chính xác ở mili-giây) để nội dung block không phụ thuộc block trước:
// sửa block 1 làm block 2 trượt đúng một số nguyên khung -> lát timeline của block 2 giữ nguyên mã băm, không phải render lại.
import { z } from "zod";

export const BLOCK_TARGET_SEC = 120;
/** Lưới đặt đầu block (giây). 0,25 s = 3 khung thế giới, chính xác khi làm tròn mili-giây. */
export const BLOCK_GRID = 0.25;
/** Khoảng từ mốc lưới tới đầu câu đầu tiên của block (chỗ cho cảnh mở của block). */
export const BLOCK_LEAD = 0.5;
export const BLOCK_ID_RX = /^b\d{2,3}$/;
export const BlockId = z.string().regex(BLOCK_ID_RX, "Mã block dạng b01");

export const blockId = (i: number) => `b${String(i + 1).padStart(2, "0")}`;

/** Ước lượng thời lượng một câu khi chưa có giọng (giây): ~2,6 từ/giây + khoảng nghỉ. */
export function estimateLineSec(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1.2, words / 2.6) + 0.35;
}

/** Thời điểm bắt đầu câu đầu của block mới: dời lên tới mốc lưới + BLOCK_LEAD (không bao giờ sớm hơn `t`). */
export function snapBlockStart(t: number): number {
  const g = Math.ceil((t - BLOCK_LEAD) / BLOCK_GRID - 1e-9) * BLOCK_GRID;
  return Math.round((g + BLOCK_LEAD) * 1000) / 1000;
}

interface LineLike { id: string; text: string; block?: string; beat?: string }

/**
 * Chia câu thành block ~target giây. Ưu tiên cắt ở chỗ đổi nhịp (beat) khi block đã đủ 80% độ dài, bắt buộc cắt
 * trước khi vượt 115%. Block cuối quá ngắn (< 35%) thì gộp vào block trước nếu tổng không quá 135%.
 * `dur(line)` = thời lượng câu (từ timing nếu có, không thì ước lượng).
 */
export function assignBlocks<T extends LineLike>(lines: T[], dur: (l: T) => number, target = BLOCK_TARGET_SEC): string[] {
  if (!lines.length) return [];
  const groups: number[][] = [[]];
  let acc = 0;
  lines.forEach((l, i) => {
    const d = dur(l);
    const cur = groups[groups.length - 1];
    const beatChange = i > 0 && (l.beat ?? "") !== (lines[i - 1].beat ?? "");
    if (cur.length && ((acc >= target * 0.8 && beatChange) || acc + d > target * 1.15)) {
      groups.push([]);
      acc = 0;
    }
    groups[groups.length - 1].push(i);
    acc += d;
  });
  if (groups.length > 1) {
    const sum = (g: number[]) => g.reduce((a, i) => a + dur(lines[i]), 0);
    const last = groups[groups.length - 1], prev = groups[groups.length - 2];
    if (sum(last) < target * 0.35 && sum(prev) + sum(last) <= target * 1.35) { prev.push(...last); groups.pop(); }
  }
  const out = new Array<string>(lines.length);
  groups.forEach((g, k) => g.forEach((i) => { out[i] = blockId(k); }));
  return out;
}

export interface BlockInfo { id: string; lineIds: string[] }

/** Danh sách block theo thứ tự xuất hiện. Câu chưa có `block` theo block của câu trước (câu đầu: b01). */
export function blockList(lines: LineLike[]): BlockInfo[] {
  const out: BlockInfo[] = [];
  let cur = "b01";
  for (const l of lines) {
    if (l.block) cur = l.block;
    const last = out[out.length - 1];
    if (last && last.id === cur) last.lineIds.push(l.id);
    else out.push({ id: cur, lineIds: [l.id] });
  }
  return out;
}

/** Lỗi cấu trúc block: một block phải là một dải câu liền nhau. */
export function blockErrors(lines: LineLike[]): string[] {
  const seen = new Set<string>();
  const errs: string[] = [];
  for (const b of blockList(lines)) {
    if (seen.has(b.id)) errs.push(`Block ${b.id} bị tách làm nhiều đoạn không liền nhau.`);
    seen.add(b.id);
  }
  return errs;
}

// ---------------------------------------------------------------- bảng duyệt (review.json)
export const REVIEW_STATUS = ["draft", "needs_fix", "fixing", "approved"] as const;
export const ReviewNote = z.object({
  id: z.string(),
  source: z.enum(["auto", "claude"]),
  kind: z.enum(["content", "visual", "timing"]),
  level: z.enum(["error", "warn", "info"]),
  text: z.string(),
  line: z.string().optional(),
  shot: z.string().optional(),
});
export type ReviewNote = z.infer<typeof ReviewNote>;
export const ReviewComment = z.object({
  id: z.string().regex(/^c\d+$/),
  text: z.string().min(1).max(2000),
  /** neo theo ID câu/cảnh, không theo giây (giây đổi sau khi khớp giờ lại) */
  line: z.string().optional(),
  shot: z.string().optional(),
  kind: z.enum(["content", "visual", "any"]).default("any"),
  created: z.string(),
  resolved: z.boolean().default(false),
  /** lần sửa đã xử lý góp ý này */
  resolved_by: z.string().optional(),
});
export type ReviewComment = z.infer<typeof ReviewComment>;
export const BlockReview = z.object({
  status: z.enum(REVIEW_STATUS).default("draft"),
  comments: z.array(ReviewComment).default([]),
  /** nhận xét tự động gần nhất (code + Claude), làm mới sau mỗi lần dựng block */
  notes: z.array(ReviewNote).default([]),
  /** lịch sử sửa: tóm tắt từng lần Claude sửa block */
  history: z.array(z.object({ at: z.string(), summary: z.string() })).default([]),
});
export type BlockReview = z.infer<typeof BlockReview>;
export const Review = z.object({
  version: z.literal(1).default(1),
  blocks: z.record(z.string(), BlockReview).default({}),
});
export type Review = z.infer<typeof Review>;
