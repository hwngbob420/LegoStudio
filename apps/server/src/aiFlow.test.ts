import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { autoPlan } from "@lse/director";
import { Script } from "@lse/shared";
import { createApp } from "./app";
import { AiError, type AiRequest, type AiResult, type TextAI } from "./ai/types";
import { REPO } from "./workspace";

/** AI giả: trả JSON cố định theo tên việc, ghi lại lời gọi. */
class FakeAI implements TextAI {
  id = "fake";
  calls: string[] = [];
  fail = false;
  async json<T>(req: AiRequest<T>): Promise<AiResult<T>> {
    this.calls.push(req.label);
    if (this.fail) throw new AiError("hết hạn mức (giả)", 429);
    let data: unknown;
    if (req.label === "phan_tich_truyen") {
      data = { title: "Soup Science", logline: "A chef learns salt maths.", new_cast: [{ id: "zoe_chef", name: "Zoe", vibe: "Over-confident chef", age: "30s",
        skin: "skin_medium", hair_style: "bob", hair_color: "hair_red", torso_print: "apron", torso_color: "white", legs_color: "charcoal",
        glasses: "none", face_details: ["freckles"], voice: "female", default_expression: "smug_smirk" }],
        lines: [{ speaker: "zoe_chef", text: "Salt makes everything better." }, { speaker: "max_dev", text: "Even coffee?" }, { speaker: "zoe_chef", text: "Step two. Taste first." }] };
    } else if (req.label === "dich_phu_de") {
      const src = JSON.parse(req.prompt);
      data = { lines: src.lines.map((l: { id: string; text: string }) => ({ id: l.id, text: `[vi] ${l.text}` })), cues: src.cues.map(() => ({ title: "Tiêu đề" })) };
    } else {
      const script = Script.parse(JSON.parse(readFileSync(path.join(ws, "projects/showcase_v1/script.json"), "utf8")));
      const plan = autoPlan(script, "Set_BrickCreatorDesk", {});
      plan.beats[2] = { ...plan.beats[2], shot: "mcu", ui: { type: "brick_chart", title: "Focus per coffee", bars: [{ label: "x1", value: 6 }, { label: "x2", value: 8 }, { label: "x3", value: 9 }], collapse_last: true } };
      data = plan;
    }
    return { data: req.schema.parse(data), model: "fake", inputTokens: 0, outputTokens: 0 };
  }
}

const tmp = mkdtempSync(path.join(os.tmpdir(), "lse-ai-"));
const ws = path.join(tmp, "workspace");
const fake = new FakeAI();
let base = "", close: () => void;
const api = async (method: string, p: string, body?: unknown) => {
  const r = await fetch(base + p, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: (await r.json()) as any };
};

