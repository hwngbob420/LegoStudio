// Phòng biên kịch: tư liệu người dùng gửi (sources/), dàn ý (beat sheet), phiếu phê bình đạt/không đạt, giới hạn số câu theo độ dài.
import { z } from "zod";

/** Đuôi file tư liệu được nhận. */
export const SOURCE_EXTS = ["docx", "pdf", "md", "txt", "fountain"] as const;
export type SourceExt = (typeof SOURCE_EXTS)[number];

export const SourceEntry = z.object({
  id: z.string().regex(/^src_[a-f0-9]{10}$/),
  /** tên file gốc, CHỈ để hiển thị (không bao giờ dùng làm đường dẫn) */
  name: z.string().max(200),
  ext: z.enum(SOURCE_EXTS),
  bytes: z.number().int().nonnegative(),
  chars: z.number().int().nonnegative(),
  /** PDF ảnh chụp, gần như không có chữ: cần Claude đọc bằng mắt (file gốc) */
  needs_vision: z.boolean().default(false),
  added: z.string(),
});
export type SourceEntry = z.infer<typeof SourceEntry>;
export const SourceIndex = z.object({ sources: z.array(SourceEntry).default([]) });
export type SourceIndex = z.infer<typeof SourceIndex>;

/** Độ dài mục tiêu (giây) người dùng chọn được. */
export const TARGET_SECONDS = [20, 45, 60, 90, 120, 180, 300] as const;

/**
 * Số câu thoại hợp lý cho một độ dài video. Đo từ tập thật: ep02 52 câu / 190 s (3,6 s/câu), showcase 6 câu / 19,5 s
 * (có cảnh lắp ráp mở đầu). Câu ngắn kiểu deadpan nên lấy 3,2 s/câu cho trần, 5,5 s/câu cho sàn.
 */
export function linesForDuration(targetSec: number): { min: number; max: number } {
  const t = Math.max(10, Math.min(600, targetSec));
  return { min: Math.max(2, Math.round(t / 5.5)), max: Math.max(6, Math.min(90, Math.round(t / 3.2))) };
}

const ID = z.string().regex(/^[a-z][a-z0-9_]{2,30}$/);

/** Một nhịp trong dàn ý. Không có thời gian hay toạ độ: code tự lo. */
export const Beat = z.object({
  id: z.string().regex(/^B\d{1,2}$/),
  /** vai trò nhịp: hook, setup, escalation, twist, payoff, button... */
  kind: z.enum(["hook", "setup", "escalation", "complication", "twist", "payoff", "button"]),
  summary: z.string().min(4).max(400),
  /** giá trị đổi trong nhịp (McKee): "tự tin -> hoảng" */
  value_shift: z.string().max(120),
  /** cú hài chính của nhịp (setup -> punch) */
  joke: z.string().max(240).default(""),
  /** ý tưởng thẻ chữ/biểu đồ trên màn hình (STEP, biểu đồ gạch, chú thích) */
  on_screen: z.string().max(160).default(""),
  speakers: z.array(ID).min(1).max(4),
  est_lines: z.number().int().min(1).max(20),
});
export type Beat = z.infer<typeof Beat>;

export const BeatSheet = z.object({
  title: z.string().min(2).max(60),
  logline: z.string().min(4).max(200),
  /** ý thật duy nhất mà tập giải thích */
  idea: z.string().min(4).max(240),
  /** góc nhìn của tác giả, lồng vào cú lật/kết */
  viewpoint: z.string().max(240),
  /** running gag hoặc callback xuyên tập */
  runner: z.string().max(200).default(""),
  cast: z.array(ID).min(1).max(5),
  beats: z.array(Beat).min(3).max(24),
  approved: z.boolean().default(false),
});
export type BeatSheet = z.infer<typeof BeatSheet>;

/** Phiếu phê bình: mỗi mục là đạt/không đạt + một dòng lý do (không chấm điểm 1–10). */
export const CheckResult = z.object({ id: z.string().max(40), pass: z.boolean(), reason: z.string().max(300) });
export const Critique = z.object({
  checks: z.array(CheckResult).min(1).max(20),
  /** tối đa 3 sửa đổi cụ thể, quan trọng nhất trước */
  fixes: z.array(z.object({ target: z.string().max(40), change: z.string().max(400) })).max(3).default([]),
});
export type Critique = z.infer<typeof Critique>;

/** Bản ghi một vòng phê bình đã lưu (để Studio hiện danh sách đạt/không đạt). */
export const CritiqueLog = z.object({
  stage: z.enum(["beats", "script"]),
  rounds: z.array(z.object({ round: z.number().int(), pass_rate: z.number(), checks: z.array(CheckResult), fixes: Critique.shape.fixes, applied: z.boolean() })),
});
export type CritiqueLog = z.infer<typeof CritiqueLog>;

export const passRate = (c: Critique) => c.checks.filter((x) => x.pass).length / Math.max(1, c.checks.length);

/** Danh mục kiểm dàn ý (id -> câu hỏi đạt/không đạt). Code gửi cho AI, AI trả đúng các id này. */
export const BEAT_CHECKS: Record<string, string> = {
  hook: "Nhịp đầu đặt câu hỏi/xung đột rõ trong câu thoại đầu tiên (người xem biết ngay vì sao phải xem tiếp)?",
  one_idea: "Cả tập giải thích đúng MỘT ý thật, người xem nói lại được trong một câu?",
  viewpoint: "Góc nhìn của tác giả hiện rõ ở cú lật hoặc câu kết, không chỉ nhắc qua?",
  escalation: "Có ít nhất 2 nhịp leo thang, mỗi bậc cao hơn bậc trước, có số liệu hoặc hình ảnh cụ thể?",
  twist: "Cú lật bất ngờ nhưng hợp lý khi nhìn lại (đã được gài từ trước)?",
  value_shift: "Mọi nhịp đều đổi một giá trị (không có nhịp đứng yên)?",
  button: "Nhịp cuối chốt bằng câu 'Step N: ...' hài và đúng ý tập?",
  on_screen: "Mọi nhịp có ý tưởng thẻ chữ/biểu đồ phục vụ giải thích?",
  cast_fit: "Mỗi nhân vật có vai hài khác nhau rõ (ngây ngô / biết tuốt / mệt mỏi...), đúng tính cách trong series bible?",
  length_fit: "Tổng est_lines nằm trong khoảng số câu cho phép?",
};

/** Danh mục kiểm kịch bản thoại. */
export const SCRIPT_CHECKS: Record<string, string> = {
  covers_beats: "Mọi nhịp trong dàn ý đã duyệt đều có thoại, đúng thứ tự?",
  distinct_voices: "Che tên người nói vẫn đoán được ai đang nói (giọng mỗi vai khác nhau)?",
  setup_punch: "Mỗi nhịp có ít nhất một cặp setup -> punch, punch đặt ở CUỐI câu?",
  short_lines: "Câu ngắn, nói được bằng giọng máy, có dấu câu để ngắt nhịp; không câu nào là đoạn văn?",
  no_exposition_dump: "Thông tin được kể qua xung đột/hành động, không có câu giảng bài dài?",
  callback: "Có ít nhất một callback hoặc running gag quay lại ở cuối?",
  facts_from_source: "Số liệu/khẳng định lấy từ tư liệu người dùng hoặc là kiến thức phổ thông chắc chắn (không bịa)?",
  natural_english: "Tiếng Anh tự nhiên, không dịch máy, không tên thương hiệu thật?",
};
