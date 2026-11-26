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

/** Độ dài mục tiêu (giây) người dùng chọn được: từ Shorts tới tập dài 30 phút. */
export const TARGET_SECONDS = [20, 45, 60, 120, 180, 300, 600, 900, 1200, 1800] as const;

/** Ngôi kể. "dialogue" là kiểu mặc định của kênh (các minifig nói với nhau). */
export const POVS = {
  dialogue: { label: "Đối thoại giữa nhân vật", hint: "Các minifig nói chuyện với nhau, không có người dẫn.", directive: "Pure character dialogue: minifigs talk to each other; no narrator." },
  second: { label: "Ngôi thứ hai — \"Bạn\"", hint: "Người dẫn nói thẳng với khán giả: \"Bạn thức dậy lúc 6 giờ...\". Nhân vật chen thoại.", directive: "Second-person narration: the narrator (speaker classic_yellow) addresses the viewer as 'you' and walks them step by step; other characters interject with short lines." },
  first: { label: "Ngôi thứ nhất — \"Tôi\"", hint: "Một nhân vật kể chuyện của chính mình.", directive: "First-person: one main character narrates their own story ('I...') between dialogue moments." },
  third: { label: "Ngôi thứ ba — người dẫn", hint: "Người dẫn kể về các nhân vật như phim tài liệu.", directive: "Third-person narration: a documentary-style narrator (speaker classic_yellow) describes the characters, who speak in between." },
} as const;
export type Pov = keyof typeof POVS;

/** Giọng văn (chọn tối đa 2). directive là lời dặn tiếng Anh gửi cho Claude. */
export const TONES = {
  deadpan: { label: "Hài tỉnh bơ", hint: "Câu ngắn, mặt lạnh, cười vì sự vô lý", directive: "deadpan comedy: short flat lines, humor from absurdity stated calmly" },
  satire: { label: "Châm biếm đời thường", hint: "Soi thói quen, hệ thống quen thuộc", directive: "everyday satire: skewer familiar habits and systems without cruelty" },
  slapstick: { label: "Hài ngớ ngẩn", hint: "Tình huống lố, phản ứng to", directive: "silly slapstick: exaggerated situations and big reactions" },
  dark: { label: "Hài đen nhẹ", hint: "Cười vào điều hơi đáng sợ", directive: "light dark humor: laugh at mildly grim truths, never mean-spirited" },
  self_mock: { label: "Tự giễu", hint: "Nhân vật tự chế giễu mình", directive: "self-deprecating humor: characters roast themselves" },
  warm: { label: "Ấm áp, chữa lành", hint: "Nhẹ nhàng, kết dễ chịu", directive: "warm and healing: gentle, kind, a comforting ending" },
  inspiring: { label: "Truyền cảm hứng", hint: "Thôi thúc người xem làm gì đó", directive: "inspiring: builds to a motivating call to action" },
  nostalgic: { label: "Hoài niệm", hint: "Gợi ký ức, chậm và sâu", directive: "nostalgic: evocative memories, slower and reflective" },
  dramatic: { label: "Kịch tính", hint: "Căng thẳng tăng dần, nút thắt", directive: "dramatic: rising tension, stakes and cliffhangers" },
  mystery: { label: "Bí ẩn, khám phá", hint: "Câu hỏi treo, hé lộ từng lớp", directive: "mystery: open questions, reveal layer by layer" },
  investigative: { label: "Phóng sự điều tra", hint: "Lần theo tiền, số liệu, ai được lợi", directive: "investigative: follow the money and the numbers, who benefits" },
  science_fun: { label: "Khoa học vui", hint: "Giải thích cơ chế bằng ví dụ dễ hiểu", directive: "fun science explainer: mechanisms through vivid everyday analogies" },
  documentary: { label: "Tài liệu nghiêm túc", hint: "Điềm tĩnh, chính xác, ít đùa", directive: "serious documentary: calm, precise, sparse humor" },
  fairy_tale: { label: "Cổ tích, ngụ ngôn", hint: "Kể như truyện cổ, có bài học", directive: "fable or fairy-tale telling with a clear moral" },
  spooky: { label: "Rùng rợn nhẹ", hint: "Không khí hồi hộp, hợp mọi lứa tuổi", directive: "mildly spooky: suspenseful atmosphere, family-friendly" },
  poetic: { label: "Trầm lắng, triết lý", hint: "Câu chữ chậm, gợi suy ngẫm", directive: "quiet and philosophical: slower lines that invite reflection" },
} as const;
export type Tone = keyof typeof TONES;

