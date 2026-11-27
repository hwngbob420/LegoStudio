// Gđ 6: ngữ pháp máy quay đầy đủ + dàn cảnh nhiều set (cutaway, diễn viên chuyển set, lịch hiện/ẩn hợp nhất).
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Storyboard, Timing, parseOrThrow, type Manifest, type V3 } from "@lse/shared";
import { bake } from "./bake";
import { ANGLE_ELEVATION, planCamera, project } from "./camera";
import { loadLibrary } from "./io";
import { cutawayHidden, rayBox, rayThrough, setOrigins, usesStage, visibilitySchedule } from "./stage";

const ROOT = path.resolve(__dirname, "../../..");
const read = (p: string) => JSON.parse(readFileSync(path.join(ROOT, p), "utf8"));
const lib = loadLibrary(path.join(ROOT, "workspace/channel_library"));
const timing = parseOrThrow(Timing, read("tests/fixtures/showcase_timing.json"), "timing");
const W = 1920, H = 1080;
const head: V3 = [0, 0, 0.38];
const finite = (k: number[]) => k.every((x) => Number.isFinite(x));

describe("camera grammar (Gđ 6)", () => {
  it("every scale x angle gives finite keys and keeps the subject in frame", () => {
    for (const preset of ["ews", "ws", "mls", "ms", "cu"]) {
      for (const angle of Object.keys(ANGLE_ELEVATION)) {
        const p = planCamera({ preset, angle }, 1, 24, [head], ["a"], 0, [0, 0, 0.05], 7, W / H, { floorZ: 0.05, extent: 11 });
        for (const k of p.keys) expect(finite(k)).toBe(true);
        const c = project(head, p.keys[12], p.lens, p.shift, W, H)!;
        expect(c, `${preset}/${angle}`).not.toBeNull();
        expect(c[0]).toBeGreaterThan(0.05); expect(c[0]).toBeLessThan(0.95);
        expect(c[1]).toBeGreaterThan(0.05); expect(c[1]).toBeLessThan(0.95);
        // máy không chui dưới sàn
        for (const k of p.keys) expect(k[2]).toBeGreaterThan(0.05);
      }
    }
  });

  it("scales get tighter from EWS to CU (subject grows on screen)", () => {
    const size = (preset: string) => {
      const p = planCamera({ preset }, 1, 2, [head], ["a"], 0, [0, 0, 0.05], 1, W / H, { floorZ: 0.05, extent: 11 });
      const a = project([0, 0, 0.33], p.keys[0], p.lens, p.shift, W, H)!, b = project([0, 0, 0.43], p.keys[0], p.lens, p.shift, W, H)!;
      return Math.abs(a[1] - b[1]);
    };
    const s = ["ews", "ws", "mls", "ms", "cu"].map(size);
    for (let i = 1; i < s.length; i++) expect(s[i]).toBeGreaterThan(s[i - 1]);
    expect(s[4]).toBeGreaterThan(0.25); // CU: đầu chiếm hơn 1/4 chiều cao khung
  });

  it("low angle looks up, high angle looks down, birds-eye is near vertical without a gimbal flip", () => {
    const camZ = (angle: string) => planCamera({ preset: "mls", angle }, 1, 2, [head], ["a"], 0, [0, 0, 0], 3, W / H, { floorZ: 0 }).keys[0][2];
    expect(camZ("low_angle")).toBeLessThan(camZ("eye_level"));
    expect(camZ("high_angle")).toBeGreaterThan(camZ("eye_level"));
    for (let yaw = -60; yaw <= 60; yaw += 15) {
      const p = planCamera({ preset: "ws", angle: "birds_eye", yaw, shake: 1 }, 1, 48, [head], ["a"], 0, [0, 0, 0], 11, W / H, { floorZ: 0 });
      const roll = p.keys.map((k) => k[1]);
      for (const k of p.keys) expect(finite(k)).toBe(true);
      // trục roll không nhảy (không lật 180 độ giữa cảnh)
      expect(Math.max(...roll) - Math.min(...roll)).toBeLessThan(0.02);
      // nhìn gần như thẳng xuống
      expect(p.keys[0][0]).toBeLessThan(0.3);
    }
  });

  it("OTS puts the listener's head as foreground on the opposite third and the speaker on the zone third", () => {
    const a: V3 = [0, 0.4, 0.38], b: V3 = [0, -0.1, 0.38];
    const p = planCamera({ preset: "ots", subject_zone: "right_third" }, 1, 2, [a, b], ["a", "b"], 0, [0, 0, 0], 5, W / H, { floorZ: 0.05 });
    const pa = project(a, p.keys[0], p.lens, p.shift, W, H)!;
    expect(pa[0]).toBeGreaterThan(0.55);
    // B ở sau lưng máy một chút -> đầu B gần máy, nằm bên trái hoặc ra ngoài mép
    const pb = project([b[0], b[1] + 0.03, b[2]], p.keys[0], p.lens, p.shift, W, H);
    if (pb) expect(pb[0]).toBeLessThan(0.5);
    expect(p.focus).toEqual({ actor: "a" });
  });

  it("new moves are deterministic and actually move", () => {
    for (const move of ["dolly_in", "dolly_out", "truck_pan", "crane_reveal"]) {
      const p1 = planCamera({ preset: "ms", move }, 1, 24, [head], ["a"], 0, [0, 0, 0], 9, W / H, { floorZ: 0.05 });
      const p2 = planCamera({ preset: "ms", move }, 1, 24, [head], ["a"], 0, [0, 0, 0], 9, W / H, { floorZ: 0.05 });
      expect(p1.keys).toEqual(p2.keys);
      const a = p1.keys[0], z = p1.keys[23];
      expect(Math.hypot(a[0] - z[0], a[1] - z[1], a[2] - z[2]), move).toBeGreaterThan(0.02);
    }
  });
});

