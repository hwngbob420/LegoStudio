// Gđ 6: dựng tập thử "ma trận máy" cho các set 3 vòng để render contact sheet thật bằng Blender.
//   npx tsx packages/director/src/matrixCli.ts [SetId ...]   -> workspace/_qa/matrix/<SetId>/ (storyboard, timing, script, build/baked_timeline.json)
import path from "node:path";
import { readFileSync } from "node:fs";
import { bakeProject, writeJsonAtomic, loadLibrary } from "./io";
import { checkStage, floatingObjects, matrixEpisode } from "./layout";

const ROOT = process.cwd();
const libDir = path.join(ROOT, "workspace", "channel_library");
const lib = loadLibrary(libDir);
const cat = JSON.parse(readFileSync(path.join(libDir, "catalog.json"), "utf8"));
const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(lib.manifest.sets).filter((k) => lib.manifest.sets[k].extent !== undefined);
for (const id of ids) {
  const ep = matrixEpisode(id, lib.manifest, ["max_dev", "priya_lead"], undefined, cat.sets[id]?.lighting ?? "studio_bright");
  const dir = path.join(ROOT, "workspace", "_qa", "matrix", id);
  writeJsonAtomic(path.join(dir, "storyboard.json"), ep.storyboard, true);
  writeJsonAtomic(path.join(dir, "timing.json"), ep.timing, true);
  writeJsonAtomic(path.join(dir, "script.json"), ep.script, true);
  const { timeline } = bakeProject(dir);
  const issues = [...floatingObjects(lib.manifest, id), ...checkStage(timeline, ep.storyboard, lib.manifest)];
  console.log(`[matrix] ${id}: ${timeline.shots.length} cảnh, ${issues.length} lỗi bố cục -> ${path.relative(ROOT, dir)}`);
  for (const x of issues) console.log("   " + x.message);
}
