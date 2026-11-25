import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { createApp } from "./app";
import { JobQueue, type Runner } from "./jobs";
import { createDebouncedSaver, writeJsonAtomic } from "./jsonStore";
import { REPO } from "./workspace";

const tmp = mkdtempSync(path.join(os.tmpdir(), "lse-ws-"));
const ws = path.join(tmp, "workspace");
let base = "";
let close: () => void;
const calls: string[] = [];
const fakeRunner: Runner = async (step, _cwd, onLine) => {
  calls.push([step.cmd, ...step.args].join(" "));
  onLine("== render ==");
  onLine("[progress] render 6/12");
  return step.args.some((a) => a.includes("FAIL")) ? 1 : 0;
};

beforeAll(async () => {
  cpSync(path.join(REPO, "workspace/channel_library"), path.join(ws, "channel_library"), {
    recursive: true, filter: (s) => !s.includes(`${path.sep}baked`),
  });
  for (const f of ["storyboard.json", "script.json"]) cpSync(path.join(REPO, "workspace/projects/showcase_v1", f), path.join(ws, "projects/showcase_v1", f));
  cpSync(path.join(REPO, "tests/fixtures/showcase_timing.json"), path.join(ws, "projects/showcase_v1/timing.json"));
  const { app } = createApp({ workspaceRoot: ws, runner: fakeRunner, now: () => "2026-11-25T00:00:00.000Z" });
  const server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});
afterAll(() => { close?.(); rmSync(tmp, { recursive: true, force: true }); });

const api = async (method: string, p: string, body?: unknown) => {
  const r = await fetch(base + p, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: (await r.json()) as any };
};

describe("jsonStore", () => {
  it("writes atomically and refuses invalid data", async () => {
    const f = path.join(tmp, "x", "a.json");
    await writeJsonAtomic(f, z.object({ n: z.number() }), { n: 1 });
    expect(JSON.parse(readFileSync(f, "utf8")).n).toBe(1);
    await expect(writeJsonAtomic(f, z.object({ n: z.number() }), { n: "x" })).rejects.toThrow();
    expect(JSON.parse(readFileSync(f, "utf8")).n).toBe(1);
  });
  it("debounce keeps only the last value", async () => {
    const saved: number[] = [];
    const s = createDebouncedSaver<number>(async (v) => { saved.push(v); }, 20);
    s.push(1); s.push(2); s.push(3);
    await s.flush();
    expect(saved).toEqual([3]);
  });
});

describe("API", () => {
  it("lists the showcase and reads it with no layout errors", async () => {
    const list = await api("GET", "/api/projects");
    expect(list.json.map((p: { id: string }) => p.id)).toContain("showcase_v1");
    const st = await api("GET", "/api/projects/showcase_v1");
    expect(st.status).toBe(200);
    expect(st.json.refErrors).toEqual([]);
    expect(st.json.issues.filter((i: { level: string }) => i.level === "error")).toEqual([]);
  });
  it("preview returns a baked timeline the Player can play", async () => {
    const r = await api("GET", "/api/projects/showcase_v1/preview");
    expect(r.status).toBe(200);
    expect(r.json.timeline.frames).toBe(234);
    expect(r.json.overlay.cues.length).toBeGreaterThan(0);
    expect(r.json.voice.L1.url).toMatch(/^\/ws\/projects\/showcase_v1\//);
  });
  it("saving a storyboard with a face-blocking card is allowed but reported; an unknown actor is rejected", async () => {
    const sb = (await api("GET", "/api/projects/showcase_v1")).json.storyboard;
    const bad = structuredClone(sb);
    bad.ui.find((c: { type: string }) => c.type === "brick_chart").zone = "right_third";
    const r1 = await api("PUT", "/api/projects/showcase_v1/storyboard", bad);
    expect(r1.status).toBe(200);
    expect(r1.json.issues.some((i: { code: string }) => i.code === "cue_over_face")).toBe(true);
    const worse = structuredClone(sb);
    worse.cast[0].id = "ghost_actor";
    const r2 = await api("PUT", "/api/projects/showcase_v1/storyboard", worse);
    expect(r2.status).toBe(422);
    expect(r2.json.error).toMatch(/ghost_actor/);
    expect((await api("PUT", "/api/projects/showcase_v1/storyboard", sb)).status).toBe(200);
  });
  it("creates a new episode from the starter template", async () => {
    const r = await api("POST", "/api/projects", { title: "Bữa sáng của Max" });
    expect(r.json.id).toBe("ep01_bua_sang_cua_max");
    const st = await api("GET", `/api/projects/${r.json.id}`);
    expect(st.json.refErrors).toEqual([]);
    expect(st.json.timing).toBeNull();
  });
  it("saves an episode-only minifig, then promotes it to the channel library", async () => {
    const recipe = JSON.parse(readFileSync(path.join(REPO, "workspace/channel_library/cast/max_dev.json"), "utf8"));
    recipe.id = "linh_intern";
    recipe.name = "Linh";
    expect((await api("POST", "/api/library/cast?episode=ep01_bua_sang_cua_max", recipe)).status).toBe(200);
    const lib1 = await api("GET", "/api/library");
    expect(lib1.json.castTier.linh_intern).toBe("ep01_bua_sang_cua_max");
    const pr = await api("POST", "/api/library/promote", { episode: "ep01_bua_sang_cua_max", id: "linh_intern" });
    expect(pr.status).toBe(200);
    const lib2 = await api("GET", "/api/library");
    expect(lib2.json.castTier.linh_intern).toBe("channel");
    expect(lib2.json.catalog.cast.linh_intern.name).toBe("Linh");
    expect(existsSync(path.join(ws, "projects/ep01_bua_sang_cua_max/assets/cast/linh_intern.json"))).toBe(false);
    expect((await api("POST", "/api/library/promote", { episode: "ep01_bua_sang_cua_max", id: "linh_intern" })).status).toBe(404);
  });
  it("queues background jobs one at a time with progress", async () => {
    const j = await api("POST", "/api/projects/showcase_v1/jobs", { kind: "contact" });
    expect(["queued", "running", "done"]).toContain(j.json.status);
    let job = j.json;
    for (let i = 0; i < 50 && job.status !== "done"; i++) {
      await new Promise((r) => setTimeout(r, 20));
      job = (await api("GET", `/api/jobs/${j.json.id}`)).json;
    }
    expect(job.status).toBe("done");
    expect(job.log).toContain("[progress] render 6/12");
    expect(calls.at(-1)).toMatch(/produce\.py .*--from bake --to contact/);
    expect((await api("POST", "/api/projects/showcase_v1/jobs", { kind: "explode" })).status).toBe(400);
  });
});

describe("JobQueue persistence", () => {
  it("marks jobs that were running when the app closed as errors", async () => {
    const file = path.join(tmp, "jobs.json");
    let release!: () => void;
    const slow: Runner = () => new Promise((r) => { release = () => r(0); });
    const q1 = new JobQueue(file, tmp, slow);
    q1.enqueue("p", "render", [{ cmd: "x", args: [], label: "render" }]);
    await new Promise((r) => setTimeout(r, 10));
    const q2 = new JobQueue(file, tmp, fakeRunner);
    expect(q2.list()[0].status).toBe("error");
    release();
  });
});