describe("rays and cutaway", () => {
  it("rayBox hits and misses", () => {
    expect(rayBox([0, -1, 0.5], [0, 2, 0], [-0.5, -0.1, 0, 0.5, 0.1, 1])).not.toBeNull();
    expect(rayBox([0, -1, 2], [0, 2, 0], [-0.5, -0.1, 0, 0.5, 0.1, 1])).toBeNull();
    expect(rayBox([0, -1, 0.5], [0, 0.5, 0], [-0.5, -0.1, 0, 0.5, 0.1, 1], 1e-4, 1)).toBeNull(); // dừng trước hộp
  });

  it("rayThrough is the inverse of project", () => {
    const p = planCamera({ preset: "ms" }, 1, 2, [head], ["a"], 0, [0, 0, 0], 2, W / H, { floorZ: 0 });
    const k = p.keys[0];
    const pt = project(head, k, p.lens, p.shift, W, H)!;
    const d = rayThrough(k, p.lens, p.shift, W, H, pt[0], pt[1]);
    const toHead = [head[0] - k[0], head[1] - k[1], head[2] - k[2]];
    const n = Math.hypot(...toHead);
    expect(d[0]).toBeCloseTo(toHead[0] / n, 4);
    expect(d[1]).toBeCloseTo(toHead[1] / n, 4);
    expect(d[2]).toBeCloseTo(toHead[2] / n, 4);
  });

  it("birds-eye hides the ceiling group, eye level inside the room keeps it", () => {
    const objs = [
      { name: "ceil_a", step: 0, loc: [0, 0, 0.9] as V3, cut: "ceiling", bb: [-1.3, -0.2, 0.85, 0, 1, 0.9] as [number, number, number, number, number, number] },
      { name: "ceil_b", step: 0, loc: [0, 0, 0.9] as V3, cut: "ceiling", bb: [0, -0.2, 0.85, 1.3, 1, 0.9] as [number, number, number, number, number, number] },
      { name: "wall_front", step: 0, loc: [0, -1, 0.4] as V3, cut: "front", bb: [-1.3, -1.05, 0, 1.3, -0.95, 0.85] as [number, number, number, number, number, number] },
    ];
    const top = planCamera({ preset: "ws", angle: "birds_eye" }, 1, 3, [head], ["a"], 0, [0, 0, 0], 1, W / H, { floorZ: 0.05 });
    const hidTop = cutawayHidden(objs, [0, 0, 0], 0.05, top.keys, top.lens, top.shift, W, H, [head]);
    expect(hidTop).toEqual(expect.arrayContaining(["ceil_a", "ceil_b"]));
    const eye = planCamera({ preset: "ms" }, 1, 3, [head], ["a"], 0, [0, 0, 0], 1, W / H, { floorZ: 0.05 });
    const hidEye = cutawayHidden(objs, [0, 0, 0], 0.05, eye.keys, eye.lens, eye.shift, W, H, [head]);
    expect(hidEye).not.toContain("ceil_a");
    // máy ở ngoài tường trước (lùi xa) -> tường trước bị ẩn
    const far = planCamera({ preset: "ws", distance: 2.2 }, 1, 3, [head], ["a"], 0, [0, 0, 0], 1, W / H, { floorZ: 0.05 });
    expect(cutawayHidden(objs, [0, 0, 0], 0.05, far.keys, far.lens, far.shift, W, H, [head])).toContain("wall_front");
  });

  it("visibility merges assembly with cutaway (an object both assembled and cut)", () => {
    const v = visibilitySchedule(["x"], 100, [
      { f0: 1, f1: 40, hidden: new Set() }, { f0: 41, f1: 70, hidden: new Set(["x"]) }, { f0: 71, f1: 100, hidden: new Set() },
    ], { x: 20 });
    expect(v.x).toEqual([[1, 0], [20, 1], [41, 0], [71, 1]]);
    // lắp ráp xong sau khi cảnh ẩn đã kết thúc
    const w = visibilitySchedule(["x"], 100, [{ f0: 1, f1: 30, hidden: new Set(["x"]) }, { f0: 31, f1: 100, hidden: new Set() }], { x: 50 });
    expect(w.x).toEqual([[1, 0], [50, 1]]);
  });
});

