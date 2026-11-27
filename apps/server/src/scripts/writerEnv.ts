// Phiên viết dùng chung cho các việc nền: Claude Code trực tiếp (mặc định) hoặc Hộp thư Claude (AI_SESSION_QUEUE=1).
import path from "node:path";
import { SessionQueueAI } from "../ai/sessionQueue";
import { WRITER_SYSTEM, claudeWriter, statelessWriter, type WriterSession } from "../aiWriting";
import { REPO, type WorkspacePaths } from "../workspace";

export function writerSession(paths: WorkspacePaths, context: string, log: (l: string) => void): WriterSession {
  if (process.env.AI_SESSION_QUEUE?.trim() === "1") {
    log("Đang chờ Hộp thư Claude: gõ \"xử lý hộp thư\" trong Claude Code.");
    return statelessWriter(context, new SessionQueueAI({ dir: path.join(paths.root, "claude_queue") }), WRITER_SYSTEM);
  }
  return claudeWriter(context, { cwd: REPO, log, model: process.env.CLAUDE_MODEL?.trim() || undefined });
}
