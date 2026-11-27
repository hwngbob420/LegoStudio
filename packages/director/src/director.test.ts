import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Storyboard, Timing, parseOrThrow, type V3 } from "@lse/shared";
import { bake } from "./bake";
import { poseAt, bakeActor } from "./acting";
import { planCamera, project } from "./camera";
import { bakeFace, quantise, type FaceSpec } from "./faces";
import { loadLibrary } from "./io";
import { RigModel } from "./rig";
import { Rng, crc32, smoothNoise } from "./rng";

const ROOT = path.resolve(__dirname, "../../..");
const read = (p: string) => JSON.parse(readFileSync(path.join(ROOT, p), "utf8"));
const lib = loadLibrary(path.join(ROOT, "workspace/channel_library"));
const storyboard = parseOrThrow(Storyboard, read("workspace/projects/showcase_v1/storyboard.json"), "sb");
const timing = parseOrThrow(Timing, read("tests/fixtures/showcase_timing.json"), "timing");
const spec = lib.faceSpec as FaceSpec;

describe("rng", () => {
  it("crc32 matches zlib", () => {
    expect(crc32("123456789")).toBe(0xcbf43926);
    expect(crc32("max_dev")).toBe(6009417); // == zlib.crc32(b"max_dev") in Python
  });
  it("same seed -> same stream", () => {
    const a = new Rng(7), b = new Rng(7);
    for (let i = 0; i < 50; i++) expect(a.gauss(0, 1)).toBe(b.gauss(0, 1));
  });
});

describe("acting", () => {
  it("idle alone is subtle, slump leans the torso forward", () => {
    const idle = poseAt([], 1.0).pose;
    expect(Math.abs(idle.torso[0])).toBeLessThan(2.5);
    const slump = poseAt([{ action: "slump_tired", t0: 0, t1: 2 }], 1.5).pose;
    expect(slump.torso[0]).toBeGreaterThan(10);
  });
  it("mirror moves the other arm", () => {
    const n = poseAt([{ action: "talk_gestures", t0: 0, t1: 3 }], 0.9).pose;
    const m = poseAt([{ action: "talk_gestures", t0: 0, t1: 3, mirror: true }], 0.9).pose;
    expect(n["arm.R"][0]).toBeLessThan(-20);
    expect(m["arm.L"][0]).toBeLessThan(-20);
  });
  it("shock_jump lifts the root, appear drops the figure in from above", () => {
    expect(poseAt([{ action: "shock_jump", t0: 0, t1: 1 }], 0.12).root[2]).toBeCloseTo(0.09, 3);
    const b = bakeActor({ clips: [], fps: 12, frames: 30, home: [0, 0, 0], facingDeg: 0, seed: 1, appear: 2 });
    expect(b.root[0][2]).toBe(6);
    expect(b.root[29][2]).toBe(0);
  });
});

describe("faces + lip-sync", () => {
  it("closed-lip A wins its frame even when shorter than a neighbour", () => {
    const q = quantise([[0, 0.045, "D"], [0.045, 0.083, "A"]], 12, 1, 1); // D 0.0495 vs A 0.038*1.6
    expect(q.get(1)).toBe("A");
  });
  it("silent frames use the expression's rest mouth and blinks appear", () => {
    const face = bakeFace([[0, "smug_smirk"]], new Map(), 12, 120, 3, spec);
    const smirk = spec.mouths.indexOf("smirk");
    expect(face.every(([, m]) => m === smirk)).toBe(true);
    expect(face.some(([e]) => e === spec.eyes.indexOf("blink"))).toBe(true);
  });
});

describe("rig FK", () => {
  const rig = new RigModel(lib.manifest);
  it("rest head centre sits at head_center_z above the root", () => {
    const h = rig.headCenter([1, 2, 0.5, 0], {});
    expect(h).toEqual([1, 2, 0.5 + lib.manifest.rig.head_center_z].map((v) => expect.closeTo(v, 6)) as unknown as V3);
  });
  it("leaning the torso forward moves the head toward -Y (the figure faces -Y)", () => {
    const h = rig.headCenter([0, 0, 0, 0], { torso: [0.3, 0, 0] });
    expect(h[1]).toBeLessThan(-0.01);
  });
});

