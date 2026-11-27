// Phòng biên kịch: nhận file tư liệu (an toàn), nút Generate (Claude Code + skill screenwriter), cầu nối claude -p.
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { BEAT_CHECKS, SCRIPT_CHECKS, blockErrors, blockId, blockList, linesForDuration } from "@lse/shared";
import { createApp } from "./app";
import { ClaudeSession, extractJson, type ClaudeRunner } from "./ai/claudeCode";
import type { AiRequest, AiResult, TextAI } from "./ai/types";
import { blockLines, buildContext, chunkBeats, generateScript, statelessWriter, type WriterSession } from "./aiWriting";
import { extractText, zipBombCheck } from "./sources";
import { REPO, workspacePaths } from "./workspace";

const FIX = path.join(REPO, "tests/fixtures/sources");
const fx = (f: string) => readFileSync(path.join(FIX, f));

const tmp = mkdtempSync(path.join(os.tmpdir(), "lse-writing-"));
const ws = path.join(tmp, "workspace");
let base = "", close: () => void, ep = "";
let status = { ok: true, provider: "claude_code", message: "ok" };
const api = async (method: string, p: string, body?: unknown) => {
  const r = await fetch(base + p, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: (await r.json()) as any };
};
const upload = async (name: string, buf: Buffer) => {
  const fd = new FormData();
  fd.append("file", new Blob([new Uint8Array(buf)]), name);
  const r = await fetch(`${base}/api/projects/${ep}/sources`, { method: "POST", body: fd });
  return { status: r.status, json: (await r.json()) as any };
};

