// Chép từ pixel-story-engine (apps/server/src/services/ai) — cổng AI dùng chung: Gemini + dự phòng kiểu OpenAI.
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { AiError, type AiRequest, type AiResult, type TextAI } from "./types";

/** Phần tối thiểu của ứng dụng Gemini mà lớp này cần (để thay bằng giả lập khi kiểm thử). */
export interface GenClient {
  models: {
    generateContent(args: unknown): Promise<{ text?: string; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number } }>;
  };
}

export interface GeminiOptions {
  apiKey: string;
  model: string;
  strongModel?: string;
  /** Model dự phòng, thử theo thứ tự khi model chính quá tải (503), hết hạn mức (429), lỗi máy chủ hoặc quá lâu. */
  fallbackModels?: string[];
  timeoutMs?: number;
  /** Thời gian chờ giữa các lần thử lại trên CÙNG một model (mặc định 2,5 giây, 8 giây, 20 giây). */
  retryDelaysMs?: number[];
  /** Model vừa lỗi bị xếp xuống cuối trong khoảng này (mặc định 5 phút) để không chờ lại từ đầu ở mỗi lần gọi. */
  cooldownMs?: number;
  /** Ghi nhật ký khi đổi model. */
  onSwitch?: (from: string, to: string, why: string) => void;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  client?: GenClient;
}

