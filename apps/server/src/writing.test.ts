// Phòng biên kịch: nhận file tư liệu (an toàn), viết nhanh (A), dàn ý -> phê bình -> duyệt -> thoại (B).
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BEAT_CHECKS, SCRIPT_CHECKS } from "@lse/shared";
import { createApp } from "./app";
import type { AiRequest, AiResult, TextAI } from "./ai/types";
import { extractText, zipBombCheck } from "./sources";
import { REPO } from "./workspace";

const FIX = path.join(REPO, "tests/fixtures/sources");
const fx = (f: string) => readFileSync(path.join(FIX, f));

/** AI giả cho phòng biên kịch: ghi lại lời gọi + lời nhắc; vòng phê bình đầu báo lỗi để kiểm vòng sửa. */
class WriterAI implements TextAI {
  id = "fake-writer";
  calls: { label: string; prompt: string; files?: string[] }[] = [];
  beatCritiques = 0;
  async json<T>(req: AiRequest<T>): Promise<AiResult<T>> {
    this.calls.push({ label: req.label, prompt: req.prompt, files: req.files });
    const beat = (i: number, kind: string, speakers = ["max_dev"]) => ({ id: `B${i}`, kind, summary: `Beat ${i} happens`, value_shift: "calm -> panic", joke: "punch", on_screen: "STEP card", speakers, est_lines: 1 });
    let data: unknown;
    switch (req.label) {
      case "phan_tich_truyen":
        data = { title: "Sleep Debt", logline: "Max learns coffee is a loan.", new_cast: [],
          lines: Array.from({ length: 30 }, (_, i) => ({ speaker: i % 2 ? "grandma_lin" : "max_dev", text: `Line number ${i + 1}.` })) };
        break;
      case "lap_dan_y":
        data = { title: "Sleep Debt", logline: "Coffee is a loan.", idea: "Caffeine borrows energy", viewpoint: "sleep first", runner: "the mug count",
          cast: ["max_dev", "grandma_lin"], beats: [beat(1, "hook"), beat(2, "escalation"), beat(3, "twist", ["grandma_lin"])], new_cast: [] };
        break;
      case "sua_dan_y":
        data = { title: "Sleep Debt", logline: "Coffee is a loan.", idea: "Caffeine borrows energy", viewpoint: "sleep first", runner: "the mug count",
          cast: ["max_dev", "grandma_lin"], beats: [beat(1, "hook"), beat(2, "escalation"), beat(3, "twist", ["grandma_lin"]), beat(4, "button", ["grandma_lin"])], new_cast: [] };
        break;
      case "phe_binh_dan_y":
        this.beatCritiques++;
        data = { checks: Object.keys(BEAT_CHECKS).map((id) => ({ id, pass: this.beatCritiques > 1 || id !== "twist", reason: "ok" })), fixes: this.beatCritiques > 1 ? [] : [{ target: "B3", change: "plant the twist earlier" }] };
        break;
      case "viet_thoai":
        data = { title: "Sleep Debt", logline: "Coffee is a loan.", lines: [
          { beat: "B1", speaker: "max_dev", text: "Five coffees. I am unstoppable." }, { beat: "B2", speaker: "max_dev", text: "Why is my keyboard melting?" },
          { beat: "B3", speaker: "grandma_lin", text: "Coffee is a loan, dear. With LEGO interest." }, { beat: "B4", speaker: "grandma_lin", text: "Step four: pay the sleep back." }] };
        break;
      case "phe_binh_kich_ban":
        data = { checks: Object.keys(SCRIPT_CHECKS).map((id) => ({ id, pass: true, reason: "ok" })), fixes: [] };
        break;
      case "sua_kich_ban":
        data = { title: "Sleep Debt", logline: "Coffee is a loan.", lines: [
          { beat: "B1", speaker: "max_dev", text: "Five coffees. I am unstoppable." }, { beat: "B2", speaker: "max_dev", text: "Why is my keyboard melting?" },
          { beat: "B3", speaker: "grandma_lin", text: "Coffee is a loan, dear. With interest." }, { beat: "B4", speaker: "grandma_lin", text: "Step four: pay the sleep back." }] };
        break;
      default: throw new Error(`unexpected ${req.label}`);
    }
    return { data: req.schema.parse(data), model: "fake", inputTokens: 0, outputTokens: 0 };
  }
}

