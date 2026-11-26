// Generate kịch bản (chạy nền từ hàng đợi việc): Claude Code + skill screenwriter -> dàn ý -> thoại theo phần -> script.json.
//   npx tsx apps/server/src/scripts/generate.ts <thư mục tập> [--from dialogue]
// AI_SESSION_QUEUE=1 trong .env: dùng Hộp thư Claude thay vì gọi Claude Code trực tiếp.
import path from "node:path";
import { loadEnv } from "../ai/env";
import { SessionQueueAI } from "../ai/sessionQueue";
import { WRITER_SYSTEM, claudeWriter, contextFor, generateScript, statelessWriter } from "../aiWriting";
import { REPO, workspacePaths } from "../workspace";

async function main() {
  const prod = path.resolve(process.argv[2] ?? "");
  const from = process.argv.includes("--from") ? (process.argv[process.argv.indexOf("--from") + 1] as "beats" | "dialogue") : "beats";
  const ep = path.basename(prod);
  const paths = workspacePaths(path.dirname(path.dirname(prod)));
  loadEnv(REPO);
  const context = await contextFor(paths, ep);
  const log = (l: string) => console.log(l);
  const session = process.env.AI_SESSION_QUEUE?.trim() === "1"
    ? statelessWriter(context, new SessionQueueAI({ dir: path.join(paths.root, "claude_queue") }), WRITER_SYSTEM)
    : claudeWriter(context, { cwd: REPO, log, model: process.env.CLAUDE_MODEL?.trim() || undefined });
  if (process.env.AI_SESSION_QUEUE?.trim() === "1") log("Đang chờ Hộp thư Claude: gõ \"xử lý hộp thư\" trong Claude Code.");
  await generateScript(paths, ep, session, { from }, log);
}

main().catch((e) => { console.error(`LỖI: ${(e as Error).message}`); process.exit(1); });