/** Schema zod -> JSON Schema cho Gemini (bỏ khóa $schema mà Gemini không nhận). */
export function toGeminiSchema(schema: z.ZodType): unknown {
  const js = z.toJSONSchema(schema) as Record<string, unknown>;
  delete js.$schema;
  return js;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type CallError = AiError & { retryable?: boolean; fatal?: boolean; daily?: boolean };

/** 429 do hết hạn mức THEO NGÀY (gói miễn phí: 20 lượt mỗi ngày mỗi model): thử lại ngay vô ích, phải đổi model hoặc đợi sang ngày. */
export function isDailyQuota(e: unknown): boolean {
  const err = e as { status?: number; message?: string };
  return err.status === 429 && /PerDay|per.?day|RPD/i.test(String(err.message ?? ""));
}

/** Lỗi nên thử lại hoặc đổi model: quá lâu, 429, 5xx (kể cả 503 quá tải), mất kết nối. */
export function isRetryable(e: unknown): boolean {
  const err = e as { status?: number; name?: string };
  if (err.name === "TimeoutError" || err.name === "AbortError") return true;
  if (err.status === 429) return true;
  if (typeof err.status === "number") return err.status >= 500;
  return true;
}

function wrap(e: unknown): CallError {
  const err = e as { status?: number; name?: string };
  const retryable = isRetryable(e);
  let out: CallError;
  if (err.name === "TimeoutError" || err.name === "AbortError") out = new AiError("Gemini trả lời quá lâu (quá 3 phút). Thử lại hoặc rút ngắn truyện.", 504);
  else if (err.status === 401 || err.status === 403) { out = new AiError("Gemini từ chối khóa API (kiểm GEMINI_API_KEY trong file .env, hoặc khóa chưa được bật quyền).", 502); out.fatal = true; }
  else if (isDailyQuota(e)) { out = new AiError("Gemini báo hết hạn mức trong NGÀY của model này (429). Hạn mức tự làm mới lúc 15 giờ (giờ Việt Nam), hoặc bật thanh toán để nâng hạn mức.", 429); out.daily = true; }
  else if (err.status === 429) out = new AiError("Gemini báo quá hạn mức gọi (429). Đợi vài phút rồi thử lại.", 429);
  else if (err.status === 404) out = new AiError("Gemini không tìm thấy model. Kiểm GEMINI_MODEL trong file .env.", 502);
  else if (err.status) out = new AiError(`Gemini báo lỗi ${err.status}.`, 502);
  else out = new AiError("Không nối được Gemini. Kiểm kết nối mạng rồi thử lại.", 502);
  out.retryable = retryable;
  return out;
}

/**
 * Gọi Gemini lấy JSON có schema. Sai schema thì gửi lại một lần kèm danh sách lỗi.
 * 429, 5xx (503 quá tải) và quá lâu: thử lại giãn cách trên cùng model, hết lượt thì chuyển sang model dự phòng.
 * Model vừa lỗi được xếp xuống cuối một lúc để các lần gọi sau không phải chờ lại từ đầu. Lỗi khóa (401, 403) báo ngay.
 */
export class GeminiAI implements TextAI {
  readonly id = "gemini";
  private client: GenClient;
  private cool = new Map<string, number>();

  constructor(private opts: GeminiOptions) {
    this.client = opts.client ?? (new GoogleGenAI({ apiKey: opts.apiKey }) as unknown as GenClient);
  }

  private now(): number { return (this.opts.now ?? Date.now)(); }

  /** Danh sách model theo thứ tự thử: model đang nghỉ (vừa lỗi) xuống cuối. */
  private order(primary: string): string[] {
    const all = [...new Set([primary, ...(this.opts.fallbackModels ?? [])])];
    const t = this.now();
    return [...all.filter((m) => (this.cool.get(m) ?? 0) <= t), ...all.filter((m) => (this.cool.get(m) ?? 0) > t)];
  }

  async json<T>(req: AiRequest<T>): Promise<AiResult<T>> {
    const primary = req.tier === "strong" ? this.opts.strongModel ?? this.opts.model : this.opts.model;
    const models = this.order(primary);
    const problems: string[] = [];
    for (const [i, model] of models.entries()) {
      try {
        return await this.jsonWith(model, req);
      } catch (e) {
        const err = e as CallError;
        if (err.fatal) throw err;
        problems.push(`${model}: ${err.message}`);
        if (err.retryable !== false) this.cool.set(model, this.now() + (err.daily ? 6 * 3_600_000 : this.opts.cooldownMs ?? 300_000));
        const next = models[i + 1];
        if (next) this.opts.onSwitch?.(model, next, err.message);
      }
    }
    const all429 = problems.every((p) => /429|hạn mức/.test(p));
    throw new AiError(models.length === 1 ? problems[0].replace(/^[^:]+: /, "") : `Mọi model Gemini đều lỗi. ${problems.join(" | ")}`, all429 ? 429 : 502);
  }

  private async jsonWith<T>(model: string, req: AiRequest<T>): Promise<AiResult<T>> {
    const responseJsonSchema = toGeminiSchema(req.schema);
    let prompt = req.prompt;
    let inputTokens = 0;
    let outputTokens = 0;
    let lastIssue = "";

    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await this.call(model, req.system, prompt, responseJsonSchema, req.images, this.opts.timeoutMs ?? (req.tier === "strong" ? 300_000 : 180_000));
      inputTokens += res.usageMetadata?.promptTokenCount ?? 0;
      outputTokens += (res.usageMetadata?.candidatesTokenCount ?? 0) + (res.usageMetadata?.thoughtsTokenCount ?? 0);
      try {
        const parsed = req.schema.safeParse(JSON.parse(res.text ?? ""));
        if (parsed.success) return { data: parsed.data, model, inputTokens, outputTokens };
        lastIssue = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".") || "(gốc)"}: ${i.message}`).join("; ");
      } catch {
        lastIssue = "Kết quả không phải JSON hợp lệ.";
      }
      prompt = `${req.prompt}\n\nLẦN TRƯỚC BẠN TRẢ VỀ SAI SCHEMA. Lỗi: ${lastIssue}\nHãy trả lại JSON đúng schema.`;
    }
    const e: CallError = new AiError(`Gemini trả về dữ liệu sai định dạng hai lần liên tiếp (${lastIssue}). Thử lại sau hoặc rút ngắn truyện.`, 502);
    e.retryable = true;
    throw e;
  }

  private async call(model: string, system: string, prompt: string, responseJsonSchema: unknown, images: AiRequest<unknown>["images"], timeoutMs: number) {
    const delays = this.opts.retryDelaysMs ?? [2500, 8000, 20000];
    const sleep = this.opts.sleep ?? realSleep;
    const run = () =>
      this.client.models.generateContent({
        model,
        contents: images?.length ? [{ role: "user", parts: [{ text: prompt }, ...images.map((im) => ({ inlineData: { mimeType: im.mime, data: im.base64 } }))] }] : prompt,
        config: {
          systemInstruction: system,
          responseMimeType: "application/json",
          responseJsonSchema,
          abortSignal: AbortSignal.timeout(timeoutMs),
        },
      });
    let last: unknown;
    for (let i = 0; i <= delays.length; i++) {
      try {
        return await run();
      } catch (e) {
        last = e;
        if (!isRetryable(e) || isDailyQuota(e) || i === delays.length) break;
        await sleep(delays[i]);
      }
    }
    throw wrap(last);
  }
}
