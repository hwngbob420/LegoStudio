// Server Lego Studio Engine: API tập + kho + việc nền; phục vụ workspace/ qua HTTP cho Studio và máy chiếu xem trước.
import express, { type NextFunction, type Request, type Response } from "express";
import { existsSync, promises as fs, readFileSync } from "node:fs";
import path from "node:path";
import { z, ZodError } from "zod";
import { writeJsonAtomic } from "./jsonStore";

const CanvasDoc = z.object({ nodes: z.record(z.string(), z.object({ x: z.number(), y: z.number() })), viewport: z.object({ x: z.number(), y: z.number(), zoom: z.number() }).optional() });
import { JobQueue, spawnRunner, type Runner, type Step } from "./jobs";
import { libraryBundle, promoteCast, saveCast } from "./library";
import { check, createProject, listProjects, readProject, saveScript, saveStoryboard } from "./projects";
import { HttpError, REPO, assertValidId, workspacePaths } from "./workspace";
import { makeAI } from "./ai";
import { AiError, type TextAI } from "./ai/types";
import { analyzeStory } from "./aiScript";
import { costSummary } from "./ai";
import { listPending } from "./ai/sessionQueue";
import { LANGS, createShorts, readLocale, saveLocale, translate } from "./publish";
import { aiStoryboard, rewriteShot } from "./aiStoryboard";

export interface AppOptions { workspaceRoot: string; repoRoot?: string; runner?: Runner; now?: () => string; ai?: TextAI }

const PY = process.platform === "win32" ? "python" : "python3";
const NPX = process.platform === "win32" ? "npx.cmd" : "npx";

