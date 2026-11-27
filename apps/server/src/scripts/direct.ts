// AI đạo diễn chạy nền (5C): kịch bản + giọng -> storyboard, có thanh tiến độ. Tập 20 phút cần hàng chục lượt AI,
// nên không chạy trong một yêu cầu HTTP.
//   npx tsx apps/server/src/scripts/direct.ts <thư mục tập> [--block b03 [--fix]] [--auto]
// --auto: chỉ dùng đạo diễn tự động theo luật (không gọi AI), kết quả tất định.
// --block: chỉ dựng lại block đó (giữ nguyên block khác). --fix: dùng ghi chú hình từ lần "Claude sửa block này"
// (writing/fix_<block>.json) và ghi kết quả vào bảng duyệt.
import { existsSync } from "node:fs";
import path from "node:path";
import { makeAI } from "../ai";
import { loadEnv } from "../ai/env";
import { FixRecord, fixFile } from "../blockFix";
import { recordFix } from "../blocks";
import { aiStoryboard } from "../aiStoryboard";
import { readJson } from "../jsonStore";
import { REPO, workspacePaths } from "../workspace";

async function main() {
  const a = process.argv.slice(2);
  const prod = path.resolve(a[0] ?? "");
  const ep = path.basename(prod);
  const paths = workspacePaths(path.dirname(path.dirname(prod)));
  loadEnv(REPO);
  const block = a.includes("--block") ? a[a.indexOf("--block") + 1] : undefined;
  const fix = block && a.includes("--fix") && existsSync(fixFile(paths, ep, block)) ? await readJson(fixFile(paths, ep, block), FixRecord) : null;
  let ai = null;
  if (!a.includes("--auto")) try { ai = makeAI(REPO, paths.root); } catch (e) { console.log(`Không dùng được AI (${(e as Error).message}); dùng đạo diễn tự động.`); }
  const log = (l: string) => console.log(l);
  const r = await aiStoryboard(ai, paths, ep, { blocks: block ? [block] : undefined, note: fix?.director_note || undefined, log, ...(a.includes("--auto") ? { mode: "auto" as const } : {}) });
  const errs = r.issues.filter((i) => i.level === "error").length;
  console.log(`storyboard: ${r.storyboard.shots.length} cảnh, ${errs} lỗi bố cục${r.note ? ` (${r.note})` : ""}`);
  if (block && fix) {
    await recordFix(paths, ep, block, fix.handled, fix.summary, [], new Date().toISOString());
    console.log(`bảng duyệt: block ${block} -> chờ duyệt lại`);
  }
}

main().catch((e) => { console.error(`LỖI: ${(e as Error).message}`); process.exit(1); });
