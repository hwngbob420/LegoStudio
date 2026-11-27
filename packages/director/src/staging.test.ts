// Gđ 6: dựng storyboard nhiều bối cảnh từ kịch bản có location/visual + bộ lọc đơn điệu hình ảnh.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Script, Storyboard, parseOrThrow } from "@lse/shared";
import { blockScript, layoutTiming } from "../../../tests/fixtures/blockEpisode";
import { bake } from "./bake";
import { autoFix, autoPlan, compose, type ComposeContext } from "./compose";
import { loadLibrary, timingPath } from "./io";
import { checkStage } from "./layout";
import { visualLint } from "./visualLint";

const ROOT = path.resolve(__dirname, "../../..");
const lib = loadLibrary(path.join(ROOT, "workspace/channel_library"));
const cat = JSON.parse(readFileSync(path.join(ROOT, "workspace/channel_library/catalog.json"), "utf8"));
const sets: ComposeContext["sets"] = Object.fromEntries(Object.entries(cat.sets as Record<string, { anchors: string[]; lighting: string; rings?: number }>)
  .map(([k, v]) => [k, { anchors: v.anchors, lighting: v.lighting, rings: v.rings }]));

const LOC = (i: number) => (i < 5 ? "Set_CityStreetCorner" : i < 9 ? "Set_MiniMart" : "Set_InstructionVoid");
function multiScript() {
  const base = blockScript();
  return parseOrThrow(Script, { ...base, lines: base.lines.map((l, i) => ({ ...l, location: LOC(i), ...(i === 9 ? { visual: "cutaway_gag" } : {}),
    ...(i === 2 ? { visual: "satirical_low_angle" } : {}) })) }, "script");
}

describe("multi-location storyboard (Gđ 6)", () => {
  const script = multiScript();
  const timing = layoutTiming(script);
  const ctx: ComposeContext = { episode: "multi", script, timing, sets, defaultExpr: lib.defaultExpr };

  it("legacy scripts (no location/visual) compose exactly as before: one set, legacy presets only", () => {
    const legacy = blockScript();
    const plan = autoPlan(legacy, "Set_BrickCafeStreet", lib.defaultExpr);
    expect(plan.beats.every((b) => ["mcu", "ecu", "two_shot"].includes(b.shot) && !b.location && !b.angle)).toBe(true);
    const sb = compose(plan, { ...ctx, script: legacy, timing: layoutTiming(legacy) });
    expect(sb.sets.map((s) => s.id)).toEqual(["Set_BrickCafeStreet"]);
    expect(sb.shots.every((s) => s.set === "Set_BrickCafeStreet" && !s.camera.angle)).toBe(true);
  });

  it("uses every location, inserts an establishing EWS at each location change and moves actors there", () => {
    const plan = autoPlan(script, "Set_CityStreetCorner", lib.defaultExpr);
    const sb = parseOrThrow(Storyboard, compose(plan, ctx), "sb");
    expect(sb.sets.map((s) => s.id)).toEqual(["Set_CityStreetCorner", "Set_MiniMart", "Set_InstructionVoid"]);
    const est = sb.shots.filter((s) => /e$/.test(s.id));
    // câu đầu đoạn đủ dài (>= 5 từ) mới chèn cảnh mở; đoạn sân khấu hướng dẫn bắt đầu bằng câu 2 từ
    expect(est.map((s) => s.set)).toContain("Set_MiniMart");
    expect(est.every((s) => s.camera.preset === "ews")).toBe(true);
    // diễn viên được dời ở cảnh mở của bối cảnh mới
    expect(Object.values(est[0].actors ?? {}).some((a) => a.at?.set === "Set_MiniMart")).toBe(true);
    // đủ thang cỡ cảnh
    const presets = new Set(sb.shots.map((s) => s.camera.preset));
    for (const p of ["ews", "ms", "ots", "cu"]) expect(presets.has(p as never), p).toBe(true);
    expect(sb.shots.some((s) => s.camera.angle === "low_angle")).toBe(true);
  });

  it("bakes with actors really standing in the shot's set and passes the stage checks after autoFix", () => {
    const plan = autoPlan(script, "Set_CityStreetCorner", lib.defaultExpr);
    const fixed = autoFix(plan, ctx, lib);
    const T = bake({ storyboard: fixed.storyboard, timing, ...lib });
    expect(T.stage?.shot_set.length).toBe(T.shots.length);
    fixed.storyboard.shots.forEach((s, i) => {
      for (const a of s.subjects ?? []) {
        const root = T.actors[a].root[T.shots[i].f1 - 1];
        const o = T.sets.find((x) => x.id === s.set)!.origin;
        expect(Math.hypot(root[0] - o[0], root[1] - o[1]), `${s.id} ${a}`).toBeLessThan(3);
      }
    });
    expect(checkStage(T, fixed.storyboard, lib.manifest).map((x) => x.message)).toEqual([]);
    // qua vai: hai chủ thể quay mặt vào nhau (hướng chênh ~180 độ), người tiền cảnh quay lưng về máy
    const oi = fixed.storyboard.shots.findIndex((s) => s.camera.preset === "ots");
    expect(oi).toBeGreaterThan(0);
    const [a, b] = fixed.storyboard.shots[oi].subjects!;
    const fm = Math.floor((T.shots[oi].f0 + T.shots[oi].f1) / 2);
    const ra = T.actors[a].root[fm - 1][3], rb = T.actors[b].root[fm - 1][3];
    const wrapped = ((ra - rb) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
    const diff = Math.abs(Math.abs(wrapped) - Math.PI);
    expect(diff).toBeLessThan(0.05);
    expect(fixed.issues.filter((x) => x.level === "error").map((x) => x.message)).toEqual([]);
  });
});

describe("visual monotony linter", () => {
  it("flags a long run of the same scale and a static location, and stays quiet on a varied cut", () => {
    const script = blockScript(false);
    const timing = layoutTiming(script);
    const flat = compose({ set: "Set_BrickCafeStreet", beats: script.lines.map((l) => ({ line: l.id, shot: "mcu" as const })), ending: { step: "02", title: "x" } },
      { episode: "x", script, timing, sets, defaultExpr: lib.defaultExpr });
    const notes = visualLint(flat, timing);
    expect(notes.some((n) => n.code === "same_scale")).toBe(true);
    expect(notes.some((n) => n.code === "low_variety")).toBe(true);
    // kịch bản nhiều bối cảnh do autoPlan dựng: không bị cờ cùng cỡ cảnh
    const ms = multiScript();
    const tm = layoutTiming(ms);
    const rich = compose(autoPlan(ms, "Set_CityStreetCorner", lib.defaultExpr), { episode: "y", script: ms, timing: tm, sets, defaultExpr: lib.defaultExpr });
    expect(visualLint(rich, tm).filter((n) => n.code !== "static_location")).toEqual([]);
  });

  it("flags more than 60 s in one set at eye level", () => {
    const sb = parseOrThrow(Storyboard, JSON.parse(readFileSync(path.join(ROOT, "workspace/projects/ep02_the_to_do_list_trap/storyboard.json"), "utf8")), "sb");
    const timing = JSON.parse(readFileSync(timingPath(path.join(ROOT, "workspace/projects/ep02_the_to_do_list_trap")), "utf8"));
    expect(visualLint(sb, timing).some((n) => n.code === "static_location")).toBe(true);
  });
});
