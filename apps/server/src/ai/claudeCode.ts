// Claude Code chạy ngầm (`claude -p`) làm AI của Studio: dùng tài khoản Claude đã đăng nhập trên máy, nạp skill dự án
// (.claude/skills/screenwriter...) vì chạy ở thư mục gốc repo. Claude chỉ được ĐỌC (Read/Glob/Grep) và dùng Skill;
// không sửa file, không chạy lệnh. Kết quả là JSON trong câu trả lời cuối, server kiểm bằng zod và gửi lại lỗi để Claude sửa.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { z, type ZodType } from "zod";
import { AiError, type AiRequest, type AiResult, type TextAI } from "./types";

export interface RunResult { code: number; stdout: string; stderr: string }
export type ClaudeRunner = (bin: string, args: string[], stdin: string, cwd: string, timeoutMs: number) => Promise<RunResult>;

/** Tìm claude.exe: biến CLAUDE_BIN, bản cài native (~/.local/bin), rồi PATH. */
export function findClaude(env: NodeJS.ProcessEnv = process.env): string | null {
  const cands = [env.CLAUDE_BIN, path.join(os.homedir(), ".local", "bin", process.platform === "win32" ? "claude.exe" : "claude")];
  for (const c of cands) if (c && existsSync(c)) return c;
  for (const dir of (env.PATH ?? "").split(path.delimiter)) {
    for (const name of process.platform === "win32" ? ["claude.exe", "claude.cmd"] : ["claude"]) {
      const f = path.join(dir, name);
      if (existsSync(f)) return f;
    }
  }
  return null;
}

export const spawnRunner: ClaudeRunner = (bin, args, stdin, cwd, timeoutMs) => new Promise((resolve, reject) => {
  const child = spawn(bin, args, { cwd, windowsHide: true, shell: bin.endsWith(".cmd") });
  let stdout = "", stderr = "";
  const t = setTimeout(() => { child.kill(); reject(new AiError(`Claude chạy quá ${Math.round(timeoutMs / 60000)} phút, đã dừng.`, 504)); }, timeoutMs);
  child.stdout.on("data", (d) => { stdout += d; });
  child.stderr.on("data", (d) => { stderr += d; });
  child.on("error", (e) => { clearTimeout(t); reject(new AiError(`Không chạy được Claude Code: ${e.message}`, 503)); });
  child.on("close", (code) => { clearTimeout(t); resolve({ code: code ?? 1, stdout, stderr }); });
  child.stdin.end(stdin, "utf8");
});

/** Đã đăng nhập Claude chưa (không tốn lượt: dùng `claude auth status`). */
export async function claudeStatus(bin = findClaude(), runner: ClaudeRunner = spawnRunner): Promise<{ ok: boolean; message: string }> {
  if (!bin) return { ok: false, message: "Chưa thấy Claude Code trên máy. Cài Claude Code (bản dòng lệnh) rồi mở lại Studio." };
  try {
    const r = await runner(bin, ["auth", "status", "--json"], "", process.cwd(), 30_000);
    const j = JSON.parse(r.stdout);
    return j.loggedIn ? { ok: true, message: `Claude Code đã sẵn sàng (${j.authMethod}).` }
      : { ok: false, message: "Claude Code chưa đăng nhập. Mở Terminal, gõ: claude auth login  (đăng nhập tài khoản Claude), rồi bấm lại." };
  } catch (e) { return { ok: false, message: `Không kiểm được Claude Code: ${(e as Error).message}` }; }
}

/** Lấy khối JSON trong câu trả lời (ưu tiên khối ```json cuối cùng). */
export function extractJson(text: string): unknown {
  const fences = [...text.matchAll(/```(?:json)?\s*\n([\s\S]*?)```/g)];
  const cand = fences.length ? fences[fences.length - 1][1] : text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  if (!cand.trim()) throw new Error("Câu trả lời không có JSON.");
  return JSON.parse(cand);
}

const issuesOf = (e: z.ZodError) => e.issues.slice(0, 15).map((i) => `${i.path.join(".") || "(gốc)"}: ${i.message}`);

export interface SessionOpts {
  bin?: string | null;
  cwd: string;
  runner?: ClaudeRunner;
  /** công cụ Claude được dùng (mặc định chỉ đọc + skill) */
  tools?: string[];
  maxTurns?: number;
  timeoutMs?: number;
  model?: string;
  /** ghi nhật ký tiến độ (dòng chữ) */
  log?: (line: string) => void;
}

/**
 * Một phiên Claude nhiều lượt: lượt đầu nạp tư liệu + skill, các lượt sau `--resume` cùng phiên nên Claude nhớ ngữ cảnh.
 * Mỗi lượt phải trả JSON đúng khuôn; sai thì gửi lại danh sách lỗi (tối đa 2 lần).
 */
