// Đối chiếu: camera Three.js của máy chiếu xem trước phải chiếu hộp đầu trùng với bộ đạo diễn (và do đó với Blender).
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { bake, RigModel } from "@lse/director";
import { loadLibrary } from "@lse/director/io";
import { Storyboard, Timing, parseOrThrow } from "@lse/shared";
import { headBoxThree, worldFrame } from "./previewMath";

const ROOT = path.resolve(__dirname, "../../../..");
const read = (p: string) => JSON.parse(readFileSync(path.join(ROOT, p), "utf8"));
const lib = loadLibrary(path.join(ROOT, "workspace/channel_library"));
const T = bake({
  storyboard: parseOrThrow(Storyboard, read("workspace/projects/showcase_v1/storyboard.json"), "sb"),
  timing: parseOrThrow(Timing, read("tests/fixtures/showcase_timing.json"), "timing"),
  ...lib,
});
const rig = new RigModel(lib.manifest);

describe("Three.js preview camera parity", () => {
  it("projects every sampled head box within 0.5% of the director (=Blender) prediction", () => {
    let worst = 0;
    for (const q of T.qa)
      for (const s of q.samples)
        for (const [aid, bb] of Object.entries(s.heads)) {
          const tb = headBoxThree(T, lib.manifest, rig, aid, s.f, 1920, 1080);
          worst = Math.max(worst, ...bb.map((v, i) => Math.abs(v - tb[i])));
        }
    expect(worst).toBeLessThan(0.005);
  });
  it("maps 60 fps output frames onto 12 fps world frames (5 holds per pose)", () => {
    expect(worldFrame(T, 0)).toBe(1);
    expect(worldFrame(T, 4)).toBe(1);
    expect(worldFrame(T, 5)).toBe(2);
  });
});
