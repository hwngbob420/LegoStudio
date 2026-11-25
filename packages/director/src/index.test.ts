import { describe, expect, it } from "vitest";
import { DIRECTOR_VERSION, frameOf } from "./index";

describe("director skeleton", () => {
  it("exports a version and frameOf matches the Python convention (first frame = 1)", () => {
    expect(DIRECTOR_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(frameOf(0, 12)).toBe(1);
    expect(frameOf(2.5, 12)).toBe(31);
  });
});
