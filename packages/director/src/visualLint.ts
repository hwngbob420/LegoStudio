// Gđ 6: bộ lọc đơn điệu hình ảnh — cảnh giữ cùng một cỡ quá lâu, hoặc quá lâu không đổi bối cảnh / góc máy.
// Dùng ở tab "Duyệt block" (nhận xét tự động) và gửi kèm khi Claude sửa block (gợi ý đổi nhịp hình ảnh).
import { SHOT_SCALE, Timeline, type Storyboard, type Timing } from "@lse/shared";

export interface VisualNote {
  code: "same_scale" | "static_location" | "low_variety";
  t0: number;
  t1: number;
  shots: string[];
  message: string;
  /** gợi ý cụ thể cho đạo diễn / Claude */
  suggest: string;
}

/** Ngưỡng (giây): cùng cỡ cảnh liên tục; không đổi bối cảnh lẫn góc máy. */
export const SAME_SCALE_MAX = 22;
export const STATIC_MAX = 60;

const SUGGEST: Record<string, string> = {
  EWS: "chèn một cận mặt (cu) phản ứng hoặc qua vai (ots)",
  WS: "cắt vào trung cảnh (ms) hoặc cận mặt (cu)",
  MLS: "cắt cận mặt (cu) hoặc lùi toàn cảnh chúc cao (ws high_angle)",
  MS: "xen cận mặt (cu), góc thấp (mls low_angle) hoặc nhìn từ trên (ws birds_eye)",
  MCU: "xen cảnh qua vai (ots), góc thấp (mls low_angle) hoặc toàn cảnh (ws)",
  CU: "lùi ra trung cảnh (ms) hoặc toàn cảnh (ws) để người xem thấy bối cảnh",
  ECU: "lùi ra trung cảnh (ms)",
};

const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

export function visualLint(sb: Storyboard, timing: Timing, range?: [number, number]): VisualNote[] {
  const tl = new Timeline(timing);
  const shots = tl.resolveShots(sb.shots).filter((s) => !range || (s._t1 > range[0] && s._t0 < range[1]));
  if (!shots.length) return [];
  const notes: VisualNote[] = [];
  const scaleOf = (s: (typeof shots)[number]) => SHOT_SCALE[s.camera.preset as keyof typeof SHOT_SCALE] ?? "MS";
  // 1) cùng cỡ cảnh liên tục
  let i = 0;
  while (i < shots.length) {
    let j = i;
    while (j + 1 < shots.length && scaleOf(shots[j + 1]) === scaleOf(shots[i])) j++;
    const dur = shots[j]._t1 - shots[i]._t0;
    if (dur > SAME_SCALE_MAX && shots[i].id !== "S1") {
      const sc = scaleOf(shots[i]);
      notes.push({ code: "same_scale", t0: shots[i]._t0, t1: shots[j]._t1, shots: shots.slice(i, j + 1).map((s) => s.id),
        message: `${Math.round(dur)} giây liền cùng cỡ cảnh ${sc} (${fmt(shots[i]._t0)}–${fmt(shots[j]._t1)}).`, suggest: SUGGEST[sc] ?? "đổi cỡ cảnh" });
    }
    i = j + 1;
  }
  // 2) không đổi bối cảnh lẫn góc máy
  const key = (s: (typeof shots)[number]) => `${s.set}|${s.camera.angle ?? "eye_level"}`;
  i = 0;
  while (i < shots.length) {
    let j = i;
    while (j + 1 < shots.length && key(shots[j + 1]) === key(shots[i])) j++;
    const dur = shots[j]._t1 - shots[i]._t0;
    if (dur > STATIC_MAX) {
      notes.push({ code: "static_location", t0: shots[i]._t0, t1: shots[j]._t1, shots: shots.slice(i, j + 1).map((s) => s.id),
        message: `${Math.round(dur)} giây ở cùng bối cảnh, cùng góc ngang tầm mắt (${fmt(shots[i]._t0)}–${fmt(shots[j]._t1)}).`,
        suggest: "chuyển sang bối cảnh khác (location), một cảnh cắt gag ở sân khấu hướng dẫn, hoặc đổi góc (low_angle, high_angle, birds_eye)" });
    }
    i = j + 1;
  }
  // 3) một preset chiếm quá nửa số cảnh (từ 6 cảnh trở lên)
  if (shots.length >= 6) {
    const count: Record<string, number> = {};
    for (const s of shots) count[s.camera.preset] = (count[s.camera.preset] ?? 0) + 1;
    const [top, n] = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
    if (n / shots.length > 0.5) notes.push({ code: "low_variety", t0: shots[0]._t0, t1: shots[shots.length - 1]._t1, shots: [],
      message: `${n}/${shots.length} cảnh cùng một kiểu máy ${top}.`, suggest: "trộn đủ thang cỡ cảnh: ews/ws mở cảnh, ms hội thoại, cu phản ứng, ots đối đáp" });
  }
  return notes;
}