beforeAll(() => {
  cpSync(path.join(REPO, "workspace/channel_library"), path.join(ws, "channel_library"), { recursive: true, filter: (s) => !s.includes(`${path.sep}baked`) });
  for (const f of ["storyboard.json", "script.json"]) cpSync(path.join(REPO, "workspace/projects/showcase_v1", f), path.join(ws, "projects/showcase_v1", f));
  cpSync(path.join(REPO, "tests/fixtures/showcase_timing.json"), path.join(ws, "projects/showcase_v1/timing.json"));
  const { app } = createApp({ workspaceRoot: ws, ai: fake, runner: async () => 0 });
  const s = app.listen(0);
  base = `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
  close = () => s.close();
});
afterAll(() => { close?.(); rmSync(tmp, { recursive: true, force: true }); });

describe("AI script (Tab 1)", () => {
  it("writes the clean script and puts the new character in the EPISODE library", async () => {
    const p = await api("POST", "/api/projects", { title: "Soup" });
    const r = await api("POST", `/api/projects/${p.json.id}/ai/script`, { story: "A chef and a dev argue about salt.", viewpoint: "Taste before you trust a rule." });
    expect(r.status).toBe(200);
    expect(r.json.newCast).toEqual(["zoe_chef"]);
    expect(existsSync(path.join(ws, "projects", p.json.id, "assets/cast/zoe_chef.json"))).toBe(true);
    const lib = await api("GET", "/api/library");
    expect(lib.json.castTier.max_dev).toBe("channel");
    expect(lib.json.castTier.zoe_chef).toBe(p.json.id);
    expect(r.json.script.lines.map((l: { speaker: string }) => l.speaker)).toEqual(["zoe_chef", "max_dev", "zoe_chef"]);
  });
  it("refuses without a viewpoint", async () => {
    expect((await api("POST", "/api/projects/showcase_v1/ai/script", { story: "x" })).status).toBe(400);
  });
});

describe("AI director (Tab 4)", () => {
  it("builds a storyboard from AI beats with zero face/UI collisions", async () => {
    const r = await api("POST", "/api/projects/showcase_v1/ai/storyboard", {});
    expect(r.status).toBe(200);
    expect(r.json.source).toBe("ai");
    expect(r.json.issues.filter((i: { level: string }) => i.level === "error")).toEqual([]);
    expect(r.json.storyboard.ui.some((c: { type: string }) => c.type === "brick_chart")).toBe(true);
    expect(fake.calls).toContain("dao_dien");
  });
  it("falls back to the rule-based director when the AI fails", async () => {
    fake.fail = true;
    const r = await api("POST", "/api/projects/showcase_v1/ai/storyboard", {});
    fake.fail = false;
    expect(r.status).toBe(200);
    expect(r.json.source).toBe("auto");
    expect(r.json.note).toMatch(/đạo diễn tự động/);
  });
  it("rewrites one shot and keeps the others untouched", async () => {
    await api("POST", "/api/projects/showcase_v1/ai/storyboard", {});
    const before = (await api("GET", "/api/projects/showcase_v1")).json.storyboard;
    const r = await api("POST", "/api/projects/showcase_v1/ai/rewrite-shot", { shot: "S3", note: "more dramatic" });
    expect(r.status).toBe(200);
    expect(r.json.storyboard.shots[1]).toEqual(before.shots[1]);
    expect(r.json.storyboard.shots.find((s: { id: string }) => s.id === "S3")).toBeDefined();
  });
});

import { SessionQueueAI, listPending } from "./ai/sessionQueue";
import { CostLoggedAI, costSummary } from "./ai";
import { z } from "zod";

describe("4B: subtitles, Shorts, costs, Claude mailbox", () => {
  it("locale defaults to the original text, saves edits, and AI translation fills every line", async () => {
    const d = await api("GET", "/api/projects/showcase_v1/locale/vi");
    expect(d.json.lines.L1).toMatch(/Three coffees/);
    const t = await api("POST", "/api/projects/showcase_v1/ai/translate", { lang: "vi" });
    expect(t.status).toBe(200);
    expect(t.json.lines.L3).toMatch(/^\[vi\]/);
    const edited = { ...t.json, lines: { ...t.json.lines, L1: "Ba ly cà phê." } };
    expect((await api("PUT", "/api/projects/showcase_v1/locale/vi", edited)).status).toBe(200);
    expect((await api("GET", "/api/projects/showcase_v1/locale/vi")).json.lines.L1).toBe("Ba ly cà phê.");
    expect((await api("GET", "/api/projects/showcase_v1/locale/xx")).status).toBe(400);
  });
  it("creates a vertical Shorts episode and queues its render", async () => {
    const r = await api("POST", "/api/projects/showcase_v1/shorts", {});
    expect(r.status).toBe(200);
    expect(r.json.id).toBe("showcase_v1_shorts");
    const st = await api("GET", "/api/projects/showcase_v1_shorts");
    expect(st.json.storyboard.resolution).toEqual([1080, 1920]);
    expect(st.json.issues.filter((i: { level: string }) => i.level === "error")).toEqual([]);
    expect(r.json.job.kind).toBe("render");
  });
  it("cost log records every AI call", async () => {
    const f = path.join(tmp, "cost.jsonl");
    const ai = new CostLoggedAI(fake, f, () => "2026-11-26T00:00:00Z");
    await ai.json({ label: "dich_phu_de", system: "", prompt: JSON.stringify({ lines: [], cues: [] }), schema: z.object({ lines: z.array(z.any()), cues: z.array(z.any()) }) });
    expect(costSummary(f).calls).toBe(1);
    expect(costSummary(f).by_label.dich_phu_de).toBe(1);
  });
  it("Claude mailbox: request file appears, a wrong answer is rejected, a right one is accepted", async () => {
    const dir = path.join(tmp, "claude_queue");
    const q = new SessionQueueAI({ dir, pollMs: 10 });
    const p = q.json({ label: "dao_dien", system: "s", prompt: "p", schema: z.object({ ok: z.boolean() }) });
    let pending: Awaited<ReturnType<typeof listPending>> = [];
    for (let i = 0; i < 50 && !pending.length; i++) { await new Promise((r) => setTimeout(r, 10)); pending = await listPending(dir); }
    expect(pending[0].label).toBe("dao_dien");
    const { writeFileSync } = await import("node:fs");
    writeFileSync(path.join(dir, `${pending[0].id}.response.json`), JSON.stringify({ ok: "yes" }));
    await new Promise((r) => setTimeout(r, 60));
    expect(existsSync(path.join(dir, `${pending[0].id}.error.txt`))).toBe(true);
    writeFileSync(path.join(dir, `${pending[0].id}.response.json`), JSON.stringify({ ok: true }));
    expect((await p).data).toEqual({ ok: true });
  });
});
