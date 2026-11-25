import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");
const HOOK = path.join(ROOT, ".claude/hooks/check-rules.mjs");
const made: string[] = [];

function run(rel: string, content: string) {
  const file = path.join(ROOT, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
  made.push(file);
  return spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ tool_input: { file_path: file } }),
    env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT },
    encoding: "utf8",
  });
}

afterAll(() => made.forEach((f) => rmSync(f, { force: true })));

describe("check-rules hook", () => {
  it("blocks Math.random in the director", () => {
    const r = run("packages/director/src/__hook_a.ts", "export const x = () => Math.random();\n");
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/Math\.random/);
  });
  it("ignores the same words inside comments", () => {
    const r = run("packages/director/src/__hook_b.ts", "// never use Math.random() here\nexport const y = 1;\n");
    expect(r.status).toBe(0);
  });
  it("blocks emoji in shared packages", () => {
    const r = run("packages/shared/src/__hook_c.ts", "export const s = \"ok \u{1F600}\";\n");
    expect(r.status).toBe(2);
  });
  it("blocks brand words in visible video text but allows the repo name", () => {
    expect(run("apps/video-engine/src/__hook_d.tsx", "export const t = 'Build with LEGO';\n").status).toBe(2);
    expect(run("apps/video-engine/src/__hook_e.tsx", "// LegoStudio overlay\nexport const t = 'Build it brick by brick';\n").status).toBe(0);
  });
});
