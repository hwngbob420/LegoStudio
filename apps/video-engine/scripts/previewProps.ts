// npx tsx apps/video-engine/scripts/previewProps.ts <thư mục tập>  -> build/preview_props.json
// Gói timeline đã nướng + những gì máy chiếu xem trước cần từ kho kênh (manifest, màu, ánh sáng, công thức).
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const LIB = path.join(REPO, "workspace", "channel_library");
const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));

export function buildPreviewProps(prod: string) {
  const timeline = read(path.join(prod, "build", "baked_timeline.json"));
  const cast: Record<string, unknown> = {};
  for (const f of readdirSync(path.join(LIB, "cast")).filter((x) => x.endsWith(".json"))) {
    const r = read(path.join(LIB, "cast", f));
    cast[r.id] = { skin: r.skin, torso: r.torso, face_details: r.face_details ?? [] };
  }
  const lighting: Record<string, unknown> = {};
  for (const f of readdirSync(path.join(LIB, "lighting")).filter((x) => x.endsWith(".json"))) lighting[f.slice(0, -5)] = read(path.join(LIB, "lighting", f));
  return {
    timeline,
    library: {
      manifest: read(path.join(LIB, "manifest.json")),
      faceSpec: read(path.join(LIB, "faces", "face_atlas_spec.json")),
      palette: read(path.join(LIB, "palette.json")),
      cast,
      lighting,
    },
  };
}

if (process.argv[2]) {
  const prod = path.resolve(process.argv[2]);
  const out = path.join(prod, "build", "preview_props.json");
  writeFileSync(out, JSON.stringify(buildPreviewProps(prod)));
  console.log("preview props ->", out);
}
