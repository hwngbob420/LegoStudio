// Mốc thời gian dùng chung (bản TS của apps/brick-engine/timeref.py).
// Dạng hợp lệ: số giây, hoặc "L2.start", "L2.end", "L3.w2" (từ thứ 2 của câu L3), "S1.t0", "S1.t1", "END",
// kèm tuỳ chọn "+0.2" / "-0.15".

export const TIME_REF_RX = /^\s*([A-Za-z0-9_]+(?:\.[a-z0-9]+)?)\s*(?:([+-])\s*([0-9.]+))?\s*$/;

export interface TimingLike {
  duration?: number;
  lines?: Record<string, { start: number; end: number; words?: [number, string][] }>;
}

export class Timeline {
  readonly refs: Record<string, number> = {};

  constructor(timing: TimingLike) {
    for (const [lid, L] of Object.entries(timing.lines ?? {})) {
      this.refs[`${lid}.start`] = L.start;
      this.refs[`${lid}.end`] = L.end;
      (L.words ?? []).forEach((w, i) => {
        this.refs[`${lid}.w${i + 1}`] = w[0];
      });
    }
    this.refs.END = timing.duration ?? 0;
  }

  t(v: number | string | undefined | null): number {
    if (v === undefined || v === null) throw new Error("Thiếu mốc thời gian");
    if (typeof v === "number") return v;
    const m = TIME_REF_RX.exec(v);
    if (!m || !(m[1] in this.refs)) throw new Error(`Mốc thời gian không hợp lệ: "${v}"`);
    let base = this.refs[m[1]];
    if (m[2]) base += parseFloat(m[3]) * (m[2] === "+" ? 1 : -1);
    return base;
  }

  /** Giải t0/t1 của từng cảnh theo thứ tự để cảnh sau tham chiếu được "S1.t1". */
  resolveShots<T extends { id: string; t0: number | string; t1: number | string }>(shots: T[]): (T & { _t0: number; _t1: number })[] {
    return shots.map((s) => {
      const _t0 = this.t(s.t0);
      this.refs[`${s.id}.t0`] = _t0;
      const _t1 = this.t(s.t1);
      this.refs[`${s.id}.t1`] = _t1;
      return { ...s, _t0, _t1 };
    });
  }
}

/** Giây -> số khung (khung đầu = 1), giống frame_of() trong Python. */
export function frameOf(t: number, fps: number): number {
  // làm tròn 1e-6 trước: cùng một mốc dời đi số nguyên khung (đầu block khớp lưới) luôn ra cùng số khung tương đối
  return Math.round(Math.round(t * fps * 1e6) / 1e6) + 1;
}