describe("camera", () => {
  it("mcu with subject_zone left_third puts the head on the left third", () => {
    const head: V3 = [0, 0, 0.4];
    const plan = planCamera({ preset: "mcu", subject_zone: "left_third", shake: 0 }, 1, 1, [head], ["a"], 0, [0, 0, 0], 1);
    const p = project(head, plan.keys[0], plan.lens, plan.shift, 1920, 1080)!;
    expect(p[0]).toBeCloseTo(1 / 3, 1);
    expect(p[1]).toBeGreaterThan(0.25);
    expect(p[1]).toBeLessThan(0.6);
  });

  it("handheld shake drifts slowly: static shots move < 0.6 px per world frame (was 4-12 px white noise)", () => {
    const head: V3 = [0, 0, 0.4];
    for (const preset of ["mcu", "ecu", "wide_establish"]) {
      const plan = planCamera({ preset }, 1, 240, [head], ["a"], 0, [0, 0, 0], 12345);
      const pts = plan.keys.map((k) => project(head, k, plan.lens, plan.shift, 1920, 1080)!);
      let maxStep = 0, maxOff = 0;
      for (let i = 1; i < pts.length; i++) maxStep = Math.max(maxStep, Math.hypot((pts[i][0] - pts[i - 1][0]) * 1920, (pts[i][1] - pts[i - 1][1]) * 1080));
      for (const p of pts) maxOff = Math.max(maxOff, Math.hypot((p[0] - pts[0][0]) * 1920, (p[1] - pts[0][1]) * 1080));
      expect(maxStep, preset).toBeLessThan(0.6);
      expect(maxOff, preset).toBeGreaterThan(0.5); // vẫn còn cảm giác cầm tay, không đứng chết
      expect(maxOff, preset).toBeLessThan(12);
    }
  });

  it("smoothNoise is deterministic and continuous", () => {
    const a = smoothNoise(new Rng(7), 100, 6), b = smoothNoise(new Rng(7), 100, 6);
    expect(a).toEqual(b);
    for (let i = 1; i < a.length; i++) expect(Math.abs(a[i] - a[i - 1])).toBeLessThan(2.5);
  });
});

describe("bake (showcase_v1)", () => {
  const t1 = bake({ storyboard, timing, ...lib });
  it("is deterministic (same sha256 twice)", () => {
    const h = (x: unknown) => createHash("sha256").update(JSON.stringify(x)).digest("hex");
    expect(h(bake({ storyboard, timing, ...lib }))).toBe(h(t1));
  });
  it("covers every frame for every actor, joint and face", () => {
    expect(t1.frames).toBe(234);
    for (const a of Object.values(t1.actors)) {
      expect(a.root.length).toBe(t1.frames);
      expect(a.face.length).toBe(t1.frames);
      for (const arr of Object.values(a.joints)) expect(arr.length).toBe(t1.frames);
    }
  });
  it("shots tile the timeline and assembly reveals every stepped brick in order", () => {
    for (let i = 1; i < t1.shots.length; i++) expect(t1.shots[i].f0).toBe(t1.shots[i - 1].f1 + 1);
    const asm = t1.assembly[0];
    const objs = lib.manifest.sets[asm.set].objects.filter((o) => o.step >= 1);
    expect(Object.keys(asm.show).length).toBe(objs.length);
    const firstOf = (st: number) => Math.min(...objs.filter((o) => o.step === st).map((o) => asm.show[o.name]));
    expect(firstOf(1)).toBeLessThanOrEqual(firstOf(2));
  });
  it("predicts Max on the left third in S2 and nobody under the subtitle band", () => {
    const s2 = t1.qa.find((q) => q.shot === "S2")!;
    const key = s2.samples.find((s) => s.f === s2.key_f)!;
    const bb = key.heads.max_dev;
    expect((bb[0] + bb[2]) / 2).toBeLessThan(0.45);
    for (const q of t1.qa) for (const s of q.samples) for (const b of Object.values(s.heads)) expect(b[1]).toBeLessThan(0.83);
  });
});

import { overlayProps, validateLayout } from "./overlay";
describe("overlay props + layout validator", () => {
  const T = bake({ storyboard, timing, ...lib });
  const ov = overlayProps(storyboard, timing, { max_dev: "Max", priya_lead: "Priya" });
  it("resolves cue times and keeps punctuation in subtitles", () => {
    expect(ov.cues.length).toBe(storyboard.ui.length);
    expect(typeof ov.cues[0].t0).toBe("number");
    expect(ov.subtitles[0].words.map((w) => w.text).join(" ")).toContain("coffees.");
  });
  it("showcase passes; moving the chart onto Priya's third is caught", () => {
    expect(validateLayout(T, storyboard, ov).filter((i) => i.level === "error")).toEqual([]);
    const bad = structuredClone(storyboard);
    const chart = bad.ui.find((c) => c.type === "brick_chart")!;
    (chart as { zone: string }).zone = "right_third";
    const ov2 = overlayProps(bad, timing, {});
    expect(validateLayout(T, bad, ov2).some((i) => i.code === "cue_over_face")).toBe(true);
  });
});

