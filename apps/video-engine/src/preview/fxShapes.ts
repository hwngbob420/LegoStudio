// Nét vẽ hiệu ứng cảm xúc cho máy chiếu xem trước (cùng hình với fx_library.py của Blender, đơn vị = size).
type Pt = [number, number];
export interface FxStroke { points: Pt[]; stroke: string; fill?: string; cyclic?: boolean }

const circle = (cx: number, cy: number, r: number, n = 20): Pt[] =>
  Array.from({ length: n }, (_, i) => [cx + r * Math.cos((2 * Math.PI * i) / n), cy + r * Math.sin((2 * Math.PI * i) / n)]);
const INK = "#1a1618";

function sweat(): FxStroke[] {
  const pts: Pt[] = Array.from({ length: 24 }, (_, i) => {
    const a = (2 * Math.PI * i) / 24;
    const s = Math.max(0, Math.sin(a));
    return [0.3 * Math.cos(a) * (1 - 0.6 * s), -0.1 + 0.3 * Math.sin(a) + 0.42 * s ** 3];
  });
  return [{ points: pts, stroke: INK, fill: "#7cc8ff", cyclic: true }, { points: [[-0.12, 0], [-0.1, 0.12]], stroke: "#ffffff" }];
}
function shock(): FxStroke[] {
  return Array.from({ length: 8 }, (_, k) => {
    const a = Math.PI * (0.1 + (0.8 * k) / 7);
    const r1 = 1.15 + 0.12 * (k % 2);
    return { points: [[0.75 * Math.cos(a), 0.75 * Math.sin(a)], [r1 * Math.cos(a), r1 * Math.sin(a)]] as Pt[], stroke: INK };
  });
}
function question(): FxStroke[] {
  const pts: Pt[] = Array.from({ length: 18 }, (_, i) => {
    const a = Math.PI * (1.1 - (1.45 * i) / 17);
    return [0.28 * Math.cos(a), 0.45 + 0.28 * Math.sin(a)];
  });
  pts.push([0, 0.05], [0, -0.1]);
  return [{ points: pts, stroke: INK }, { points: circle(0, -0.35, 0.07, 10), stroke: INK, fill: INK, cyclic: true }];
}
function exclaim(): FxStroke[] {
  return [{ points: [[0, 0.7], [0, -0.1]], stroke: INK }, { points: circle(0, -0.38, 0.08, 10), stroke: INK, fill: INK, cyclic: true }];
}
function sparkle(): FxStroke[] {
  return ([[0, 0, 1], [0.55, 0.45, 0.5], [-0.45, 0.55, 0.38]] as [number, number, number][]).map(([cx, cy, s]) => ({
    points: Array.from({ length: 8 }, (_, i) => {
      const a = Math.PI / 2 + (i * Math.PI) / 4;
      const r = i % 2 === 0 ? 0.36 * s : 0.09 * s;
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as Pt;
    }),
    stroke: INK, fill: "#ffd43b", cyclic: true,
  }));
}
function anger(): FxStroke[] {
  return Array.from({ length: 4 }, (_, k) => {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    const c: Pt = [0.22 * Math.cos(a), 0.22 * Math.sin(a)];
    return { points: [[c[0] + 0.18 * Math.cos(a + 1.2), c[1] + 0.18 * Math.sin(a + 1.2)], [c[0] * 0.6, c[1] * 0.6],
      [c[0] + 0.18 * Math.cos(a - 1.2), c[1] + 0.18 * Math.sin(a - 1.2)]] as Pt[], stroke: "#e03131" };
  });
}
function steam(): FxStroke[] {
  return [-0.25, 0, 0.25].map((x0, k) => ({
    points: Array.from({ length: 11 }, (_, i) => [x0 + 0.08 * Math.sin((i / 10) * Math.PI * 2 + k), (i / 10) * 0.9] as Pt), stroke: "#ffffff" }));
}
function motionArcs(): FxStroke[] {
  return [0, 1, 2].map((k) => {
    const r = 0.6 + 0.18 * k;
    return { points: Array.from({ length: 11 }, (_, i) => { const a = Math.PI * (0.55 + (0.3 * i) / 10); return [r * Math.cos(a), r * Math.sin(a)] as Pt; }), stroke: INK };
  });
}

export const FX_SHAPES: Record<string, FxStroke[]> = {
  sweat_drop: sweat(), shock_lines: shock(), question: question(), exclaim: exclaim(),
  sparkle: sparkle(), anger: anger(), steam: steam(), motion_arcs: motionArcs(),
};
