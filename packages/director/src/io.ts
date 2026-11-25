// Đọc file của một tập + kho kênh, kiểm schema, nướng, ghi atomic.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CastRecipe, Storyboard, Timing, parseOrThrow, type BakedTimeline, type Manifest } from "@lse/shared";
import { bake } from "./bake";
import type { FaceSpec } from "./faces";

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const LIBRARY = path.join(REPO, "workspace", "channel_library");

const readJson = (p: string) => JSON.parse(readFileSync(p, "utf8"));

export function writeJsonAtomic(p: string, data: unknown, pretty = false) {
  const tmp = `${p}.tmp`;
  writeFileSync(tmp, pretty ? JSON.stringify(data, null, 1) : JSON.stringify(data));
  renameSync(tmp, p);
}

/** Kho 2 tầng: diễn viên của kho kênh trước, rồi diễn viên riêng của từng tập (assets/cast). Trùng ID thì kho kênh thắng. */
export function castRecipeFiles(lib = LIBRARY): Record<string, string> {
  const out: Record<string, string> = {};
  const dirs = [path.join(lib, "cast")];
  const projects = path.join(path.dirname(lib), "projects");
  if (existsSync(projects)) for (const ep of readdirSync(projects).sort()) {
    const d = path.join(projects, ep, "assets", "cast");
    if (existsSync(d)) dirs.push(d);
  }
  for (const d of dirs) for (const f of readdirSync(d).filter((x) => x.endsWith(".json")).sort()) {
    const id = f.slice(0, -5);
    if (!(id in out)) out[id] = path.join(d, f);
  }
  return out;
}

export function loadLibrary(lib = LIBRARY) {
  const manifest = readJson(path.join(lib, "manifest.json")) as Manifest;
  const faceSpec = readJson(path.join(lib, "faces", "face_atlas_spec.json")) as FaceSpec;
  const defaultExpr: Record<string, string> = {};
  for (const file of Object.values(castRecipeFiles(lib))) {
    const r = parseOrThrow(CastRecipe, readJson(file), path.basename(file));
    defaultExpr[r.id] = r.default_expression;
  }
  return { manifest, faceSpec, defaultExpr };
}

/** Tìm timing.json: ở gốc tập (Gđ 3B trở đi) hoặc build/ (TTS bản v1). */
export function timingPath(prod: string) {
  const a = path.join(prod, "timing.json");
  return existsSync(a) ? a : path.join(prod, "build", "timing.json");
}

export function bakeProject(prod: string, lib = LIBRARY): { out: string; timeline: BakedTimeline; sha256: string } {
  const storyboard = parseOrThrow(Storyboard, readJson(path.join(prod, "storyboard.json")), "storyboard.json");
  const timing = parseOrThrow(Timing, readJson(timingPath(prod)), "timing.json");
  const timeline = bake({ storyboard, timing, ...loadLibrary(lib) });
  const text = JSON.stringify(timeline);
  const out = path.join(prod, "build", "baked_timeline.json");
  writeJsonAtomic(out, timeline);
  return { out, timeline, sha256: createHash("sha256").update(text).digest("hex") };
}
