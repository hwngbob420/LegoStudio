// "Claude sửa block này" chạy nền (5C): góp ý của người dùng -> Claude (skill screenwriter) viết lại thoại riêng block đó.
//   npx tsx apps/server/src/scripts/fixblock.ts <thư mục tập> <block>
// Bước sau trong cùng việc: tạo giọng (chỉ đọc lại câu đổi) rồi direct.ts --block <block> --fix.
import path from "node:path";
import { loadEnv } from "../ai/env";
import { contextFor } from "../aiWriting";
import { fixBlockScript } from "../blockFix";
import { REPO, workspacePaths } from "../workspace";
import { writerSession } from "./writerEnv";

async function main() {
  const prod = path.resolve(process.argv[2] ?? "");
  const block = process.argv[3] ?? "";
  const ep = path.basename(prod);
  const paths = workspacePaths(path.dirname(path.dirname(prod)));
  loadEnv(REPO);
  const log = (l: string) => console.log(l);
  const context = await contextFor(paths, ep);
  const { record } = await fixBlockScript(paths, ep, block, writerSession(paths, context, log), log);
  console.log(`Claude: ${record.summary}`);
}

main().catch((e) => { console.error(`LỖI: ${(e as Error).message}`); process.exit(1); });
