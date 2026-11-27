// 5B: block ~2 phút. Sửa block 1 (dài ra) thì lát timeline của block 2 phải giữ nguyên mã băm -> không render lại.
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Script, Storyboard, type Timing, assignBlocks, blockErrors, blockList, estimateLineSec, parseOrThrow, snapBlockStart } from "@lse/shared";
import { bake } from "./bake";
import { autoPlan, compose, spliceBlocks } from "./compose";
import { loadLibrary } from "./io";
import { sha256Hex, sliceHash, sliceTimeline } from "./slice";
import { blockScript, layoutTiming } from "../../../tests/fixtures/blockEpisode";

const ROOT = path.resolve(__dirname, "../../..");
const lib = loadLibrary(path.join(ROOT, "workspace/channel_library"));
const SETS = { Set_BrickCreatorDesk: { anchors: ["max_mark", "priya_mark", "priya_offstage", "desk_center", "center"], lighting: "studio_bright" } };

const script = blockScript;
const layout = layoutTiming;

function bakeEp(sc: Script, timing: Timing) {
  const plan = autoPlan(sc, "Set_BrickCreatorDesk", lib.defaultExpr);
  const sb = compose(plan, { episode: "t", script: sc, timing, sets: SETS, defaultExpr: lib.defaultExpr });
  return { sb, T: bake({ storyboard: sb, timing, ...lib }) };
}

describe("blocks (shared)", () => {
  it("snapBlockStart lands on the 0.25 s grid + lead and never moves earlier", () => {
    for (const t of [3.0, 3.01, 7.749, 7.75, 100.123]) {
      const s = snapBlockStart(t);
      expect(s).toBeGreaterThanOrEqual(t - 1e-9);
      expect(s - t).toBeLessThan(0.25);
      expect(Math.abs(((s - 0.5) / 0.25) - Math.round((s - 0.5) / 0.25))).toBeLessThan(1e-9);
    }
  });
  it("assignBlocks packs ~2 min, prefers beat changes, merges a tiny tail", () => {
    const lines = Array.from({ length: 90 }, (_, i) => ({ id: `L${i + 1}`, text: "one two three four five six seven eight nine ten", beat: `B${Math.floor(i / 6) + 1}` }));
    const ids = assignBlocks(lines, (l) => estimateLineSec(l.text));
    const blocks = blockList(lines.map((l, i) => ({ ...l, block: ids[i] })));
    expect(blocks.length).toBeGreaterThanOrEqual(2);
    for (const b of blocks.slice(0, -1)) {
      const sec = b.lineIds.length * estimateLineSec(lines[0].text);
      expect(sec).toBeGreaterThan(120 * 0.75);
      expect(sec).toBeLessThan(120 * 1.2);
      const last = Number(b.lineIds[b.lineIds.length - 1].slice(1));
      expect(last % 6, "cut at a beat boundary").toBe(0);
    }
    expect(assignBlocks(lines.slice(0, 10), (l) => estimateLineSec(l.text)).every((b) => b === "b01")).toBe(true);
  });
  it("blockErrors catches a split block", () => {
    expect(blockErrors([{ id: "L1", text: "a", block: "b01" }, { id: "L2", text: "b", block: "b02" }, { id: "L3", text: "c", block: "b01" }])).toHaveLength(1);
  });
});