/** Các việc nền Studio bấm được -> chuỗi lệnh. */
export function jobSteps(kind: string, prod: string, repo: string, opts: { lang?: string } = {}): Step[] {
  const produce = (...a: string[]) => ({ cmd: PY, args: [path.join(repo, "apps/brick-engine/produce.py"), prod, ...a], label: kind });
  const blender = (script: string) => ({ cmd: PY, args: [path.join(repo, "apps/brick-engine/gpu_renderer.py"), "--script", script], label: script });
  switch (kind) {
    case "tts": return [{ cmd: PY, args: [path.join(repo, "apps/brick-engine/tts_sapi.py"), prod], label: "tts" }];
    case "contact": return [produce("--from", "bake", "--to", "contact", "--force")];
    case "publish": return [produce()];
    case "render": return [produce("--from", "bake")];
    case "recut": return [produce("--from", "audio")];
    case "export_lang": {
      if (!opts.lang || !/^[a-z]{2}$/.test(opts.lang)) throw new HttpError(400, "Thiếu mã ngôn ngữ (ví dụ vi, en).");
      return [produce("--from", "overlay", "--to", "composite", "--lang", opts.lang)];
    }
    case "align": return [{ cmd: NPX, args: ["tsx", path.join(repo, "apps/server/src/scripts/align.ts"), prod], label: "align" }];
    case "library": return [
      { cmd: PY, args: [path.join(repo, "apps/brick-engine/face_atlas_gen.py")], label: "faces" },
      { cmd: PY, args: [path.join(repo, "apps/brick-engine/texture_gen.py")], label: "textures" },
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
    return jobs.enqueue(id, String(req.body?.kind ?? ""), jobSteps(String(req.body?.kind ?? ""), prod, repo, { lang: req.body?.lang }));
  }));
  const ai = () => opts.ai ?? makeAI(repo, paths.root);
  app.post("/api/projects/:id/ai/script", h(async (req) => analyzeStory(ai(), paths, String(req.params.id), req.body ?? {})));
  /** AI không cấu hình được thì trả null để rơi về đạo diễn tự động. */
  const aiOrNull = () => { try { return ai(); } catch { return null; } };
  app.post("/api/projects/:id/ai/storyboard", h(async (req) => aiStoryboard(aiOrNull(), paths, String(req.params.id), req.body ?? {})));
  app.post("/api/projects/:id/ai/rewrite-shot", h(async (req) => rewriteShot(aiOrNull(), paths, String(req.params.id), String(req.body?.shot ?? ""), String(req.body?.note ?? ""))));
  app.get("/api/ai/status", h(async () => { try { return { ok: true, id: ai().id }; } catch (e) { return { ok: false, message: (e as Error).message }; } }));

  /** Nạp giọng thật cho một câu (thân yêu cầu là file âm thanh). */
  app.post("/api/projects/:id/voice/:line", express.raw({ type: () => true, limit: "60mb" }), h(async (req) => {
    const id = String(req.params.id), line = String(req.params.line);
    assertValidId(id, "ID tập");
    if (!/^L\d{1,3}$/.test(line)) throw new HttpError(400, "Mã câu không hợp lệ.");
    const ct = String(req.headers["content-type"] ?? "");
    const ext = /mpeg|mp3/.test(ct) ? "mp3" : /ogg/.test(ct) ? "ogg" : /m4a|mp4|aac/.test(ct) ? "m4a" : "wav";
    const dir = path.join(paths.projectDir(id), "voice");
    await fs.mkdir(dir, { recursive: true });
    for (const f of (await fs.readdir(dir)).filter((f) => f.startsWith(`${line}.`))) await fs.rm(path.join(dir, f));
    await fs.writeFile(path.join(dir, `${line}.${ext}`), req.body as Buffer);
    return { ok: true, file: `voice/${line}.${ext}`, bytes: (req.body as Buffer).length };
  }));

  // ---- phụ đề đa ngôn ngữ, Shorts, chi phí AI, Hộp thư Claude
  app.get("/api/langs", h(async () => LANGS));
  app.get("/api/projects/:id/locale/:lang", h(async (req) => readLocale(paths, String(req.params.id), String(req.params.lang))));
  app.put("/api/projects/:id/locale/:lang", h(async (req) => saveLocale(paths, String(req.params.id), { ...req.body, lang: String(req.params.lang) })));
  app.post("/api/projects/:id/ai/translate", h(async (req) => translate(ai(), paths, String(req.params.id), String(req.body?.lang ?? ""))));
  app.post("/api/projects/:id/shorts", h(async (req) => {
    const r = await createShorts(paths, String(req.params.id), now());
    const job = jobs.enqueue(r.id, "render", jobSteps("render", paths.projectDir(r.id), repo));
    return { ...r, job };
  }));
  app.get("/api/costs", h(async () => costSummary(path.join(paths.root, "cost_log.jsonl"))));
  app.get("/api/ai/queue", h(async () => listPending(path.join(paths.root, "claude_queue"))));

  app.get("/api/jobs", h(async (req) => jobs.list(typeof req.query.project === "string" ? req.query.project : undefined)));
  app.get("/api/jobs/:id", h(async (req) => {
    const j = jobs.get(String(req.params.id));
    if (!j) throw new HttpError(404, "Không thấy việc này.");
    return j;
  }));
  /** Sơ đồ tập trong Xưởng: chỉ lưu vị trí nút (dữ liệu thật vẫn ở storyboard). */
  app.get("/api/projects/:id/canvas", h(async (req) => {
    assertValidId(String(req.params.id), "ID tập");
    const f = path.join(paths.projectDir(String(req.params.id)), "canvas.json");
    return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : { nodes: {} };
  }));
  app.put("/api/projects/:id/canvas", h(async (req) => {
    assertValidId(String(req.params.id), "ID tập");
    return writeJsonAtomic(path.join(paths.projectDir(String(req.params.id)), "canvas.json"), CanvasDoc, req.body);
  }));
  app.get("/api/projects/:id/qa", h(async (req) => {
    const f = path.join(paths.projectDir(String(req.params.id)), "build", "qa_report.json");
    return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
  }));

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err instanceof AiError) return res.status(err.status).json({ error: err.message });
    if (err instanceof ZodError) return res.status(400).json({ error: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
    console.error(err);
    res.status(500).json({ error: (err as Error)?.message ?? "Lỗi không rõ" });
  });
  return { app, jobs, paths };
}
