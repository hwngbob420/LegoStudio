// Props cho lớp chữ Remotion (bản TS của remotion_props.py) + bộ kiểm "không che mặt" chạy không cần Blender.
import { SUBTITLE_BAND, Timeline, UI_ZONES, type BakedTimeline, type Storyboard, type Timing } from "@lse/shared";

export interface OverlayProps {
  fps: number;
  duration: number;
  width: number;
  height: number;
  cues: Record<string, unknown>[];
  subtitles: { id: string; speaker: string; color: string; start: number; end: number; words: { t: number; text: string }[] }[];
  shots: { id: string; t0: number; t1: number }[];
}

export function overlayProps(sb: Storyboard, timing: Timing, castNames: Record<string, string>): OverlayProps {
  const tl = new Timeline(timing);
  const shots = tl.resolveShots(sb.shots);
  const cues = sb.ui.map((c) => {
    const r: Record<string, unknown> = { ...c, t0: tl.t(c.t0), t1: tl.t(c.t1) };
    if ("zone" in c) r.rect = UI_ZONES[c.zone];
    if (c.type === "brick_chart") {
      r.bars = c.bars.map((b) => ({ ...b, t: tl.t(b.t), ...(b.collapse_t !== undefined ? { collapse_t: tl.t(b.collapse_t) } : {}) }));
    }
    return r;
  });
  const colors = sb.subtitles?.speaker_colors ?? {};
  const subtitles = Object.entries(timing.lines).map(([id, L]) => {
    const tokens = L.text.split(/\s+/).filter(Boolean);
    const words = L.words.map((w, i) => ({ t: w[0], text: tokens.length === L.words.length ? tokens[i] : w[1] }));
    return { id, speaker: castNames[L.speaker] ?? L.speaker, color: colors[L.speaker] ?? "#FFFFFF", start: L.start, end: L.end, words };
  });
  return {
    fps: sb.fps_out, duration: shots[shots.length - 1]._t1, width: sb.resolution[0], height: sb.resolution[1],
    cues, subtitles, shots: shots.map((s) => ({ id: s.id, t0: s._t0, t1: s._t1 })),
  };
}

/**
 * Lát lớp chữ theo block: giữ thẻ/phụ đề/cảnh giao với [t0, t1), dời mốc về 0 (block xem riêng trong Player,
 * render lớp chữ riêng từng block ở 5D). Thẻ bắt đầu trước block bị kẹp về 0.
 */
export function sliceOverlay(ov: OverlayProps, t0: number, t1: number): OverlayProps {
  const r = (x: number) => Math.round((x - t0) * 1e5) / 1e5;
  const hit = (a: number, b: number) => b > t0 + 1e-9 && a < t1 - 1e-9;
  const cues = ov.cues.filter((c) => hit(c.t0 as number, c.t1 as number)).map((c) => {
    const o: Record<string, unknown> = { ...c, t0: Math.max(0, r(c.t0 as number)), t1: Math.min(t1 - t0, r(c.t1 as number)) };
    if (Array.isArray(c.bars)) o.bars = (c.bars as Record<string, number>[]).map((b) => ({ ...b, t: r(b.t), ...(b.collapse_t !== undefined ? { collapse_t: r(b.collapse_t) } : {}) }));
    return o;
  });
  const subtitles = ov.subtitles.filter((s) => hit(s.start, s.end)).map((s) => ({ ...s, start: r(s.start), end: r(s.end), words: s.words.map((w) => ({ ...w, t: r(w.t) })) }));
  const shots = ov.shots.filter((s) => hit(s.t0, s.t1)).map((s) => ({ ...s, t0: Math.max(0, r(s.t0)), t1: Math.min(t1 - t0, r(s.t1)) }));
  return { ...ov, duration: Math.round((t1 - t0) * 1e5) / 1e5, cues, subtitles, shots };
}

export interface Issue {
  level: "error" | "warn";
  shot: string;
  code: "cue_over_face" | "zone_over_face" | "face_in_subtitles" | "head_clipped" | "short_shot";
  message: string;
  t?: number;
}

const overlap = (a: number[], b: number[]) =>
  Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));

/** Luật không che mặt + vài luật bố cục, dựa trên hộp đầu dự đoán của bộ đạo diễn. */
export function validateLayout(T: BakedTimeline, sb: Storyboard, ov: OverlayProps): Issue[] {
  const issues: Issue[] = [];
  sb.shots.forEach((s, i) => {
    const q = T.qa[i];
    const shot = T.shots[i];
    if (shot.f1 - shot.f0 + 1 < 6) issues.push({ level: "warn", shot: s.id, code: "short_shot", message: `Cảnh ${s.id} chỉ dài ${shot.f1 - shot.f0 + 1} khung (dưới 0,5 giây).` });
    const zone = s.ui_safe_zone !== "none" ? UI_ZONES[s.ui_safe_zone] : null;
    for (const smp of q.samples) {
      for (const [aid, bb] of Object.entries(smp.heads)) {
        if (zone && overlap(bb, zone) > 0)
          issues.push({ level: "error", shot: s.id, code: "zone_over_face", t: smp.t, message: `Cảnh ${s.id}: mặt ${aid} chạm vùng chữ ${s.ui_safe_zone}. Đặt chủ thể sang 1/3 đối diện.` });
        if (overlap(bb, SUBTITLE_BAND) > 0.0005)
          issues.push({ level: "error", shot: s.id, code: "face_in_subtitles", t: smp.t, message: `Cảnh ${s.id}: mặt ${aid} rơi vào dải phụ đề.` });
        if ((bb[0] < 0 || bb[1] < 0 || bb[2] > 1 || bb[3] > 1) && s.subject_zone !== "center" && smp.f === q.key_f)
          issues.push({ level: "warn", shot: s.id, code: "head_clipped", t: smp.t, message: `Cảnh ${s.id}: đầu ${aid} bị cắt mép khung.` });
        for (const c of ov.cues) {
          if (!((c.t0 as number) <= smp.t && smp.t <= (c.t1 as number))) continue;
          let rect = c.rect as number[] | undefined;
          if (c.type === "arrow") {
            const from = c.from as number[], to = c.to as number[];
            rect = [Math.min(from[0], to[0]), Math.min(from[1], to[1]), Math.max(from[0], to[0]), Math.max(from[1], to[1])];
          }
          if (rect && overlap(bb, rect) > 0.0004)
            issues.push({ level: "error", shot: s.id, code: "cue_over_face", t: smp.t, message: `Cảnh ${s.id} lúc ${smp.t.toFixed(2)} s: thẻ "${c.type}" che mặt ${aid}.` });
        }
      }
    }
  });
  // gộp lỗi trùng (cùng cảnh + mã + nội dung)
  const seen = new Set<string>();
  return issues.filter((x) => { const k = `${x.shot}|${x.code}|${x.message.replace(/lúc [0-9.]+ s/, "")}`; if (seen.has(k)) return false; seen.add(k); return true; });
}
