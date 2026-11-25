// Hook PostToolUse: chặn vi phạm luật cứng ngay sau khi Claude sửa/ghi file (mô hình từ pixel-story-engine).
// Thoát mã 2 => Claude Code đưa thông báo lỗi lại cho Claude để tự sửa.
// Chỉ thấy file ghi bằng Edit/Write/MultiEdit; file tạo bằng lệnh shell thì không (/phase-gate grep lại).
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let input = "";
try { input = readFileSync(0, "utf8"); } catch { process.exit(0); }
let data;
try { data = JSON.parse(input); } catch { process.exit(0); }

const filePath = (data?.tool_input?.file_path || "").replace(/\\/g, "/");
if (!filePath || !existsSync(filePath)) process.exit(0);
if (!/\.(ts|tsx|js|jsx|mjs|css|json|html|py)$/.test(filePath)) process.exit(0);

const root = (process.env.CLAUDE_PROJECT_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."))
  .replace(/\\/g, "/").replace(/\/$/, "");
const lower = (s) => (process.platform === "win32" ? s.toLowerCase() : s);
if (!lower(filePath).startsWith(lower(root) + "/")) process.exit(0);
const rel = filePath.slice(root.length + 1);
if (rel.startsWith(".claude/") || rel.includes("node_modules/")) process.exit(0);

const raw = readFileSync(filePath, "utf8");
const isCode = /\.(ts|tsx|js|jsx|mjs|css)$/.test(filePath);
const text = isCode ? raw.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1") : raw;
const problems = [];

// 1) Tất định trong bộ đạo diễn và máy chiếu Remotion
if (/^(packages\/director\/src|apps\/video-engine\/src)\//.test(rel) && isCode) {
  const banned = [
    ["Math.random()", /Math\.random\s*\(/],
    ["Date.now()", /Date\.now\s*\(/],
    ["new Date()", /new Date\s*\(/],
    ["performance.now()", /performance\.now\s*\(/],
    ["setTimeout/setInterval/requestAnimationFrame", /\b(setTimeout|setInterval|requestAnimationFrame)\s*\(/],
  ];
  for (const [name, re] of banned) {
    if (re.test(text)) problems.push(`Dùng ${name} trong ${rel.split("/").slice(0, 2).join("/")} (cấm). Mọi chuyển động tính từ số khung; ngẫu nhiên dùng seededRandom(seed).`);
  }
}

// 2) Cấm emoji trong UI, video, gói dùng chung
if (/^(apps\/studio-ui|apps\/video-engine|packages)\//.test(rel)) {
  const m = raw.match(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u);
  if (m) problems.push(`Có ký tự emoji "${m[0]}" (cấm). UI dùng Lucide Icons, video dùng hình vẽ.`);
}

// 3) An toàn thương hiệu: chữ hiển thị trong video không có tên thương hiệu
const brand = /\b(lego|duplo)\b/i;
const visibleText = /^apps\/video-engine\/src\//.test(rel)
  || /^workspace\/projects\/[^/]+\/(script|storyboard)\.json$/.test(rel)
  || /\/locales\/[^/]+\.json$/.test(rel);
if (visibleText) {
  const m = text.match(brand);
  if (m) problems.push(`Có từ thương hiệu "${m[0]}" trong chữ hiển thị của video (cấm). Dùng "gạch", "brick", "minifig".`);
}

if (problems.length) {
  console.error(`[Luật dự án] ${rel}:\n- ` + problems.join("\n- "));
  process.exit(2);
}
process.exit(0);
