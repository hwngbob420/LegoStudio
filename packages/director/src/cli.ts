// npx tsx packages/director/src/cli.ts <thư mục tập>   -> build/baked_timeline.json + build/sfx_events.json
import path from "node:path";
import { bakeProject, writeJsonAtomic } from "./io";

const prod = path.resolve(process.argv[2] ?? "");
if (!process.argv[2]) {
  console.error("Cách dùng: npx tsx packages/director/src/cli.ts workspace/projects/<tập>");
  process.exit(1);
}
const { out, timeline, sha256 } = bakeProject(prod);
writeJsonAtomic(path.join(prod, "build", "sfx_events.json"), timeline.sfx, true);
console.log(`[director] ${timeline.frames} khung @ ${timeline.fps} fps, ${Object.keys(timeline.actors).length} diễn viên, ` +
  `${timeline.shots.length} cảnh -> ${path.relative(process.cwd(), out)} (sha256 ${sha256.slice(0, 12)})`);