describe("multi-set staging in bake", () => {
  // set "thế hệ mới" giả: chép set phố cà phê, thêm vòm + một trần cutaway
  const manifest: Manifest = JSON.parse(JSON.stringify(lib.manifest));
  const cafe = manifest.sets.Set_BrickCafeStreet;
  manifest.sets.Set_TestWorld = {
    ...JSON.parse(JSON.stringify(cafe)), extent: 12, dome_h: 6, floor_z: 0.048, center: [0, 0, 0],
  };
  manifest.sets.Set_TestWorld.objects.push({ name: "Set_TestWorld_CUT_ceiling", step: 0, loc: [0, 0, 1.2], cut: "ceiling", bb: [-1.4, -1, 1.15, 1.4, 1, 1.2] });
  const L = { ...lib, manifest };
  const sbBase = read("workspace/projects/showcase_v1/storyboard.json");

  it("legacy storyboards keep 14 m spacing and get no stage block", () => {
    const sb = parseOrThrow(Storyboard, sbBase, "sb");
    expect(usesStage(sb, manifest)).toBe(false);
    const T = bake({ storyboard: sb, timing, ...L });
    expect(T.stage).toBeUndefined();
    expect(setOrigins(sb, manifest, false).map((o) => o[0])).toEqual(sb.sets.map((_, i) => i * 14));
  });

  it("actors move between sets, shot_set + cutaway are baked, qa ignores actors in other sets", () => {
    const raw = JSON.parse(JSON.stringify(sbBase));
    raw.sets.push({ id: "Set_TestWorld", lighting: "cozy_golden_hour" });
    const last = raw.shots[raw.shots.length - 1];
    last.set = "Set_TestWorld";
    last.camera = { preset: "ws", angle: "birds_eye" };
    const mover = last.subjects?.[0] ?? raw.cast[0].id;
    last.subjects = [mover];
    last.actors = { ...(last.actors ?? {}), [mover]: { ...(last.actors?.[mover] ?? {}), at: { mark: "cafe_left" } } };
    const sb = parseOrThrow(Storyboard, raw, "sb");
    expect(usesStage(sb, manifest)).toBe(true);
    const T = bake({ storyboard: sb, timing, ...L });
    expect(T.stage).toBeDefined();
    const iw = T.sets.findIndex((s) => s.id === "Set_TestWorld");
    expect(T.sets[iw].origin[0] - T.sets[iw - 1].origin[0]).toBeGreaterThanOrEqual(12 + 6);
    expect(T.stage!.shot_set[T.shots.length - 1]).toBe("Set_TestWorld");
    const bs = T.shots[T.shots.length - 1];
    const root = T.actors[mover].root[bs.f0]; // khung f0+1
    expect(Math.abs(root[0] - T.sets[iw].origin[0])).toBeLessThan(2);
    expect(T.stage!.hidden[last.id]).toContain("Set_TestWorld_CUT_ceiling");
    const vis = T.stage!.visibility["Set_TestWorld_CUT_ceiling"];
    expect(vis).toContainEqual([bs.f0, 0]);
    // cảnh cuối chỉ có diễn viên đang ở set đó trong hộp đầu QA
    for (const smp of T.qa[T.qa.length - 1].samples) for (const a of Object.keys(smp.heads)) expect(a).toBe(mover);
  });
});
