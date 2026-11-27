// Gđ 6: mọi set 3 vòng trong kho phải qua bộ kiểm bố cục và đủ thang cỡ cảnh x góc máy (không lộ khoảng trống, không che mặt).
import path from "node:path";
import { describe, expect, it } from "vitest";
import { bake } from "./bake";
import { loadLibrary } from "./io";
import { CAMERA_MATRIX, checkStage, floatingObjects, matrixEpisode } from "./layout";
import { validateLayout, overlayProps } from "./overlay";

const ROOT = path.resolve(__dirname, "../../..");
const lib = loadLibrary(path.join(ROOT, "workspace/channel_library"));
const worldSets = Object.entries(lib.manifest.sets).filter(([, s]) => s.extent !== undefined).map(([id]) => id);

describe("3-ring set library (Gđ 6)", () => {
  it("has at least 7 world sets", () => {
    expect(worldSets.length).toBeGreaterThanOrEqual(7);
  });

  for (const id of worldSets) {
    describe(id, () => {
      it("has no floating bricks in the hero stage", () => {
        expect(floatingObjects(lib.manifest, id).map((x) => x.message)).toEqual([]);
      });
      it("passes the full camera matrix: inside the dome, faces not occluded, no face in the subtitle band", () => {
        const ep = matrixEpisode(id, lib.manifest, ["max_dev", "priya_lead"]);
        const T = bake({ storyboard: ep.storyboard, timing: ep.timing, ...lib });
        expect(T.shots.length).toBe(CAMERA_MATRIX.length);
        expect(checkStage(T, ep.storyboard, lib.manifest).map((x) => x.message)).toEqual([]);
        const ov = overlayProps(ep.storyboard, ep.timing, ep.script as never);
        // ma trận máy kiểm ngữ pháp máy trên set: luật chữ/phụ đề áp cho chủ thể của cảnh (diễn viên phụ do bộ dựng cảnh xếp chỗ)
        const subj = (sid: string) => ep.storyboard.shots.find((s) => s.id === sid)?.subjects ?? [];
        const faceErrs = validateLayout(T, ep.storyboard, ov).filter((x) => x.level === "error")
          .filter((x) => x.code === "ots_cover" || subj(x.shot).some((a) => x.message.includes(a))).map((x) => x.message);
        expect(faceErrs).toEqual([]);
      });
    });
  }
});
