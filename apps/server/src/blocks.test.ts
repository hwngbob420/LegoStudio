// 5C: block ~2 phút trên server: danh sách + nhận xét tự động, xem trước riêng block, góp ý, "Claude sửa block này".
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { autoPlan, compose } from "@lse/director";
import { Script, Storyboard, blockList, parseOrThrow } from "@lse/shared";
import { blockScript, layoutTiming } from "../../../tests/fixtures/blockEpisode";
import { createApp } from "./app";
import { aiStoryboard } from "./aiStoryboard";
import { fixBlockScript, fixFile } from "./blockFix";
import type { WriterSession } from "./aiWriting";
import type { Step } from "./jobs";
import { REPO, workspacePaths } from "./workspace";

const tmp = mkdtempSync(path.join(os.tmpdir(), "lse-blocks-"));
const ws = path.join(tmp, "workspace");
const ep = "ep09_bug_hunt";
const ran: Step[][] = [];
let base = "", close: () => void;
const api = async (method: string, p: string, body?: unknown) => {
  const r = await fetch(base + p, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: (await r.json()) as any };
};
const SETS = { Set_BrickCreatorDesk: { anchors: ["max_mark", "priya_mark", "priya_offstage", "desk_center", "center"], lighting: "studio_bright" } };

beforeAll(async () => {
  cpSync(path.join(REPO, "workspace/channel_library"), path.join(ws, "channel_library"), { recursive: true, filter: (s) => !s.includes(`${path.sep}baked`) });
  const dir = path.join(ws, "projects", ep);
  mkdirSync(path.join(dir, "build"), { recursive: true });
  const sc = blockScript();
  const timing = layoutTiming(sc);
  const sb = compose(autoPlan(sc, "Set_BrickCreatorDesk", {}), { episode: ep, script: sc, timing, sets: SETS, defaultExpr: {} });
  writeFileSync(path.join(dir, "script.json"), JSON.stringify(sc));
  writeFileSync(path.join(dir, "build", "timing.json"), JSON.stringify(timing));
  writeFileSync(path.join(dir, "storyboard.json"), JSON.stringify(sb));
  writeFileSync(path.join(dir, "beats.json"), JSON.stringify(autoPlan(sc, "Set_BrickCreatorDesk", {})));
  const { app, jobs } = createApp({ workspaceRoot: ws, now: () => "2026-11-27T00:00:00Z", writerStatus: async () => ({ ok: true, provider: "claude_code", message: "ok" }),
    runner: async (step) => { ran.at(-1)!.push(step); return 0; } });
  const orig = jobs.enqueue.bind(jobs);
  jobs.enqueue = (p, k, s) => { ran.push([]); return orig(p, k, s); };
  const s = app.listen(0);
  base = `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
  close = () => s.close();
});
afterAll(() => { close?.(); rmSync(tmp, { recursive: true, force: true }); });

describe("blocks API", () => {
  it("lists blocks with frame ranges, times, lines and automatic notes", async () => {
    const r = await api("GET", `/api/projects/${ep}/blocks`);
    expect(r.status).toBe(200);
    expect(r.json.ready).toBe(true);
    const [b1, b2] = r.json.blocks;
    expect([b1.id, b2.id]).toEqual(["b01", "b02"]);
    expect(b1.f0).toBe(1);
    expect(b2.f0).toBe(b1.f1 + 1);
    expect(b2.t0).toBeCloseTo((b2.f0 - 1) / 12, 3);
    expect(b1.lines.map((l: any) => l.id)).toEqual(["L1", "L2", "L3", "L4", "L5", "L6", "L7"]);
    expect(b2.hash).toMatch(/^[0-9a-f]{16}$/);
    expect(b1.review.status).toBe("draft");
    expect(Array.isArray(b1.notes)).toBe(true);
  });

  it("previews one block as a standalone timeline with voice and subtitles re-based to the block start", async () => {
    const all = (await api("GET", `/api/projects/${ep}/blocks`)).json.blocks;
    const r = await api("GET", `/api/projects/${ep}/preview?block=b02`);
    expect(r.status).toBe(200);
    expect(r.json.timeline.frames).toBe(all[1].f1 - all[1].f0 + 1);
    expect(Object.keys(r.json.voice).sort()).toEqual(["L10", "L11", "L12", "L13", "L14", "L8", "L9"]);
    expect(r.json.voice.L8.start).toBeGreaterThan(0);
    expect(r.json.voice.L8.start).toBeLessThan(1.5);
    expect(r.json.overlay.subtitles.map((s: any) => s.id)).toContain("L8");
    expect(r.json.overlay.subtitles.map((s: any) => s.id)).not.toContain("L1");
    expect((await api("GET", `/api/projects/${ep}/preview?block=b07`)).status).toBe(404);
  });

  it("comments move a block to needs_fix; resolving all returns it to draft; approve works", async () => {
    const c = await api("POST", `/api/projects/${ep}/blocks/b02/comments`, { text: "Câu L9 nghe nhạt, cho Priya phản ứng mạnh hơn.", kind: "content", line: "L9" });
    expect(c.status).toBe(200);
    expect(c.json.id).toBe("c1");
    let b2 = (await api("GET", `/api/projects/${ep}/blocks`)).json.blocks[1];
    expect(b2.review.status).toBe("needs_fix");
    const c2 = await api("POST", `/api/projects/${ep}/blocks/b02/comments`, { text: "Cảnh cuối nên là cận mặt Max.", kind: "visual" });
    expect(c2.json.id).toBe("c2");
    expect((await api("PATCH", `/api/projects/${ep}/blocks/b02/comments/c2`, { resolved: true })).status).toBe(200);
    expect((await api("POST", `/api/projects/${ep}/blocks/bad/comments`, { text: "x" })).status).toBe(400);
    expect((await api("PUT", `/api/projects/${ep}/blocks/b01/status`, { status: "approved" })).json.status).toBe("approved");
    b2 = (await api("GET", `/api/projects/${ep}/blocks`)).json.blocks[1];
    expect(b2.review.comments.filter((x: any) => !x.resolved)).toHaveLength(1);
  });

  it("'Claude sửa block' queues fix -> voice -> direct for that block only", async () => {
    expect((await api("POST", `/api/projects/${ep}/blocks/b01/fix`)).status).toBe(409); // chưa có góp ý mở
    const r = await api("POST", `/api/projects/${ep}/blocks/b02/fix`);
    expect(r.status).toBe(200);
    expect(r.json.kind).toBe("fix_block");
    expect(r.json.steps.map((s: Step) => s.label)).toEqual(["fix", "tts", "direct"]);
    expect(r.json.steps[0].args).toContain("b02");
    expect(r.json.steps[2].args).toEqual(expect.arrayContaining(["--block", "b02", "--fix"]));
    expect((await api("GET", `/api/projects/${ep}/blocks`)).json.blocks[1].review.status).toBe("fixing");
  });

  it("'Làm bản xem trước' saves the input and queues write -> voice -> direct", async () => {
    const r = await api("POST", `/api/projects/${ep}/make-preview`, { input: { story: "Max hunts a bug.", targetSec: 1200 } });
    expect(r.json.steps.map((s: Step) => s.label)).toEqual(["write", "tts", "direct"]);
    const v = await api("POST", `/api/projects/${ep}/make-preview`, { from: "voice" });
    expect(v.json.steps.map((s: Step) => s.label)).toEqual(["tts", "direct"]);
  });
});

describe("fixing one block", () => {
  const paths = workspacePaths(ws);
  it("Claude rewrites only that block, keeps unchanged line IDs, records a director note", async () => {
    const before = parseOrThrow(Script, JSON.parse(readFileSync(path.join(ws, "projects", ep, "script.json"), "utf8")), "s");
    const fake: WriterSession = {
      async ask(label, task, schema, check) {
        expect(label).toBe("sua_block_b02");
        expect(task).toMatch(/c1 \(nội dung, câu L9\)/);
        expect(task).not.toMatch(/c2/); // góp ý đã xử lý không gửi lại
        const own = before.lines.filter((l) => l.block === "b02");
        const lines = own.map((l) => ({ speaker: l.speaker, text: l.id === "L9" ? "It says undefined. Again. Like my weekend plans." : l.text }));
        const d = schema.parse({ lines, director_note: "Câu L9: cận mặt Priya, biểu cảm shocked_wide.", handled: ["c1"], summary: "Viết lại câu L9 cho hài hơn.",
          checks: [{ id: "distinct_voices", pass: true, reason: "ok" }] });
        expect(check?.(d) ?? []).toEqual([]);
        return d;
      },
    };
    const { script, record } = await fixBlockScript(paths, ep, "b02", fake);
    const b1Before = before.lines.filter((l) => l.block === "b01");
    expect(script.lines.filter((l) => l.block === "b01")).toEqual(b1Before);
    const b2 = script.lines.filter((l) => l.block === "b02");
    expect(b2.map((l) => l.id)).toEqual(["L8", "L15", "L10", "L11", "L12", "L13", "L14"]); // chỉ câu đổi chữ mang ID mới
    expect(b2[1].text).toMatch(/weekend plans/);
    expect(record.changed_lines).toBe(true);
    expect(JSON.parse(readFileSync(fixFile(paths, ep, "b02"), "utf8")).director_note).toMatch(/cận mặt Priya/);
    expect(blockList(script.lines).map((b) => b.id)).toEqual(["b01", "b02"]);
  });

  it("re-directing block 2 keeps block 1's shots untouched", async () => {
    const dir = path.join(ws, "projects", ep);
    const sc = parseOrThrow(Script, JSON.parse(readFileSync(path.join(dir, "script.json"), "utf8")), "s");
    writeFileSync(path.join(dir, "build", "timing.json"), JSON.stringify(layoutTiming(sc))); // như sau khi tạo giọng lại
    const old = parseOrThrow(Storyboard, JSON.parse(readFileSync(path.join(dir, "storyboard.json"), "utf8")), "sb");
    const logs: string[] = [];
    const r = await aiStoryboard(null, workspacePaths(ws), ep, { blocks: ["b02"], log: (l) => logs.push(l) });
    const b1 = old.shots.filter((s) => typeof s.t0 === "number" || Number(String(s.t0).slice(1).split(".")[0]) <= 7);
    for (const s of b1.slice(0, -1)) expect(r.storyboard.shots.find((x) => x.id === s.id)).toEqual(s);
    expect(r.storyboard.shots.some((s) => s.id.startsWith("b02_S"))).toBe(true);
    expect(r.issues.filter((i) => i.level === "error")).toEqual([]);
    const list = (await api("GET", `/api/projects/${ep}/blocks`)).json;
    expect(list.ready).toBe(true);
    expect(list.blocks[1].lines.map((l: any) => l.id)).toContain("L15");
  });
});
