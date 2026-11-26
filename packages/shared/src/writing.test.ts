import { describe, expect, it } from "vitest";
import { BEAT_CHECKS, BeatSheet, Critique, SourceIndex, linesForDuration, passRate } from "./index";

describe("writing room schemas", () => {
  it("line budget grows with target length and stays sane", () => {
    expect(linesForDuration(20)).toEqual({ min: 4, max: 6 });
    expect(linesForDuration(180).max).toBeGreaterThanOrEqual(52); // ep02 thật: 52 câu / 190 s
    expect(linesForDuration(300).max).toBeLessThanOrEqual(95);
    expect(linesForDuration(5).min).toBeGreaterThanOrEqual(2);
  });
  it("beat sheet rejects timings-free violations (bad ids, empty beats)", () => {
    const ok = { title: "Soup", logline: "A chef learns salt.", idea: "Salt dose matters", viewpoint: "taste first", cast: ["max_dev"],
      beats: [1, 2, 3].map((i) => ({ id: `B${i}`, kind: "setup", summary: "Something happens", value_shift: "a -> b", speakers: ["max_dev"], est_lines: 2 })) };
    expect(BeatSheet.parse(ok).approved).toBe(false);
    expect(() => BeatSheet.parse({ ...ok, beats: ok.beats.slice(0, 2) })).toThrow();
    expect(() => BeatSheet.parse({ ...ok, cast: ["Max Dev"] })).toThrow();
  });
  it("critique pass rate is a fraction of pass/fail checks", () => {
    const c = Critique.parse({ checks: Object.keys(BEAT_CHECKS).map((id, i) => ({ id, pass: i % 2 === 0, reason: "x" })) });
    expect(passRate(c)).toBeCloseTo(0.5);
  });
  it("source index only accepts server-made ids", () => {
    expect(() => SourceIndex.parse({ sources: [{ id: "../evil", name: "a", ext: "pdf", bytes: 1, chars: 1, added: "t" }] })).toThrow();
  });
});
