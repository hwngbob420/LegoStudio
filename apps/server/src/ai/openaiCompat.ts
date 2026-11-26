// Chép từ pixel-story-engine (apps/server/src/services/ai) — cổng AI dùng chung: Gemini + dự phòng kiểu OpenAI.
import http from "node:http";
import https from "node:https";
import { toGeminiSchema } from "./gemini";
import { AiError, type AiRequest, type AiResult, type TextAI } from "./types";

/**
 * fetch dựa trên node:http: fetch có sẵn của Node cắt kết nối nếu máy chủ chưa trả phần đầu sau 300 giây,
 * mà mô hình chạy trên máy (Ollama) với lời nhắc dài có thể mất hơn thế. Ở đây chỉ giới hạn bằng AbortSignal của người gọi.
 */
export const longFetch: typeof fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(String(input));
  const lib = url.protocol === "https:" ? https : http;
  return await new Promise<Response>((resolve, reject) => {
    const req = lib.request(url, { method: init?.method ?? "GET", headers: init?.headers as Record<string, string> | undefined }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve(new Response(Buffer.concat(chunks), { status: res.statusCode ?? 0 })));
      res.on("error", reject);
    });
    req.on("error", reject);
    const sig = init?.signal;
    if (sig) {
      const abort = () => { const e = new Error("aborted"); e.name = (sig.reason as { name?: string } | undefined)?.name ?? "AbortError"; req.destroy(e); reject(e); };
      if (sig.aborted) abort(); else sig.addEventListener("abort", abort, { once: true });
    }
    if (init?.body) req.write(init.body as string);
    req.end();
  });
}) as typeof fetch;

export interface OpenAICompatOptions {
  /** Tên hiển thị trong nhật ký, ví dụ "groq" hoặc "local". */
  name: string;
  /** Địa chỉ gốc, ví dụ https://api.groq.com/openai/v1 hoặc http://127.0.0.1:11434/v1 (Ollama). */
  baseUrl: string;
  model: string;
  /** Mô hình dùng cho việc nặng (storyboard); mặc định cùng `model`. */
  strongModel?: string;
  /** Khóa (không bắt buộc với máy chủ chạy trên máy bạn). */
  apiKey?: string;
  /** Tắt chế độ "suy nghĩ" của mô hình (qwen3...): nhanh hơn nhiều với việc JSON ngắn. Gửi reasoning_effort=none. */
  noThinking?: boolean;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

interface ChatResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/**
 * Cổng AI kiểu OpenAI (chat/completions): dùng được với Ollama, LM Studio, Groq, OpenRouter, DeepSeek, Mistral...
 * Đòi JSON theo schema; máy chủ không hỗ trợ json_schema thì tự lùi về json_object kèm schema trong lời nhắc.
 * Kết quả luôn được kiểm lại bằng schema zod, sai thì gửi lại một lần kèm danh sách lỗi (giống Gemini).
 */
export class OpenAICompatAI implements TextAI {
  readonly id: string;
  private f: typeof fetch;

  constructor(private o: OpenAICompatOptions) {
    this.id = o.name;
    this.f = o.fetchFn ?? longFetch;
  }

  async json<T>(req: AiRequest<T>): Promise<AiResult<T>> {
    const model = req.tier === "strong" ? this.o.strongModel ?? this.o.model : this.o.model;
    const schema = toGeminiSchema(req.schema);
    let prompt = req.prompt;
    let inputTokens = 0;
    let outputTokens = 0;
    let lastIssue = "";
    let mode: "schema" | "object" = "schema";

    for (let attempt = 0; attempt < 2; attempt++) {
      let res: ChatResponse;
      try {
        res = await this.call(model, req, prompt, schema, mode);
      } catch (e) {
        if (mode === "schema" && e instanceof AiError && e.status === 400) {
          mode = "object";
          res = await this.call(model, req, prompt, schema, mode);
        } else throw e;
      }
      inputTokens += res.usage?.prompt_tokens ?? 0;
      outputTokens += res.usage?.completion_tokens ?? 0;
      try {
        const text = (res.choices?.[0]?.message?.content ?? "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
        const parsed = req.schema.safeParse(JSON.parse(text));
        if (parsed.success) return { data: parsed.data, model: `${this.id}:${model}`, inputTokens, outputTokens };
        lastIssue = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".") || "(gốc)"}: ${i.message}`).join("; ");
      } catch {
        lastIssue = "Kết quả không phải JSON hợp lệ.";
      }
      prompt = `${req.prompt}\n\nLẦN TRƯỚC BẠN TRẢ VỀ SAI SCHEMA. Lỗi: ${lastIssue}\nHãy trả lại JSON đúng schema.`;
    }
    throw new AiError(`${this.id} trả về dữ liệu sai định dạng hai lần liên tiếp (${lastIssue}).`, 502);
  }

  private async call(model: string, req: AiRequest<unknown>, prompt: string, schema: unknown, mode: "schema" | "object"): Promise<ChatResponse> {
    // kiểu OpenAI chỉ nhận ảnh; PDF ảnh chụp (application/pdf) bỏ qua
    const imgs = (req.images ?? []).filter((im) => im.mime.startsWith("image/"));
    const userContent = imgs.length
      ? [{ type: "text", text: mode === "object" ? `${prompt}\n\nTrả về JSON đúng schema sau:\n${JSON.stringify(schema)}` : prompt }, ...imgs.map((im) => ({ type: "image_url", image_url: { url: `data:${im.mime};base64,${im.base64}` } }))]
      : mode === "object" ? `${prompt}\n\nTrả về JSON đúng schema sau:\n${JSON.stringify(schema)}` : prompt;
    const body = {
      model,
      messages: [{ role: "system", content: req.system }, { role: "user", content: userContent }],
      response_format: mode === "schema" ? { type: "json_schema", json_schema: { name: "result", schema } } : { type: "json_object" },
      temperature: 0.4,
      ...(this.o.noThinking ? { reasoning_effort: "none" } : {}),
    };
    let r: Response;
    try {
      r = await this.f(`${this.o.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(this.o.apiKey ? { Authorization: `Bearer ${this.o.apiKey}` } : {}) },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.o.timeoutMs ?? (req.tier === "strong" ? 300_000 : 180_000)),
      });
    } catch (e) {
      const name = (e as { name?: string }).name;
      throw new AiError(name === "TimeoutError" || name === "AbortError" ? `${this.id} trả lời quá lâu.` : `Không kết nối được ${this.id} (${this.o.baseUrl}).`, 504);
    }
    if (r.status === 429) throw new AiError(`${this.id} báo quá hạn mức gọi (429).`, 429);
    if (r.status === 401 || r.status === 403) throw new AiError(`${this.id} từ chối khóa API (${r.status}). Kiểm tra khóa trong file .env.`, 401);
    if (r.status === 400) throw new AiError(`${this.id} từ chối yêu cầu (400).`, 400);
    if (!r.ok) throw new AiError(`${this.id} lỗi ${r.status}.`, r.status >= 500 ? 502 : r.status);
    return (await r.json()) as ChatResponse;
  }
}
