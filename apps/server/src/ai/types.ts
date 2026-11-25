// Chép từ pixel-story-engine (apps/server/src/services/ai) — cổng AI dùng chung: Gemini + dự phòng kiểu OpenAI.
import type { ZodType } from "zod";

/** Mức model: "default" cho việc thường, "strong" cho storyboard (Gđ 3C). */
export type ModelTier = "default" | "strong";

export interface AiRequest<T> {
  /** Tên việc, dùng để ghi cost_log (ví dụ "phan_tich_truyen"). */
  label: string;
  system: string;
  prompt: string;
  /** Schema zod của JSON phải trả về (cũng được gửi cho Gemini làm structured output). */
  schema: ZodType<T>;
  tier?: ModelTier;
  /** Ảnh gửi kèm để AI nhìn (ví dụ mô tả ảnh tư liệu). */
  images?: Array<{ mime: string; base64: string }>;
}

export interface AiResult<T> {
  data: T;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/** AI chỉ sinh JSON: mọi việc vẽ, chuyển động, trộn âm do code cố định làm (CLAUDE.md). */
export interface TextAI {
  readonly id: string;
  json<T>(req: AiRequest<T>): Promise<AiResult<T>>;
}

export class AiError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
    this.name = "AiError";
  }
}
