// Shorts dọc 1080x1920 từ cùng một storyboard: chủ thể đứng giữa khung, thẻ chữ dời lên vùng "upper" phía trên,
// phụ đề giữ dải dưới; mũi tên (toạ độ theo khung ngang) bỏ đi. Camera tự tính lại theo khung dọc (camera.ts).
import type { Storyboard } from "@lse/shared";

export const SHORTS_MAX_SEC = 60;

export function makeShorts(sb: Storyboard, episodeId: string): Storyboard {
  const out = structuredClone(sb);
  out.episode = episodeId;
  out.title = `${sb.title} (Shorts)`;
  out.resolution = [1080, 1920];
  out.shots = out.shots.map((s) => ({
    ...s,
    subject_zone: "center",
    ui_safe_zone: s.ui_safe_zone === "none" ? "none" : "upper",
    camera: {
      ...s.camera,
      yaw: undefined,
      // khung dọc hẹp: hai người cần chiếm phần lớn bề ngang; cận gần hơn chút cho mặt to trên điện thoại
      ...(s.camera.preset === "two_shot" ? { spread: 0.62 } : {}),
      ...(s.camera.preset === "mcu" ? { distance: (s.camera.distance ?? 0.95) * 0.85, shift_y: 0.15 } : {}),
      ...(s.camera.preset === "ecu" ? { shift_y: 0.06 } : {}),
      ...(s.camera.preset === "two_shot" ? { shift_y: 0.06 } : {}),
    },
  }));
  out.ui = out.ui.filter((c) => c.type !== "arrow").map((c) => ("zone" in c ? { ...c, zone: "upper" as const } : c));
  return out;
}
