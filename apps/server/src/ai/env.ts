// Chép từ pixel-story-engine (apps/server/src/services/env.ts): đọc .env, không bao giờ trả giá trị khóa.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";

/** Đọc file .env thành cặp tên=giá trị. Bỏ dấu BOM đầu file (Notepad hay thêm) để tên biến đầu tiên không bị hỏng. */
function parseEnvFile(file: string): Record<string, string> {
  const text = readFileSync(file, "utf8").replace(/^﻿/, "");
  return parseEnv(text) as Record<string, string>;
}

/** Các biến do chính file .env đặt vào process.env (để lần đọc sau cập nhật được khi bạn đổi khóa mà không cần chạy lại server). */
const fromFile = new Set<string>();

/**
 * Nạp file .env (nếu có) vào process.env. Biến đặt sẵn từ bên ngoài (hệ điều hành, lệnh chạy) luôn được ưu tiên;
 * biến đến từ file .env thì được cập nhật mỗi lần đọc lại. Khóa API chỉ nằm ở file này, không commit.
 */
export function loadEnv(root: string): void {
  const file = path.join(root, ".env");
  if (!existsSync(file)) return;
  try {
    for (const [k, v] of Object.entries(parseEnvFile(file))) {
      if (!v.trim()) continue;
      if (!process.env[k]?.trim() || fromFile.has(k)) {
        process.env[k] = v;
        fromFile.add(k);
      }
    }
  } catch {
    /* file hỏng thì coi như chưa có */
  }
}

/** Chẩn đoán file .env mà không lộ giá trị: chỉ trả về tên biến và biến nào đang để trống. */
export function envDiagnostics(root: string): { found: boolean; keys: string[]; empty: string[]; unreadable?: boolean } {
  const file = path.join(root, ".env");
  if (!existsSync(file)) return { found: false, keys: [], empty: [] };
  try {
    const parsed = parseEnvFile(file);
    return { found: true, keys: Object.keys(parsed), empty: Object.entries(parsed).filter(([, v]) => !v.trim()).map(([k]) => k) };
  } catch {
    return { found: true, keys: [], empty: [], unreadable: true };
  }
}

export interface FallbackConfig { name: string; baseUrl: string; model: string; strongModel?: string; apiKey?: string; noThinking?: boolean }

export interface AiConfig {
  /** Gọi được ít nhất một nhà cung cấp AI (Gemini đủ khóa và model, hoặc có nhà dự phòng). */
  configured: boolean;
  /** Gemini đủ khóa API và tên model. */
  gemini: boolean;
  /** Tên các nhà cung cấp dự phòng đã cấu hình (không kèm khóa). */
  fallbacks: string[];
  missing: string[];
  model?: string;
  storyboardModel?: string;
  /** Model Gemini dự phòng (GEMINI_MODEL_FALLBACKS, ngăn bằng dấu phẩy). */
  geminiFallbackModels: string[];
  /** AI_SESSION_QUEUE=1: mọi việc AI gửi vào hàng đợi cho Claude trong phiên Claude Code xử lý (không cần khóa, không tốn API). */
  sessionQueue: boolean;
}

/** Đọc cấu hình AI từ biến môi trường. Không bao giờ trả về giá trị khóa. */
export function readAiConfig(env: NodeJS.ProcessEnv = process.env): AiConfig {
  const missing: string[] = [];
  if (!env.GEMINI_API_KEY?.trim()) missing.push("GEMINI_API_KEY");
  if (!env.GEMINI_MODEL?.trim()) missing.push("GEMINI_MODEL");
  const fb = readFallbacks(env);
  return {
    configured: missing.length === 0 || fb.length > 0 || env.AI_SESSION_QUEUE?.trim() === "1",
    gemini: missing.length === 0,
    fallbacks: fb.map((x) => x.name),
    missing,
    model: env.GEMINI_MODEL?.trim() || undefined,
    storyboardModel: env.GEMINI_MODEL_STORYBOARD?.trim() || env.GEMINI_MODEL?.trim() || undefined,
    sessionQueue: env.AI_SESSION_QUEUE?.trim() === "1",
    geminiFallbackModels: (env.GEMINI_MODEL_FALLBACKS ?? "").split(",").map((x) => x.trim()).filter((x) => /^[A-Za-z0-9._-]{2,60}$/.test(x)),
  };
}

/**
 * Nhà cung cấp AI dự phòng kiểu OpenAI (Ollama, LM Studio, Groq, OpenRouter, DeepSeek...). Cấu hình trong .env:
 *   AI_FALLBACKS=local,groq            (thứ tự thử, ngăn bằng dấu phẩy)
 *   AI_LOCAL_URL=http://127.0.0.1:11434/v1   AI_LOCAL_MODEL=qwen3:8b
 *   AI_GROQ_URL=https://api.groq.com/openai/v1   AI_GROQ_MODEL=...   AI_GROQ_KEY=...   (khóa không bắt buộc với máy chủ trên máy bạn)
 * Nhà nào thiếu địa chỉ hoặc model thì bị bỏ qua.
 */
export function readFallbacks(env: NodeJS.ProcessEnv = process.env): FallbackConfig[] {
  const names = (env.AI_FALLBACKS ?? "").split(",").map((x) => x.trim().toLowerCase()).filter((x) => /^[a-z0-9_]{1,20}$/.test(x));
  const out: FallbackConfig[] = [];
  for (const name of [...new Set(names)]) {
    const key = name.toUpperCase();
    const baseUrl = env[`AI_${key}_URL`]?.trim();
    const model = env[`AI_${key}_MODEL`]?.trim();
    if (!baseUrl || !model) continue;
    out.push({ name, baseUrl, model, strongModel: env[`AI_${key}_MODEL_STORYBOARD`]?.trim() || undefined, apiKey: env[`AI_${key}_KEY`]?.trim() || undefined, noThinking: env[`AI_${key}_NOTHINK`]?.trim() === "1" });
  }
  return out;
}