beforeAll(async () => {
  cpSync(path.join(REPO, "workspace/channel_library"), path.join(ws, "channel_library"), { recursive: true, filter: (s) => !s.includes(`${path.sep}baked`) });
  const { app } = createApp({ workspaceRoot: ws, runner: async () => 0, now: () => "2026-11-26T00:00:00Z", writerStatus: async () => status });
  const s = app.listen(0);
  base = `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
  close = () => s.close();
  ep = (await api("POST", "/api/projects", { title: "Sleep Debt" })).json.id;
});
afterAll(() => { close?.(); rmSync(tmp, { recursive: true, force: true }); });

describe("source extraction (pure)", () => {
  it("reads docx, pdf, md with Vietnamese text", async () => {
    expect((await extractText(fx("outline.docx"), "docx")).text).toMatch(/Bà Lin dạy Max/);
    const pdf = await extractText(fx("outline.pdf"), "pdf");
    expect(pdf.text).toMatch(/five coffees/);
    expect(pdf.needsVision).toBe(false);
    expect((await extractText(fx("outline.md"), "md")).text).toMatch(/cà phê/);
  });
  it("flags image-only PDFs for vision instead of returning nothing silently", async () => {
    expect((await extractText(fx("scan.pdf"), "pdf")).needsVision).toBe(true);
  });
  it("rejects zip bombs, fake PDFs and non-UTF-8 text", async () => {
    expect(() => zipBombCheck(fx("bomb.docx"))).toThrow(/nén/);
    await expect(extractText(fx("fake.pdf"), "pdf")).rejects.toThrow(/không phải PDF/);
    await expect(extractText(Buffer.from([0xff, 0xfe, 0x41, 0x00]), "txt")).rejects.toThrow(/UTF-8/);
  });
});

describe("upload endpoint", () => {
  it("stores under a server-made name, keeps the original name only for display", async () => {
    const r = await upload("../../../Kịch bản.md", fx("outline.md"));
    expect(r.status).toBe(200);
    expect(r.json.id).toMatch(/^src_[a-f0-9]{10}$/);
    expect(r.json.name).toBe("Kịch bản.md");
    expect(existsSync(path.join(ws, "projects", ep, "sources", `${r.json.id}.md`))).toBe(true);
    expect(existsSync(path.join(ws, "Kịch bản.md"))).toBe(false);
  });
  it("refuses wrong types and bombs with a clear Vietnamese message", async () => {
    expect((await upload("virus.exe", Buffer.from("MZ"))).status).toBe(415);
    const b = await upload("bomb.docx", fx("bomb.docx"));
    expect(b.status).toBe(422);
    expect(b.json.error).toMatch(/nén/);
  });
  it("lists and deletes sources", async () => {
    const d = await upload("outline.docx", fx("outline.docx"));
    let list = (await api("GET", `/api/projects/${ep}/sources`)).json;
    expect(list.map((s: any) => s.id)).toContain(d.json.id);
    expect((await api("DELETE", `/api/projects/${ep}/sources/${d.json.id}`)).status).toBe(200);
    list = (await api("GET", `/api/projects/${ep}/sources`)).json;
    expect(list.map((s: any) => s.id)).not.toContain(d.json.id);
  });
});


// ------------------------------------------------------------------ Claude giả cho phòng biên kịch
const beat = (i: number, kind: string, speakers: string[], est: number, chapter?: string) =>
  ({ id: `B${i}`, kind, summary: `Beat ${i} happens`, value_shift: "calm -> panic", joke: "punch", on_screen: "STEP card", speakers, est_lines: est, ...(chapter ? { chapter } : {}) });
const allPass = (c: Record<string, string>) => Object.keys(c).map((id) => ({ id, pass: true, reason: "ok" }));

/** Phiên viết giả: lần đầu dàn ý thiếu nhịp button (code phải bắt và đòi sửa), thoại phần đầu có chữ thương hiệu. */
class FakeWriter implements WriterSession {
  calls: { label: string; task: string }[] = [];
  constructor(private beatsN: number, private est: number) {}
  async ask<T>(label: string, task: string, schema: z.ZodType<T>, check?: (d: T) => string[]): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt++) {
      this.calls.push({ label, task });
      let data: unknown;
      if (label === "lap_dan_y") {
        const n = attempt === 0 ? this.beatsN - 1 : this.beatsN;
        const beats = Array.from({ length: n }, (_, i) => beat(i + 1, i === 0 ? "hook" : i === n - 1 && attempt > 0 ? "button" : "escalation",
          [i % 2 ? "grandma_lin" : "max_dev"], this.est, `Chapter ${1 + Math.floor(i / 5)}`));
        data = { title: "Sleep Debt", logline: "Coffee is a loan.", idea: "Caffeine borrows energy", viewpoint: "sleep first", runner: "mug count",
          cast: ["max_dev", "grandma_lin"], beats, new_cast: [], checks: allPass(BEAT_CHECKS), revisions: 1 };
      } else {
        const marker = "est_lines):\n";
        const start = task.indexOf(marker) + marker.length;
        const own = JSON.parse(task.slice(start, task.indexOf("\n", start))) as { id: string; speakers: string[]; est_lines: number }[];
        const lines = own.flatMap((b) => Array.from({ length: b.est_lines }, (_, j) => ({ beat: b.id, speaker: b.speakers[0],
          text: label === "viet_thoai_1" && attempt === 0 && j === 0 ? "Built with LEGO." : `Line ${b.id}.${j + 1}.` })));
        data = { lines, checks: allPass(SCRIPT_CHECKS), revisions: 0 };
      }
      const parsed = schema.parse(data);
      if (!(check?.(parsed) ?? []).length) return parsed;
    }
    throw new Error(`fake gave up on ${label}`);
  }
}

describe("Generate kịch bản (Claude + skill screenwriter)", () => {
  it("the Generate endpoint saves the form and queues a background job", async () => {
    const src = await upload("outline.md", fx("outline.md"));
    const r = await api("POST", `/api/projects/${ep}/writing/generate`, { input: { sourceIds: [src.json.id], pov: "dialogue", tones: ["deadpan", "satire"], message: "", targetSec: 60 } });
    expect(r.status).toBe(200);
    expect(r.json.kind).toBe("write_script");
    expect(r.json.steps[0].args.join(" ")).toMatch(/generate\.ts/);
    const w = (await api("GET", `/api/projects/${ep}/writing`)).json;
    expect(w.input.tones).toEqual(["deadpan", "satire"]);
  });
  it("refuses to run without material, and explains when Claude is not logged in", async () => {
    expect((await api("POST", `/api/projects/${ep}/writing/generate`, { input: { targetSec: 60 } })).status).toBe(400);
    status = { ok: false, provider: "claude_code", message: "Claude Code chưa đăng nhập. Mở Terminal, gõ: claude auth login" };
    const r = await api("POST", `/api/projects/${ep}/writing/generate`, { input: { story: "x", targetSec: 60 } });
    status = { ok: true, provider: "claude_code", message: "ok" };
    expect(r.status).toBe(503);
    expect(r.json.error).toMatch(/claude auth login/);
  });
  it("context tells Claude to use the screenwriter skill, the chosen POV/tones, and wraps material as data", async () => {
    const ctx = await buildContext(workspacePaths(ws), ep, { story: "Max drinks five coffees.", sourceIds: [], pov: "second", tones: ["warm"], message: "", notes: "Giữ chi tiết 5 ly", targetSec: 1200 });
    expect(ctx).toMatch(/skill `screenwriter`/);
    expect(ctx).toMatch(/Ngôi thứ hai/);
    expect(ctx).toMatch(/warm and healing/);
    expect(ctx).toMatch(/tự rút MỘT thông điệp/);
    expect(ctx).toMatch(/Giữ chi tiết 5 ly/);
    expect(ctx).toMatch(/<outline_document name="dan_tay">/);
  });
  it("a 20-minute episode: beats (code catches the missing button), then dialogue written in parts", async () => {
    const paths = workspacePaths(ws);
    const budget = linesForDuration(1200);
    await api("POST", `/api/projects/${ep}/writing/generate`, { input: { story: "Max drinks five coffees.", pov: "dialogue", tones: ["deadpan"], targetSec: 1200 } });
    const n = 50, est = Math.ceil(budget.min / 50) + 1;
    const fake = new FakeWriter(n, est);
    const logs: string[] = [];
    const r = await generateScript(paths, ep, fake, {}, (l) => logs.push(l));
    expect(fake.calls.filter((c) => c.label === "lap_dan_y")).toHaveLength(2);
    const parts = chunkBeats(r.beats.beats, blockLines(1200)).length;
    expect(parts).toBeGreaterThan(6); // 20 phút ~ 10 block 2 phút
    // mỗi câu mang block + beat; block là dải liền nhau b01..bN, mỗi block một phần thoại
    const blocks = blockList(r.script.lines);
    expect(blocks.map((b) => b.id)).toEqual(Array.from({ length: parts }, (_, i) => blockId(i)));
    expect(blockErrors(r.script.lines)).toEqual([]);
    expect(r.script.lines.every((l) => /^B\d+$/.test(l.beat ?? ""))).toBe(true);
    for (const b of blocks.slice(0, -1)) expect(b.lineIds.length).toBeLessThanOrEqual(blockLines(1200) + est);
    expect(r.script.lines.length).toBe(n * est);
    expect(r.script.lines.map((l) => l.text).join(" ")).not.toMatch(/lego/i);
    expect(fake.calls.filter((c) => c.label === "viet_thoai_1")).toHaveLength(2); // lần đầu có chữ thương hiệu -> phải sửa
    expect(fake.calls.find((c) => c.label === `viet_thoai_${parts}`)!.task).toMatch(/phần CUỐI/);
    expect(logs.some((l) => /\[progress\] write \d+\/\d+/.test(l))).toBe(true);
    const w = (await api("GET", `/api/projects/${ep}/writing`)).json;
    expect(w.beats.approved).toBe(true);
    expect(w.scriptCritique.rounds).toHaveLength(parts);
    expect(JSON.parse(readFileSync(path.join(ws, "projects", ep, "script.json"), "utf8")).lines).toHaveLength(n * est);
  });
  it("after the user edits the beat sheet, 'from dialogue' rewrites only the dialogue", async () => {
    const w = (await api("GET", `/api/projects/${ep}/writing`)).json;
    w.beats.beats = w.beats.beats.slice(0, 3).concat([{ ...w.beats.beats.at(-1), id: "B4" }]);
    expect((await api("PUT", `/api/projects/${ep}/writing/beats`, w.beats)).status).toBe(200);
    const fake = new FakeWriter(4, 2);
    await generateScript(workspacePaths(ws), ep, fake, { from: "dialogue" });
    expect(fake.calls.some((c) => c.label === "lap_dan_y")).toBe(false);
    expect(fake.calls[0].task).toMatch(/B1–B4/);
  });
  it("mailbox mode: the stateless writer resends the full context every turn", async () => {
    const seen: string[] = [];
    const ai: TextAI = { id: "q", json: async <T,>(req: AiRequest<T>): Promise<AiResult<T>> => { seen.push(req.prompt); return { data: req.schema.parse({ ok: true }), model: "q", inputTokens: 0, outputTokens: 0 }; } };
    const s = statelessWriter("CONTEXT-BLOCK", ai, "sys");
    await s.ask("a", "task one", z.object({ ok: z.boolean() }));
    await s.ask("b", "task two", z.object({ ok: z.boolean() }));
    expect(seen.every((p) => p.startsWith("CONTEXT-BLOCK"))).toBe(true);
  });
});

describe("Claude Code bridge (claude -p)", () => {
  const reply = (result: string) => ({ code: 0, stdout: JSON.stringify({ type: "result", subtype: "success", is_error: false, result, session_id: "sess-1", total_cost_usd: 0.01 }), stderr: "" });
  it("reads only + skill, resumes the same session, and retries invalid JSON with the error list", async () => {
    const calls: { args: string[]; stdin: string }[] = [];
    const answers = [reply("```json\n{\"n\": \"x\"}\n```"), reply("Here:\n```json\n{\"n\": 3}\n```")];
    const runner: ClaudeRunner = async (_b, args, stdin) => { calls.push({ args, stdin }); return answers.shift()!; };
    const s = new ClaudeSession({ bin: "claude.exe", cwd: REPO, runner });
    expect(await s.ask("t", "do it", z.object({ n: z.number() }))).toEqual({ n: 3 });
    expect(calls[0].args[calls[0].args.indexOf("--allowedTools") + 1]).toBe("Read,Glob,Grep,Skill");
    expect(calls[0].args.join(" ")).toMatch(/--disallowedTools Bash,Edit,Write/);
    expect(calls[0].args).not.toContain("--resume");
    expect(calls[1].args.slice(-2)).toEqual(["--resume", "sess-1"]);
    expect(calls[1].stdin).toMatch(/chưa đạt[\s\S]*n:/);
  });
  it("turns an expired login into a clear Vietnamese instruction", async () => {
    const runner: ClaudeRunner = async () => ({ code: 1, stdout: JSON.stringify({ type: "result", is_error: true, result: "Failed to authenticate: this login reached its time limit", session_id: "s" }), stderr: "" });
    await expect(new ClaudeSession({ bin: "claude.exe", cwd: REPO, runner }).ask("t", "x", z.object({}))).rejects.toThrow(/claude auth login/);
  });
  it("extracts the last fenced JSON block", () => {
    expect(extractJson("a ```json\n{\"a\":1}\n``` b ```json\n{\"a\":2}\n```")).toEqual({ a: 2 });
  });
});
