// Bake các tập đã commit trong bộ nhớ (không ghi file) để test hồi quy: tập cũ phải nướng ra y hệt từng byte.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Storyboard, Timing, parseOrThrow } from "@lse/shared";
import { bake } from "./bake";
import { loadLibrary, timingPath } from "./io";

export const GOLDEN_EPISODES = ["showcase_v1", "showcase_v1_shorts", "ep01_foam_physics", "ep02_the_to_do_list_trap"];

export function goldenHashes(root: string) {
  const lib = loadLibrary(path.join(root, "workspace", "channel_library"));
  const out: Record<string, { sha256: string; blocks: string[] }> = {};
  for (const ep of GOLDEN_EPISODES) {
    const prod = path.join(root, "workspace", "projects", ep);
    if (!existsSync(path.join(prod, "storyboard.json"))) continue;
    const sb = parseOrThrow(Storyboard, JSON.parse(readFileSync(path.join(prod, "storyboard.json"), "utf8")), ep);
    const tm = parseOrThrow(Timing, JSON.parse(readFileSync(timingPath(prod), "utf8")), ep);
    const T = bake({ storyboard: sb, timing: tm, ...lib });
    out[ep] = { sha256: createHash("sha256").update(JSON.stringify(T)).digest("hex"), blocks: (T.blocks ?? []).map((b) => b.hash) };
  }
  return out;
}

if (process.argv[1] && /legacyGolden\.ts$/.test(process.argv[1])) {
  console.log(JSON.stringify(goldenHashes(path.resolve(process.argv[2] ?? ".")), null, 1));
}
