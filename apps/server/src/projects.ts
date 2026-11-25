// Tập phim: tạo, đọc, lưu kịch bản/storyboard (kiểm schema + ID có thật), nướng timeline, kiểm bố cục.
import { existsSync, promises as fs, readFileSync } from "node:fs";
import path from "node:path";
import { bake, overlayProps, validateLayout, type Issue } from "@lse/director";
import { castRecipeFiles, loadLibrary, timingPath } from "@lse/director/io";
import {
  CastRecipe, Catalog, Project, Script, Storyboard, Timing, parseOrThrow, storyboardRefErrors,
  type BakedTimeline,
} from "@lse/shared";
import { readJson, writeJsonAtomic } from "./jsonStore";
import { HttpError, assertValidId, type WorkspacePaths } from "./workspace";

export function slugify(title: string): string {
  return title.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "d")
    .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
}

export function nextProjectId(existing: string[], title: string): string {
  let max = 0;
  for (const id of existing) {
    const m = /^ep(\d+)_/.exec(id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `ep${String(max + 1).padStart(2, "0")}_${slugify(title) || "tap_moi"}`;
}

export async function listProjects(paths: WorkspacePaths) {
  const entries = await fs.readdir(paths.projects, { withFileTypes: true }).catch(() => []);
  const out: { id: string; title: string; hasVideo: boolean }[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const dir = paths.projectDir(e.name);
    if (!existsSync(path.join(dir, "storyboard.json"))) continue;
    let title = e.name;
    try { title = (await readJson(path.join(dir, "project.json"), Project)).title; } catch {
      try { title = (await readJson(path.join(dir, "storyboard.json"), Storyboard)).title; } catch { /* bỏ qua */ }
    }
    out.push({ id: e.name, title, hasVideo: existsSync(path.join(dir, "output_final.mp4")) });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/** Tập mới có sẵn một kịch bản mẫu 2 câu và storyboard 2 cảnh, để bấm "Tạo giọng" là xem được ngay. */
export async function createProject(paths: WorkspacePaths, title: string, now: string) {
  const t = title.trim();
  if (!t) throw new HttpError(400, "Tên tập không được để trống.");
  const id = nextProjectId((await listProjects(paths)).map((p) => p.id), t);
  assertValidId(id, "ID tập");
  const dir = paths.projectDir(id);
  if (existsSync(dir)) throw new HttpError(409, `Tập "${id}" đã tồn tại.`);
  await fs.mkdir(path.join(dir, "assets", "cast"), { recursive: true });
  await writeJsonAtomic(path.join(dir, "project.json"), Project, { id, title: t, created: now });
  await writeJsonAtomic(path.join(dir, "script.json"), Script, {
    title: t, fps_world: 12, start_offset: 2.2, tail: 1.0,
    lines: [
      { id: "L1", speaker: "classic_yellow", text: "Hi! Welcome to a brand new brick episode.", gap_before: 0 },
      { id: "L2", speaker: "max_dev", text: "Great. Another one.", gap_before: 0.35 },
    ],
  });
  await writeJsonAtomic(path.join(dir, "storyboard.json"), Storyboard, {
    episode: id, title: t, fps_world: 12, fps_out: 60, resolution: [1920, 1080], samples: 32,
    sets: [{ id: "Set_BrickCreatorDesk", lighting: "studio_bright" }],
    cast: [
      { id: "classic_yellow", set: "Set_BrickCreatorDesk", mark: "priya_mark" },
      { id: "max_dev", set: "Set_BrickCreatorDesk", mark: "max_mark" },
    ],
    shots: [
      { id: "S1", t0: 0, t1: "L1.start-0.1", set: "Set_BrickCreatorDesk", camera: { preset: "assembly_high", move: "push_in" },
        subject_zone: "center", ui_safe_zone: "top_left", key_t: 1.9, assembly: { t0: 0.1, t1: 1.6 },
        actors: { classic_yellow: { appear: 1.8 }, max_dev: { appear: 1.9 } } },
      { id: "S2", t0: "L1.start-0.1", t1: "END", set: "Set_BrickCreatorDesk", subjects: ["max_dev", "classic_yellow"],
        camera: { preset: "two_shot", move: "pull_out" }, subject_zone: "center", ui_safe_zone: "none", whoosh: true,
        actors: { classic_yellow: { acts: [{ a: "wave", t0: "L1.start", t1: "L1.end" }], expr: [{ t: 0, e: "happy_closed" }] },
          max_dev: { acts: [{ a: "slump_tired", t0: "L2.start", t1: "END" }], expr: [{ t: 0, e: "deadpan_tired" }] } } },
    ],
    ui: [{ type: "step_badge", t0: 1.0, t1: "S1.t1", zone: "top_left", step: "01", title: t.slice(0, 22) }],
    sfx: [],
  });
  return { id, title: t };
}

export interface ProjectState {
  project: Project | null;
  script: Script | null;
  storyboard: Storyboard;
  timing: Timing | null;
  issues: Issue[];
  refErrors: string[];
  hasVideo: boolean;
  hasContact: boolean;
}

function catalog(paths: WorkspacePaths): Promise<Catalog> {
  return readJson(path.join(paths.library, "catalog.json"), Catalog);
}

/** Danh mục kho kênh + diễn viên riêng của tập (kho 2 tầng) để kiểm ID. */
async function catalogWithEpisodeCast(paths: WorkspacePaths, id: string): Promise<Catalog> {
  const cat = structuredClone(await catalog(paths));
  const dir = paths.episodeCast(id);
  if (existsSync(dir)) for (const f of (await fs.readdir(dir)).filter((x) => x.endsWith(".json"))) {
    const r = await readJson(path.join(dir, f), CastRecipe);
    if (!cat.cast[r.id]) cat.cast[r.id] = { name: r.name, vibe: r.vibe, default_expr: r.default_expression };
  }
  return cat;
}

export async function readProject(paths: WorkspacePaths, id: string): Promise<ProjectState> {
  assertValidId(id, "ID tập");
  const dir = paths.projectDir(id);
  if (!existsSync(path.join(dir, "storyboard.json"))) throw new HttpError(404, `Không thấy tập "${id}".`);
  const opt = async <T>(f: string, s: Parameters<typeof readJson<T>>[1]) => (existsSync(path.join(dir, f)) ? readJson<T>(path.join(dir, f), s) : null);
  const storyboard = await readJson(path.join(dir, "storyboard.json"), Storyboard);
  const tp = timingPath(dir);
  const timing = existsSync(tp) ? await readJson(tp, Timing) : null;
  const { issues, refErrors } = await check(paths, id, storyboard, timing);
  return {
    project: await opt("project.json", Project), script: await opt("script.json", Script), storyboard, timing, issues, refErrors,
    hasVideo: existsSync(path.join(dir, "output_final.mp4")), hasContact: existsSync(path.join(dir, "contact_sheet.jpg")),
  };
}

const castNames = (lib: string) => {
  const out: Record<string, string> = {};
  for (const [cid, f] of Object.entries(castRecipeFiles(lib))) {
    try { out[cid] = JSON.parse(readFileSync(f, "utf8")).name; } catch { out[cid] = cid; }
  }
  return out;
};

/** Nướng + kiểm bố cục (không cần Blender). Trả timeline để máy chiếu xem trước dùng ngay. */
export async function check(paths: WorkspacePaths, id: string, sb: Storyboard, timing: Timing | null) {
  const refErrors = storyboardRefErrors(sb, await catalogWithEpisodeCast(paths, id));
  if (!timing) return { issues: [{ level: "warn", shot: "-", code: "short_shot", message: "Chưa có giọng đọc: bấm \"Tạo giọng\" để có mốc giờ." } as Issue], refErrors, timeline: null };
  if (refErrors.length) return { issues: [] as Issue[], refErrors, timeline: null };
  try {
    const lib = loadLibrary(paths.library);
    const timeline = bake({ storyboard: sb, timing, ...lib });
    const ov = overlayProps(sb, timing, castNames(paths.library));
    return { issues: validateLayout(timeline, sb, ov), refErrors, timeline, overlay: ov };
  } catch (e) {
    return { issues: [] as Issue[], refErrors: [`Không nướng được: ${(e as Error).message}`], timeline: null };
  }
}

export async function saveScript(paths: WorkspacePaths, id: string, body: unknown) {
  assertValidId(id, "ID tập");
  return writeJsonAtomic(path.join(paths.projectDir(id), "script.json"), Script, parseOrThrow(Script, body, "Kịch bản"));
}

export async function saveStoryboard(paths: WorkspacePaths, id: string, body: unknown) {
  assertValidId(id, "ID tập");
  let sb: Storyboard;
  try { sb = parseOrThrow(Storyboard, body, "Storyboard"); } catch (e) { throw new HttpError(400, (e as Error).message); }
  const dir = paths.projectDir(id);
  const tp = timingPath(dir);
  const timing = existsSync(tp) ? await readJson(tp, Timing) : null;
  const res = await check(paths, id, sb, timing);
  if (res.refErrors.length) throw new HttpError(422, res.refErrors.join(" "));
  await writeJsonAtomic(path.join(dir, "storyboard.json"), Storyboard, sb);
  if (res.timeline) await fs.writeFile(path.join(dir, "build", "baked_timeline.json"), JSON.stringify(res.timeline)).catch(async () => {
    await fs.mkdir(path.join(dir, "build"), { recursive: true });
    await fs.writeFile(path.join(dir, "build", "baked_timeline.json"), JSON.stringify(res.timeline));
  });
  return { storyboard: sb, issues: res.issues };
}

export type { BakedTimeline };
