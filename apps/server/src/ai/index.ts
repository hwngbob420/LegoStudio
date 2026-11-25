// Dựng chuỗi nhà cung cấp AI từ .env (đọc lại mỗi lần để đổi khóa không cần chạy lại server).
import { readAiConfig, readFallbacks, loadEnv } from "./env";
import { FallbackAI } from "./fallback";
import { GeminiAI } from "./gemini";
import { OpenAICompatAI } from "./openaiCompat";
import { AiError, type TextAI } from "./types";

export function makeAI(root: string): TextAI {
  loadEnv(root);
  const cfg = readAiConfig();
  const chain: TextAI[] = [];
  if (cfg.gemini) chain.push(new GeminiAI({ apiKey: process.env.GEMINI_API_KEY!.trim(), model: cfg.model!, strongModel: cfg.storyboardModel,
    fallbackModels: cfg.geminiFallbackModels, onSwitch: (from, to, why) => console.log(`AI: Gemini ${from} lỗi (${why}), chuyển sang ${to}.`) }));
  for (const fb of readFallbacks()) chain.push(new OpenAICompatAI({ name: fb.name, baseUrl: fb.baseUrl, model: fb.model, strongModel: fb.strongModel,
    apiKey: fb.apiKey, noThinking: fb.noThinking, timeoutMs: 900_000 }));
  if (!chain.length) {
    throw new AiError("Chưa cấu hình AI. Tạo file .env ở thư mục LegoStudio (mẫu: .env.example), điền GEMINI_API_KEY và GEMINI_MODEL, "
      + "hoặc AI_FALLBACKS + AI_LOCAL_URL/AI_LOCAL_MODEL cho Ollama. Bạn có thể chép file .env từ thư mục pixel-story-engine.", 503);
  }
  return chain.length === 1 ? chain[0] : new FallbackAI(chain, (from, to, why) => console.warn(`AI: ${from} lỗi (${why}), chuyển sang ${to}.`));
}

export { AiError, type TextAI };
