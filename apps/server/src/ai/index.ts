// Dựng chuỗi nhà cung cấp AI từ .env (đọc lại mỗi lần để đổi khóa không cần chạy lại server).
// AI_SESSION_QUEUE=1: mọi việc AI vào "Hộp thư Claude" (workspace/claude_queue) cho phiên Claude Code trả lời — không khóa, không phí.
// Mọi lần gọi được ghi sổ chi phí workspace/cost_log.jsonl (tên việc, model, số token).
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { readAiConfig, readFallbacks, loadEnv } from "./env";
import { FallbackAI } from "./fallback";
import { GeminiAI } from "./gemini";
import { OpenAICompatAI } from "./openaiCompat";
import { SessionQueueAI } from "./sessionQueue";
import { AiError, type AiRequest, type AiResult, type TextAI } from "./types";

/** Bọc một AI để ghi sổ chi phí sau mỗi lần gọi thành công. */
export class CostLoggedAI implements TextAI {
  readonly id: string;
  constructor(private inner: TextAI, private file: string, private now: () => string = () => new Date().toISOString()) {
    this.id = inner.id;
  }
  async json<T>(req: AiRequest<T>): Promise<AiResult<T>> {
    const res = await this.inner.json(req);
    mkdirSync(path.dirname(this.file), { recursive: true });
    appendFileSync(this.file, JSON.stringify({ at: this.now(), label: req.label, provider: this.inner.id, model: res.model,
      input_tokens: res.inputTokens, output_tokens: res.outputTokens }) + "\n");
    return res;
  }
}

export function costSummary(file: string) {
  if (!existsSync(file)) return { calls: 0, input_tokens: 0, output_tokens: 0, by_label: {} as Record<string, number>, recent: [] as unknown[] };
  const rows = readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const by_label: Record<string, number> = {};
  for (const r of rows) by_label[r.label] = (by_label[r.label] ?? 0) + 1;
  return { calls: rows.length, input_tokens: rows.reduce((a, r) => a + (r.input_tokens ?? 0), 0),
    output_tokens: rows.reduce((a, r) => a + (r.output_tokens ?? 0), 0), by_label, recent: rows.slice(-10).reverse() };
}

export function makeAI(root: string, workspaceRoot = path.join(root, "workspace")): TextAI {
  loadEnv(root);
  const cfg = readAiConfig();
  const log = path.join(workspaceRoot, "cost_log.jsonl");
  if (cfg.sessionQueue) return new CostLoggedAI(new SessionQueueAI({ dir: path.join(workspaceRoot, "claude_queue") }), log);
  const chain: TextAI[] = [];
  if (cfg.gemini) chain.push(new GeminiAI({ apiKey: process.env.GEMINI_API_KEY!.trim(), model: cfg.model!, strongModel: cfg.storyboardModel,
    fallbackModels: cfg.geminiFallbackModels, onSwitch: (from, to, why) => console.log(`AI: Gemini ${from} lỗi (${why}), chuyển sang ${to}.`) }));
  for (const fb of readFallbacks()) chain.push(new OpenAICompatAI({ name: fb.name, baseUrl: fb.baseUrl, model: fb.model, strongModel: fb.strongModel,
    apiKey: fb.apiKey, noThinking: fb.noThinking, timeoutMs: 900_000 }));
  if (!chain.length) {
    throw new AiError("Chưa cấu hình AI. Tạo file .env ở thư mục LegoStudio (mẫu: .env.example), điền GEMINI_API_KEY và GEMINI_MODEL, "
      + "hoặc AI_FALLBACKS + AI_LOCAL_URL/AI_LOCAL_MODEL cho Ollama, hoặc AI_SESSION_QUEUE=1 để Claude trong Claude Code trả lời. "
      + "Bạn có thể chép file .env từ thư mục pixel-story-engine.", 503);
  }
  const ai = chain.length === 1 ? chain[0] : new FallbackAI(chain, (from, to, why) => console.warn(`AI: ${from} lỗi (${why}), chuyển sang ${to}.`));
  return new CostLoggedAI(ai, log);
}

export { AiError, type TextAI };
