import path from "node:path";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { goldenHashes } from "./legacyGolden";

const ROOT = path.resolve(__dirname, "..", "..", "..");

describe("legacy episodes bake byte-identical (backward compatibility)", () => {
  it("matches the golden sha256 and block hashes", () => {
    const golden = JSON.parse(readFileSync(path.join(__dirname, "__golden__", "legacy_bakes.json"), "utf8"));
    expect(goldenHashes(ROOT)).toEqual(golden);
  }, 60000);
});
