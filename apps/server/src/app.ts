// Server Lego Studio Engine: API tập + kho + việc nền; phục vụ workspace/ qua HTTP cho Studio và máy chiếu xem trước.
import express, { type NextFunction, type Request, type Response } from "express";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { ZodError } from "zod";
import { JobQueue, spawnRunner, type Runner, type Step } from "./jobs";
import { libraryBundle, promoteCast, saveCast } from "./library";
import { check, createProject, listProjects, readProject, saveScript, saveStoryboard } from "./projects";
import { HttpError, REPO, assertValidId, workspacePaths } from "./workspace";

export interface AppOptions { workspaceRoot: string; repoRoot?: string; runner?: Runner; now?: () => string }

const PY = process.platform === "win32" ? "python" : "python3";
const NPX = process.platform === "win32" ? "npx.cmd" : "npx";

/** Các việc nền Studio bấm được -> chuỗi lệnh. */
export function jobSteps(kind: string, prod: string, repo: string): Step[] {
  const produce = (...a: string[]) => ({ cmd: PY, args: [path.join(repo, "apps/brick-engine/produce.py"), prod, ...a], label: kind });
  const blender = (script: string) => ({ cmd: PY, args: [path.join(repo, "apps/brick-engine/gpu_renderer.py"), "--script", script], label: script });
  switch (kind) {
    case "tts": return [{ cmd: PY, args: [path.join(repo, "apps/brick-engine/tts_sapi.py"), prod], label: "tts" }];
    case "contact": return [produce("--from", "bake", "--to", "contact", "--force")];
    case "publish": return [produce()];
    case "render": return [produce("--from", "bake")];
    case "recut": return [produce("--from", "audio")];
    case "library": return [
      { cmd: PY, args: [path.join(repo, "bootstrap_studio.py")], label: "textures" },
      blender("export_manifest.py"), blender("export_glb.py"),
    ];
    default: throw new HttpError(400, `Việc không hỗ trợ: ${kind}`);
  }
}

export function createApp(opts: AppOptions) {
  const paths = workspacePaths(opts.workspaceRoot);
  const repo = opts.repoRoot ?? REPO;
  const now = opts.now ?? (() => new Date().toISOString());
  const jobs = new JobQueue(paths.jobsFile, repo, opts.runner ?? spawnRunner, undefined, now);
  const app = express();
  app.use(express.json({ limit: "20mb" }));
  app.use("/baked", express.static(paths.baked, { maxAge: "1h" }));
  app.use("/ws", express.static(paths.root));

  const h = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).then((v) => { if (!res.headersSent) res.json(v ?? { ok: true }); }).catch(next);

  app.get("/api/health", h(async () => ({ ok: true, version: "2.0.0" })));
  app.get("/api/library", h(async () => libraryBundle(paths)));
  app.post("/api/library/cast", h(async (req) => saveCast(paths, req.body, typeof req.query.episode === "string" ? req.query.episode : undefined)));
  app.post("/api/library/promote", h(async (req) => promoteCast(paths, String(req.body?.episode ?? ""), String(req.body?.id ?? ""))));

  app.get("/api/projects", h(async () => listProjects(paths)));
  app.post("/api/projects", h(async (req) => createProject(paths, String(req.body?.title ?? ""), now())));
  app.get("/api/projects/:id", h(async (req) => readProject(paths, String(req.params.id))));
  app.put("/api/projects/:id/script", h(async (req) => saveScript(paths, String(req.params.id), req.body)));
  app.put("/api/projects/:id/storyboard", h(async (req) => saveStoryboard(paths, String(req.params.id), req.body)));
  /** Dữ liệu cho Player: timeline nướng + kho + props lớp chữ (nướng lại ngay, không cần Blender). */
  app.get("/api/projects/:id/preview", h(async (req) => {
    const st = await readProject(paths, String(req.params.id));
    const r = await check(paths, String(req.params.id), st.storyboard, st.timing);
    if (!r.timeline) throw new HttpError(409, r.refErrors[0] ?? r.issues[0]?.message ?? "Chưa xem trước được.");
    const lib = libraryBundle(paths);
    const voice = st.timing ? Object.fromEntries(Object.entries(st.timing.lines).map(([k, L]) => [k, { url: `/ws/projects/${req.params.id}/${L.wav}`, start: L.wav_start }])) : {};
    return { timeline: r.timeline, overlay: r.overlay, issues: r.issues, voice,
      library: { manifest: lib.manifest, faceSpec: lib.faceSpec, palette: lib.palette, cast: lib.cast, lighting: lib.lighting } };
  }));
  app.post("/api/projects/:id/jobs", h(async (req) => {
    const id = String(req.params.id);
    assertValidId(id, "ID tập");
    const prod = paths.projectDir(id);
    if (!existsSync(prod)) throw new HttpError(404, `Không thấy tập "${id}".`);
    return jobs.enqueue(id, String(req.body?.kind ?? ""), jobSteps(String(req.body?.kind ?? ""), prod, repo));
  }));
  app.get("/api/jobs", h(async (req) => jobs.list(typeof req.query.project === "string" ? req.query.project : undefined)));
  app.get("/api/jobs/:id", h(async (req) => {
    const j = jobs.get(String(req.params.id));
    if (!j) throw new HttpError(404, "Không thấy việc này.");
    return j;
  }));
  app.get("/api/projects/:id/qa", h(async (req) => {
    const f = path.join(paths.projectDir(String(req.params.id)), "build", "qa_report.json");
    return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
  }));

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err instanceof ZodError) return res.status(400).json({ error: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
    console.error(err);
    res.status(500).json({ error: (err as Error)?.message ?? "Lỗi không rõ" });
  });
  return { app, jobs, paths };
}
