// Chép từ pixel-story-engine (apps/server/src/services/ai) — cổng AI dùng chung: Gemini + dự phòng kiểu OpenAI.
import { AiError, type AiRequest, type AiResult, type TextAI } from "./types";

/**
 * Thử lần lượt nhiều nhà cung cấp AI: một nơi hết hạn mức, lỗi mạng, quá lâu hoặc trả sai định dạng thì chuyển sang nơi kế.
 * Lỗi khóa sai (401) cũng chuyển nơi khác nhưng được ghi lại để báo cuối cùng. Hết cả chuỗi thì báo lỗi của từng nơi.
 */
export class FallbackAI implements TextAI {
  readonly id: string;
  /** Nhà cung cấp đã trả lời lần gọi gần nhất (để ghi nhật ký). */
  lastUsed: string | undefined;

  constructor(private providers: TextAI[], private onFallback?: (from: string, to: string, why: string) => void) {
    if (providers.length === 0) throw new Error("Cần ít nhất một nhà cung cấp AI.");
    this.id = providers.map((p) => p.id).join("+");
  }

  async json<T>(req: AiRequest<T>): Promise<AiResult<T>> {
    const errors: string[] = [];
    for (const [i, p] of this.providers.entries()) {
      try {
        const res = await p.json(req);
        this.lastUsed = p.id;
        return res;
      } catch (e) {
        const msg = (e as Error).message;
        errors.push(`${p.id}: ${msg}`);
        const next = this.providers[i + 1];
        if (next) this.onFallback?.(p.id, next.id, msg);
      }
    }
    const status = errors.length > 0 && errors.every((m) => /429|hạn mức/.test(m)) ? 429 : 502;
    throw new AiError(`Mọi nhà cung cấp AI đều lỗi. ${errors.join(" | ")}`, status);
  }
}
