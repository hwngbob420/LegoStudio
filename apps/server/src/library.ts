// Kho kênh: gói dữ liệu cho Studio + máy chiếu xem trước, và "Lưu sang kho kênh" (promote) cho diễn viên riêng của tập.
import { existsSync, promises as fs, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { castRecipeFiles } from "@lse/director/io";
import { CastRecipe, Catalog, parseOrThrow } from "@lse/shared";
import { readJson, writeJsonAtomic } from "./jsonStore";
import { HttpError, assertValidId, type WorkspacePaths } from "./workspace";

const readj = (p: string) => JSON.parse(readFileSync(p, "utf8"));

export function libraryBundle(paths: WorkspacePaths) {
  const lib = paths.library;
  const cast: Record<string, unknown> = {};
  const castTier: Record<string, string> = {};
  for (const [cid, file] of Object.entries(castRecipeFiles(lib))) {
    cast[cid] = readj(file);
    castTier[cid] = file.startsWith(path.join(lib, "cast")) ? "channel" : path.basename(path.dirname(path.dirname(path.dirname(file))));
  }
  const dirJson = (d: string) => Object.fromEntries(readdirSync(path.join(lib, d)).filter((f) => f.endsWith(".json")).map((f) => [f.slice(0, -5), readj(path.join(lib, d, f))]));
  return {
    catalog: readj(path.join(lib, "catalog.json")),
    cast, castTier,
    sets: dirJson("sets"),
    lighting: dirJson("lighting"),
    palette: readj(path.join(lib, "palette.json")),
    faceSpec: readj(path.join(lib, "faces", "face_atlas_spec.json")),
    manifest: readj(path.join(lib, "manifest.json")),
    bakedReady: existsSync(path.join(paths.baked, "glb")),
  };
}

/** Lưu công thức minifig: vào kho tập (mặc định) hoặc kho kênh. */
export async function saveCast(paths: WorkspacePaths, body: unknown, episode?: string) {
  const r = (() => { try { return parseOrThrow(CastRecipe, body, "Minifig"); } catch (e) { throw new HttpError(400, (e as Error).message); } })();
  assertValidId(r.id, "ID diễn viên");
  const dir = episode ? paths.episodeCast(episode) : path.join(paths.library, "cast");
  if (episode) assertValidId(episode, "ID tập");
  await writeJsonAtomic(path.join(dir, `${r.id}.json`), CastRecipe, r);
  if (!episode) await registerInCatalog(paths, r);
  return r;
}

async function registerInCatalog(paths: WorkspacePaths, r: CastRecipe) {
  const file = path.join(paths.library, "catalog.json");
  const cat = await readJson(file, Catalog);
  cat.cast[r.id] = { ...(cat.cast[r.id] ?? {}), name: r.name, vibe: r.vibe, default_expr: r.default_expression };
  await writeJsonAtomic(file, Catalog, cat);
}

/** Chuyển diễn viên riêng của tập sang kho kênh: chép công thức, cập nhật catalog, xoá bản ở tập. */
export async function promoteCast(paths: WorkspacePaths, episode: string, castId: string) {
  assertValidId(episode, "ID tập");
  assertValidId(castId, "ID diễn viên");
  const src = path.join(paths.episodeCast(episode), `${castId}.json`);
  if (!existsSync(src)) throw new HttpError(404, `Tập "${episode}" không có diễn viên riêng "${castId}".`);
  const dst = path.join(paths.library, "cast", `${castId}.json`);
  if (existsSync(dst)) throw new HttpError(409, `Kho kênh đã có diễn viên "${castId}". Đổi ID trước khi lưu sang kho kênh.`);
  const r = await readJson(src, CastRecipe);
  await writeJsonAtomic(dst, CastRecipe, r);
  await registerInCatalog(paths, r);
  await fs.rm(src);
  return r;
}
