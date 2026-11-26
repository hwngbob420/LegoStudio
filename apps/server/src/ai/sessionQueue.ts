// Chép từ pixel-story-engine (apps/server/src/services/ai/sessionQueue.ts): Hộp thư Claude.
import { promises as fs } from "node:fs";
import path from "node:path";
import { toGeminiSchema } from "./gemini";
import { AiError, type AiRequest, type AiResult, type TextAI } from "./types";

/**
 * "Hàng đợi Claude": thay vì gọi API trả phí, mỗi lần tool cần AI nó ghi MỘT VIỆC ra thư mục `workspace/claude_queue/`
 * (system, lời nhắc, khuôn JSON phải trả về) rồi chờ. Claude (trong phiên Claude Code của người làm) đọc việc, viết kết quả JSON
 * ra tệp `<id>.response.json`; tool tự đọc, kiểm đúng khuôn như mọi nhà cung cấp AI khác, rồi chạy tiếp.
 * Sai khuôn thì ghi `<id>.error.txt` (liệt kê lỗi) và chờ bản sửa. Không có khóa, không có chi phí API.
 */
export interface QueueRequest { id: string; label: string; tier: string; createdAt: string; system: string; prompt: string; schema: unknown; images?: number }

export class SessionQueueAI implements TextAI {
  readonly id = "claude_session";
  constructor(private opts: { dir: string; pollMs?: number; timeoutMs?: number; sleep?: (ms: number) => Promise<void>; now?: () => number }) {}

  private sleep(ms: number): Promise<void> { return (this.opts.sleep ?? ((m) => new Promise<void>((r) => setTimeout(r, m))))(ms); }
  private now(): number { return (this.opts.now ?? Date.now)(); }

  async json<T>(req: AiRequest<T>): Promise<AiResult<T>> {
    await fs.mkdir(this.opts.dir, { recursive: true });
    const id = `${new Date(this.now()).toISOString().replace(/[:.]/g, "-")}_${req.label.replace(/[^a-z0-9_]/gi, "").slice(0, 30)}`;
    const base = path.join(this.opts.dir, id);
    const request: QueueRequest = { id, label: req.label, tier: req.tier ?? "default", createdAt: new Date(this.now()).toISOString(), system: req.system, prompt: req.prompt, schema: toGeminiSchema(req.schema), ...(req.images?.length ? { images: req.images.length } : {}) };
    await fs.writeFile(`${base}.request.json`, JSON.stringify(request, null, 2) + "\n", "utf8");
    const deadline = this.now() + (this.opts.timeoutMs ?? 24 * 3_600_000);
    let lastIssue = "";
    let seen = "";
    for (;;) {
      let raw: string | undefined;
      try { raw = await fs.readFile(`${base}.response.json`, "utf8"); } catch { raw = undefined; }
      if (raw !== undefined && raw !== seen) {
        seen = raw;
        try {
          const parsed = req.schema.safeParse(JSON.parse(raw));
          if (parsed.success) {
            await fs.rename(`${base}.response.json`, `${base}.done.json`).catch(() => undefined);
            await fs.rm(`${base}.error.txt`, { force: true });
            return { data: parsed.data, model: "claude-session", inputTokens: 0, outputTokens: 0 };
          }
          lastIssue = parsed.error.issues.slice(0, 12).map((i) => `${i.path.join(".") || "(gốc)"}: ${i.message}`).join("\n");
        } catch {
          lastIssue = "Tệp trả lời không phải JSON hợp lệ.";
        }
        await fs.writeFile(`${base}.error.txt`, `Kết quả chưa đúng khuôn, hãy sửa tệp ${id}.response.json:\n${lastIssue}\n`, "utf8");
      }
      if (this.now() > deadline) throw new AiError(`Hết thời gian chờ Claude xử lý việc ${id}${lastIssue ? `. Lần sửa gần nhất còn lỗi: ${lastIssue.split("\n")[0]}` : ""}.`, 504);
      await this.sleep(this.opts.pollMs ?? 1500);
    }
  }
}

/** Danh sách việc đang chờ (có request, chưa có done). */
export async function listPending(dir: string): Promise<QueueRequest[]> {
  const files = (await fs.readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith(".request.json")).sort();
  const out: QueueRequest[] = [];
  for (const f of files) {
    const id = f.replace(/\.request\.json$/, "");
    const done = await fs.stat(path.join(dir, `${id}.done.json`)).then(() => true).catch(() => false);
    if (!done) out.push(JSON.parse(await fs.readFile(path.join(dir, f), "utf8")) as QueueRequest);
  }
  return out;
}