export class ClaudeSession {
  sessionId: string | undefined;
  costUsd = 0;
  private bin: string;
  constructor(private o: SessionOpts) {
    const b = o.bin === undefined ? findClaude() : o.bin;
    if (!b) throw new AiError("Chưa thấy Claude Code trên máy. Cài Claude Code (bản dòng lệnh) rồi mở lại Studio.", 503);
    this.bin = b;
  }

  private async turn(prompt: string): Promise<string> {
    const args = ["-p", "--output-format", "json", "--max-turns", String(this.o.maxTurns ?? 40),
      "--allowedTools", (this.o.tools ?? ["Read", "Glob", "Grep", "Skill"]).join(","),
      "--disallowedTools", "Bash,Edit,Write,NotebookEdit,WebFetch,WebSearch",
      ...(this.o.model ? ["--model", this.o.model] : []),
      ...(this.sessionId ? ["--resume", this.sessionId] : [])];
    const r = await (this.o.runner ?? spawnRunner)(this.bin, args, prompt, this.o.cwd, this.o.timeoutMs ?? 30 * 60_000);
    let out: { result?: string; session_id?: string; is_error?: boolean; total_cost_usd?: number; subtype?: string };
    try { out = JSON.parse(r.stdout); } catch {
      throw new AiError(`Claude Code trả về dữ liệu lạ (mã ${r.code}): ${(r.stderr || r.stdout).slice(0, 300)}`, 502);
    }
    this.sessionId = out.session_id ?? this.sessionId;
    this.costUsd += out.total_cost_usd ?? 0;
    const text = out.result ?? "";
    if (out.is_error) {
      if (/authenticat|log ?in|login|credential|oauth/i.test(text)) {
        throw new AiError("Claude Code chưa đăng nhập hoặc phiên đã hết hạn. Mở Terminal, gõ: claude auth login  rồi bấm lại.", 401);
      }
      if (/usage limit|rate limit|quota/i.test(text)) throw new AiError(`Claude đang hết hạn mức: ${text.slice(0, 200)}`, 429);
      throw new AiError(`Claude Code báo lỗi: ${text.slice(0, 300)}`, 502);
    }
    if (out.subtype && out.subtype !== "success") throw new AiError(`Claude dừng giữa chừng (${out.subtype}). Thử lại, hoặc tăng số lượt.`, 502);
    return text;
  }

  /** Hỏi một lượt, đòi JSON khớp `schema`; `check` thêm luật do code kiểm (trả danh sách lỗi). */
  async ask<T>(label: string, prompt: string, schema: ZodType<T>, check?: (d: T) => string[]): Promise<T> {
    let msg = `${prompt}\n\nTRẢ LỜI: chỉ MỘT khối \`\`\`json chứa đúng JSON theo khuôn (JSON Schema) sau, không thêm chữ nào khác:\n${JSON.stringify(z.toJSONSchema(schema as z.ZodType, { io: "input", unrepresentable: "any" }))}`;
    for (let attempt = 0; ; attempt++) {
      this.o.log?.(`claude: ${label}${attempt ? ` (sửa lần ${attempt})` : ""}`);
      const text = await this.turn(msg);
      let errs: string[] = [];
      let data: T | undefined;
      try {
        const parsed = schema.safeParse(extractJson(text));
        if (parsed.success) { data = parsed.data; errs = check?.(data) ?? []; } else errs = issuesOf(parsed.error);
      } catch (e) { errs = [(e as Error).message]; }
      if (!errs.length && data !== undefined) return data;
      if (attempt >= 2) throw new AiError(`Claude trả kết quả chưa đạt sau 3 lần (${label}): ${errs.slice(0, 3).join("; ")}`, 502);
      msg = `JSON vừa rồi chưa đạt:\n${errs.map((e) => `- ${e}`).join("\n")}\nSửa và trả lại TOÀN BỘ JSON trong một khối \`\`\`json.`;
    }
  }
}

/** TextAI một lượt (cho các việc khác của Studio: đạo diễn, dịch phụ đề...). */
export class ClaudeCodeAI implements TextAI {
  readonly id = "claude_code";
  constructor(private o: Omit<SessionOpts, "log">) {}
  async json<T>(req: AiRequest<T>): Promise<AiResult<T>> {
    const s = new ClaudeSession(this.o);
    const files = req.files?.length ? `\n\nFile gửi kèm (đọc bằng công cụ Read): ${req.files.join(", ")}` : "";
    const data = await s.ask(req.label, `${req.system}\n\n---\n\n${req.prompt}${files}`, req.schema);
    return { data, model: "claude-code", inputTokens: 0, outputTokens: 0 };
  }
}