/** Thông tin người dùng điền trước khi bấm "Generate kịch bản". */
export const WritingInput = z.preprocess((v) => {
  // tương thích bản cũ: viewpoint -> message, mood (chữ) -> bỏ qua
  if (v && typeof v === "object" && "viewpoint" in v && !("message" in v)) return { ...(v as object), message: (v as { viewpoint: unknown }).viewpoint };
  return v;
}, z.object({
  story: z.string().max(200_000).default(""),
  sourceIds: z.array(z.string().regex(/^src_[a-f0-9]{10}$/)).max(10).default([]),
  pov: z.enum(Object.keys(POVS) as [Pov, ...Pov[]]).default("dialogue"),
  tones: z.array(z.enum(Object.keys(TONES) as [Tone, ...Tone[]])).max(2).default(["deadpan"]),
  /** điều người xem nên mang về sau khi xem (tuỳ chọn; trống thì Claude tự rút từ tư liệu) */
  message: z.string().max(1000).default(""),
  /** yêu cầu thêm cho biên kịch: chi tiết phải giữ, điều cần tránh... */
  notes: z.string().max(2000).default(""),
  targetSec: z.number().min(10).max(1800).default(60),
}));
export type WritingInput = z.infer<typeof WritingInput>;

/**
 * Số câu thoại hợp lý cho một độ dài video. Đo từ tập thật: ep02 52 câu / 190 s (3,6 s/câu), showcase 6 câu / 19,5 s
 * (có cảnh lắp ráp mở đầu). Câu ngắn kiểu deadpan nên lấy 3,2 s/câu cho trần, 5,5 s/câu cho sàn.
 */
export function linesForDuration(targetSec: number): { min: number; max: number } {
  const t = Math.max(10, Math.min(1800, targetSec));
  return { min: Math.max(2, Math.round(t / 5.5)), max: Math.max(6, Math.min(600, Math.round(t / 3.2))) };
}

const ID = z.string().regex(/^[a-z][a-z0-9_]{2,30}$/);

/** Một nhịp trong dàn ý. Không có thời gian hay toạ độ: code tự lo. */
export const Beat = z.object({
  id: z.string().regex(/^B\d{1,3}$/),
  /** tập dài: tên chương chứa nhịp này */
  chapter: z.string().max(80).optional(),
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
  beats: z.array(Beat).min(3).max(160),
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
  rounds: z.array(z.object({ round: z.number().int(), label: z.string().optional(), pass_rate: z.number(), checks: z.array(CheckResult), fixes: Critique.shape.fixes, applied: z.boolean() })),
});
export type CritiqueLog = z.infer<typeof CritiqueLog>;

export const passRate = (c: Critique) => c.checks.filter((x) => x.pass).length / Math.max(1, c.checks.length);

/** Danh mục kiểm dàn ý (id -> câu hỏi đạt/không đạt). Code gửi cho AI, AI trả đúng các id này. */
export const BEAT_CHECKS: Record<string, string> = {
  hook: "Nhịp đầu đặt câu hỏi/xung đột rõ trong câu thoại đầu tiên (người xem biết ngay vì sao phải xem tiếp)?",
  one_idea: "Cả tập giải thích đúng MỘT ý thật, người xem nói lại được trong một câu?",
  viewpoint: "Thông điệp người xem mang về (của người dùng, hoặc tự rút từ tư liệu) hiện rõ ở cú lật hoặc câu kết, không chỉ nhắc qua?",
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