import { autoPlan, compose } from "./compose";
import { storyboardRefErrors, Catalog, Script as ScriptSchema } from "@lse/shared";
describe("compose (AI beats -> storyboard)", () => {
  const script = parseOrThrow(ScriptSchema, read("workspace/projects/showcase_v1/script.json"), "script");
  const cat = parseOrThrow(Catalog, read("workspace/channel_library/catalog.json"), "cat");
  const sets = Object.fromEntries(Object.entries(cat.sets).map(([k, v]) => [k, { anchors: v.anchors, lighting: v.lighting }]));
  const ctx = { episode: "showcase_v1", script, timing, sets, defaultExpr: lib.defaultExpr };
  it("auto director (no AI) produces a valid storyboard with zero face/UI collisions", () => {
    const sb = parseOrThrow(Storyboard, compose(autoPlan(script, "Set_BrickCreatorDesk", lib.defaultExpr), ctx), "auto");
    expect(storyboardRefErrors(sb, cat)).toEqual([]);
    const T = bake({ storyboard: sb, timing, ...lib });
    const issues = validateLayout(T, sb, overlayProps(sb, timing, {})).filter((i) => i.level === "error");
    expect(issues).toEqual([]);
    expect(sb.shots[0].assembly).toBeDefined();
  });
  it("a chart beat puts the chart on the third opposite the speaker", () => {
    const plan = autoPlan(script, "Set_BrickCreatorDesk", lib.defaultExpr);
    plan.beats[1] = { ...plan.beats[1], shot: "mcu", ui: { type: "brick_chart", title: "Focus per coffee", bars: [{ label: "x1", value: 6 }, { label: "x2", value: 8 }, { label: "x3", value: 9 }], collapse_last: true } };
    const sb = parseOrThrow(Storyboard, compose(plan, ctx), "chart");
    const chart = sb.ui.find((c) => c.type === "brick_chart") as { zone: string };
    const shot = sb.shots.find((s) => s.ui_safe_zone === chart.zone)!;
    expect(shot.subject_zone).not.toBe(chart.zone);
    const T = bake({ storyboard: sb, timing, ...lib });
    expect(validateLayout(T, sb, overlayProps(sb, timing, {})).filter((i) => i.level === "error")).toEqual([]);
  });
});

import { graphemeVisemes, lineVisemes } from "./voice";
describe("real-voice visemes from words", () => {
  it("maps letters to SAPI visemes inside the word span (m/b/p close the lips)", () => {
    const v = graphemeVisemes("Bump", 1, 1.4);
    expect(v[0][1]).toBe(21);
    expect(v[v.length - 1][1]).toBe(21);
    expect(v[0][0]).toBe(1);
    expect(v.at(-1)![0] + v.at(-1)![2]).toBeCloseTo(1.4, 5);
  });
  it("inserts a rest between words separated by a pause", () => {
    const v = lineVisemes([{ text: "Wait.", start: 0, end: 0.3 }, { text: "So", start: 0.9, end: 1.1 }]);
    expect(v.some((x) => x[1] === 0 && x[0] === 0.3)).toBe(true);
  });
});

import { makeShorts } from "./shorts";
describe("Shorts 1080x1920", () => {
  it("re-frames the showcase vertically with no face under the cards or subtitles", () => {
    const sb = parseOrThrow(Storyboard, makeShorts(storyboard, "showcase_v1_shorts"), "shorts");
    expect(sb.resolution).toEqual([1080, 1920]);
    const T = bake({ storyboard: sb, timing, ...lib });
    const errs = validateLayout(T, sb, overlayProps(sb, timing, {})).filter((i) => i.level === "error");
    expect(errs.map((e) => e.message)).toEqual([]);
    // chủ thể cận ở giữa khung
    const s2 = T.qa.find((q) => q.shot === "S2")!;
    const bb = s2.samples.find((x) => x.f === s2.key_f)!.heads.max_dev;
    expect(Math.abs((bb[0] + bb[2]) / 2 - 0.5)).toBeLessThan(0.12);
  });
});