describe("block slices (director)", () => {
  const sc = script(true);
  const A = bakeEp(sc, layout(sc));
  const B = bakeEp(sc, layout(sc, 0.37));

  it("bakes one block entry per block, contiguous, covering every frame", () => {
    expect(A.T.blocks!.map((b) => b.id)).toEqual(["b01", "b02"]);
    expect(A.T.blocks![0].f0).toBe(1);
    expect(A.T.blocks![1].f0).toBe(A.T.blocks![0].f1 + 1);
    expect(A.T.blocks![1].f1).toBe(A.T.frames);
    // không cảnh nào vắt qua ranh giới block
    for (const s of A.T.shots) expect(s.f0 >= A.T.blocks![1].f0 || s.f1 < A.T.blocks![1].f0, s.id).toBe(true);
  });

  it("editing block 1 shifts block 2 by whole frames and keeps its hash (no re-render)", () => {
    expect(B.T.frames).toBeGreaterThan(A.T.frames);
    expect(B.T.blocks![0].hash).not.toBe(A.T.blocks![0].hash);
    expect(B.T.blocks![1].hash).toBe(A.T.blocks![1].hash);
  });

  it("the slice is a standalone timeline starting at frame 1", () => {
    const b = A.T.blocks![1];
    const s = sliceTimeline(A.T, b.f0, b.f1);
    expect(s.frames).toBe(b.f1 - b.f0 + 1);
    expect(s.shots[0].f0).toBe(1);
    expect(s.shots[s.shots.length - 1].f1).toBe(s.frames);
    for (const a of Object.values(s.actors)) { expect(a.root).toHaveLength(s.frames); expect(a.face).toHaveLength(s.frames); }
    expect(sliceHash(A.T, b.f0, b.f1)).toBe(b.hash);
  });

  it("is still deterministic", () => {
    expect(bakeEp(sc, layout(sc)).T.blocks).toEqual(A.T.blocks);
  });

  it("spliceBlocks: re-directing block 2 keeps block 1 (incl. manual edits) and reconnects the seam", () => {
    // người dùng sửa tay một cảnh của block 1
    const old = structuredClone(A.sb);
    const s2 = old.shots.find((s) => s.id === "S2")!;
    s2.camera = { ...s2.camera, preset: "ecu" };
    // Claude viết lại block 2: đổi câu đầu block (ID mới L15) và thêm một câu
    const sc2 = parseOrThrow(Script, { ...sc, lines: [
      ...sc.lines.slice(0, 7),
      { id: "L15", speaker: "priya_lead", text: "New opener for the second block.", gap_before: 0.35, block: "b02" },
      ...sc.lines.slice(8),
      { id: "L16", speaker: "max_dev", text: "And one more line.", gap_before: 0.35, block: "b02" },
    ] }, "script");
    const timing2 = layout(sc2);
    const fresh = compose(autoPlan(sc2, "Set_BrickCreatorDesk", lib.defaultExpr), { episode: "t", script: sc2, timing: timing2, sets: SETS, defaultExpr: lib.defaultExpr });
    const sb = spliceBlocks(old, fresh, sc2, new Set(["b02"]));
    const ownB1 = old.shots.filter((s) => typeof s.t0 === "number" || Number(String(s.t0).slice(1).split(".")[0]) <= 7);
    // cảnh block 1 giữ nguyên (kể cả chỗ sửa tay), trừ mốc kết thúc của cảnh cuối được nối sang câu mới L15
    for (const s of ownB1.slice(0, -1)) expect(sb.shots.find((x) => x.id === s.id)).toEqual(s);
    expect(sb.shots.find((x) => x.id === ownB1.at(-1)!.id)!.t1).toBe("L15.start-0.12");
    expect(sb.shots.find((x) => x.id === "S2")!.camera.preset).toBe("ecu");
    // cảnh block 2 mang ID mới theo block, nướng được, block 1 vẫn cùng mã băm (chỉ khác chỗ người dùng sửa tay)
    expect(sb.shots.filter((s) => s.id.startsWith("b02_S")).length).toBeGreaterThan(0);
    const T2 = bake({ storyboard: parseOrThrow(Storyboard, sb, "sb"), timing: timing2, ...lib });
    const T1m = bake({ storyboard: old, timing: layout(sc), ...lib });
    expect(T2.blocks![0].hash).toBe(T1m.blocks![0].hash);
    expect(T2.blocks![1].hash).not.toBe(T1m.blocks![1].hash);
  });

  it("sha256Hex matches the standard test vectors", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex("a".repeat(1000))).toBe("41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3");
  });
});

describe("overlay slices", () => {
  it("sliceOverlay keeps only the block's cues/subtitles, re-based to 0, and matches the Python renderer", async () => {
    const { overlayProps, sliceOverlay } = await import("./overlay");
    const { execFileSync } = await import("node:child_process");
    const sc = blockScript();
    const timing = layoutTiming(sc);
    const { sb, T } = bakeEp(sc, timing);
    const ov = overlayProps(sb, timing, {});
    const b = T.blocks![1];
    const t0 = (b.f0 - 1) / T.fps, t1 = b.f1 / T.fps;
    const s = sliceOverlay(ov, t0, t1);
    expect(s.duration).toBeCloseTo(t1 - t0, 4);
    expect(s.subtitles.map((x) => x.id)).toEqual(["L8", "L9", "L10", "L11", "L12", "L13", "L14"]);
    expect(s.subtitles[0].start).toBeGreaterThan(0);
    for (const c of s.cues) { expect(c.t0 as number).toBeGreaterThanOrEqual(0); expect(c.t1 as number).toBeLessThanOrEqual(s.duration + 1e-9); }
    // cùng phép cắt bên Python (apps/brick-engine/block_render.py) -> lớp chữ render từng block khớp Player
    const py = execFileSync("python", ["-c", [
      "import sys, json; sys.path.insert(0, 'apps/brick-engine'); import block_render as B",
      "d = json.load(sys.stdin); print(json.dumps(B.slice_overlay(d['ov'], d['t0'], d['t1'])))",
    ].join("\n")], { cwd: path.resolve(__dirname, "../../.."), input: JSON.stringify({ ov, t0, t1 }) }).toString();
    expect(JSON.parse(py)).toEqual(JSON.parse(JSON.stringify(s)));
  });
});
