import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  Catalog, CastRecipe, LightingPreset, Script, SetEntry, Storyboard, Timeline, Timing, parseOrThrow, storyboardRefErrors,
} from "./index";

const ROOT = path.resolve(__dirname, "../../..");
const LIB = path.join(ROOT, "workspace/channel_library");
const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));

describe("schemas parse the real channel library", () => {
  it("catalog", () => {
    expect(() => parseOrThrow(Catalog, read(path.join(LIB, "catalog.json")), "catalog")).not.toThrow();
  });
  it("every cast recipe", () => {
    const files = readdirSync(path.join(LIB, "cast")).filter((f) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThanOrEqual(4);
    for (const f of files) parseOrThrow(CastRecipe, read(path.join(LIB, "cast", f)), f);
  });
  it("every lighting preset and set entry", () => {
    for (const f of readdirSync(path.join(LIB, "lighting"))) parseOrThrow(LightingPreset, read(path.join(LIB, "lighting", f)), f);
    const sets = readdirSync(path.join(LIB, "sets"));
    expect(sets.length).toBe(3);
    for (const f of sets) parseOrThrow(SetEntry, read(path.join(LIB, "sets", f)), f);
  });
});

describe("showcase_v1 project files", () => {
  const ep = path.join(ROOT, "workspace/projects/showcase_v1");
  it("script + storyboard are valid and reference real library ids", () => {
    parseOrThrow(Script, read(path.join(ep, "script.json")), "script");
    const sb = parseOrThrow(Storyboard, read(path.join(ep, "storyboard.json")), "storyboard");
    const cat = parseOrThrow(Catalog, read(path.join(LIB, "catalog.json")), "catalog");
    expect(storyboardRefErrors(sb, cat)).toEqual([]);
  });
  it("rejects an unknown action and a bad time ref with readable errors", () => {
    const sb = read(path.join(ep, "storyboard.json"));
    sb.shots[1].actors.max_dev.acts[0].a = "moonwalk";
    sb.shots[1].t1 = "L9.middle";
    expect(() => parseOrThrow(Storyboard, sb, "storyboard")).toThrow(/storyboard không hợp lệ/);
  });
  it("storyboardRefErrors catches a missing mark", () => {
    const sb = parseOrThrow(Storyboard, read(path.join(ep, "storyboard.json")), "sb");
    const cat = parseOrThrow(Catalog, read(path.join(LIB, "catalog.json")), "cat");
    sb.cast[0].mark = "rooftop";
    expect(storyboardRefErrors(sb, cat).join(" ")).toMatch(/rooftop/);
  });
});

describe("Timeline (time refs)", () => {
  const timing = parseOrThrow(Timing, read(path.join(ROOT, "tests/fixtures/showcase_timing.json")), "timing");
  const tl = new Timeline(timing);
  it("resolves lines, words, offsets and END", () => {
    expect(tl.t("L1.start")).toBeCloseTo(timing.lines.L1.start);
    expect(tl.t("L3.w3")).toBeCloseTo(timing.lines.L3.words[2][0]);
    expect(tl.t("L1.start-0.1")).toBeCloseTo(timing.lines.L1.start - 0.1);
    expect(tl.t("END")).toBeCloseTo(timing.duration);
    expect(tl.t(2.5)).toBe(2.5);
  });
  it("resolves shots in order so S1.t1 can be referenced", () => {
    const shots = tl.resolveShots([{ id: "S1", t0: 0, t1: "L1.start" }, { id: "S2", t0: "S1.t1", t1: "S1.t1+1" }]);
    expect(shots[1]._t0).toBeCloseTo(timing.lines.L1.start);
    expect(shots[1]._t1).toBeCloseTo(timing.lines.L1.start + 1);
  });
  it("throws on unknown refs", () => {
    expect(() => tl.t("L99.start")).toThrow(/không hợp lệ/);
  });
});