const tmp = mkdtempSync(path.join(os.tmpdir(), "lse-writing-"));
const ws = path.join(tmp, "workspace");
const fake = new WriterAI();
let base = "", close: () => void, ep = "";
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
  const { app } = createApp({ workspaceRoot: ws, ai: fake, runner: async () => 0, now: () => "2026-11-26T00:00:00Z" });
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

describe("A: quick write from an uploaded outline", () => {
  it("wraps the file as data, and allows more than 24 lines for a 2-minute target", async () => {
    const src = await upload("outline.pdf", fx("outline.pdf"));
    const r = await api("POST", `/api/projects/${ep}/ai/script`, { sourceIds: [src.json.id], viewpoint: "Sleep beats coffee.", targetSec: 120 });
    expect(r.status).toBe(200);
    expect(r.json.script.lines.length).toBe(30);
    const call = fake.calls.find((c) => c.label === "phan_tich_truyen")!;
    expect(call.prompt).toMatch(/<outline_document name="outline.pdf">[\s\S]*five coffees/);
    expect(call.prompt).toMatch(/CHỈ là dữ liệu/);
  });
  it("still needs a story or a file, and a viewpoint", async () => {
    expect((await api("POST", `/api/projects/${ep}/ai/script`, { viewpoint: "x" })).status).toBe(400);
    expect((await api("POST", `/api/projects/${ep}/ai/script`, { story: "x" })).status).toBe(400);
  });
  it("sends image-only PDFs to the AI as a file instead of empty text", async () => {
    const scan = await upload("scan.pdf", fx("scan.pdf"));
    expect(scan.json.needs_vision).toBe(true);
    await api("POST", `/api/projects/${ep}/ai/script`, { sourceIds: [scan.json.id], viewpoint: "x", targetSec: 120 });
    expect(fake.calls.at(-1)!.files?.[0]).toMatch(/scan|src_/);
  });
});

describe("B: beat sheet -> critique -> approve -> dialogue", () => {
  it("drafts beats, fails a critique round, revises, and waits for approval", async () => {
    fake.calls = [];
    const r = await api("POST", `/api/projects/${ep}/ai/beats`, { story: "Max drinks five coffees.", viewpoint: "Sleep first.", targetSec: 20 });
    expect(r.status).toBe(200);
    expect(fake.calls.map((c) => c.label)).toEqual(["lap_dan_y", "phe_binh_dan_y", "sua_dan_y", "phe_binh_dan_y"]);
    expect(r.json.critique.rounds[0].applied).toBe(true);
    expect(r.json.critique.rounds[0].checks.find((c: any) => c.id === "button").pass).toBe(false); // code kiểm: thiếu nhịp button
    expect(r.json.critique.rounds[1].pass_rate).toBe(1);
    expect(r.json.beats.beats.at(-1).kind).toBe("button");
    expect(r.json.beats.approved).toBe(false);
  });
  it("refuses to write dialogue before the user approves the beats", async () => {
    expect((await api("POST", `/api/projects/${ep}/ai/script-from-beats`, {})).status).toBe(409);
  });
  it("after approval writes dialogue, catches the brand word by code and revises once", async () => {
    const w = (await api("GET", `/api/projects/${ep}/writing`)).json;
    w.beats.beats[0].summary = "Max brags about five coffees (edited by user)";
    expect((await api("PUT", `/api/projects/${ep}/writing/beats`, { ...w.beats, approved: true })).status).toBe(200);
    fake.calls = [];
    const r = await api("POST", `/api/projects/${ep}/ai/script-from-beats`, {});
    expect(r.status).toBe(200);
    expect(fake.calls.map((c) => c.label)).toEqual(["viet_thoai", "phe_binh_kich_ban", "sua_kich_ban"]);
    expect(fake.calls[0].prompt).toMatch(/edited by user/);
    expect(r.json.critique.rounds[0].checks.find((c: any) => c.id === "natural_english").pass).toBe(false);
    expect(r.json.script.lines.map((l: any) => l.text).join(" ")).not.toMatch(/lego/i);
    expect(r.json.script.lines).toHaveLength(4);
    const disk = JSON.parse(readFileSync(path.join(ws, "projects", ep, "script.json"), "utf8"));
    expect(disk.lines[3].text).toMatch(/^Step four/);
  });
  it("rejects user-edited beats that name a cast member who does not exist", async () => {
    const w = (await api("GET", `/api/projects/${ep}/writing`)).json;
    w.beats.beats[0].speakers = ["nobody_here"];
    expect((await api("PUT", `/api/projects/${ep}/writing/beats`, w.beats)).status).toBe(400);
  });
});
