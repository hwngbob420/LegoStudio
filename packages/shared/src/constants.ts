// Hằng số dùng chung cho director, video-engine, server, studio-ui.
// Danh sách nội tại của engine (preset camera, động tác, biểu cảm...) đặt ở đây.
// ID của kho (diễn viên, bộ set) không đặt ở đây: lấy từ workspace/channel_library/catalog.json.

export const FPS_WORLD = 12;
export const FPS_OUT = 60;
export const RESOLUTION = [1920, 1080] as const;
/** 1 núm gạch = 0.08 m (gấp 10 lần thật). */
export const STUD = 0.08;
export const PLATE = 0.032;

export const CAMERA_PRESETS = ["assembly_high", "wide_establish", "mcu", "ecu", "two_shot"] as const;
export const CAMERA_MOVES = ["none", "push_in", "pull_out", "drift_right", "crane_down"] as const;
export const SUBJECT_ZONES = ["left_third", "center", "right_third"] as const;
export const UI_ZONE_NAMES = ["left_third", "right_third", "top_left", "top_right", "top_center", "upper", "none"] as const;

/** Vùng chữ chuẩn hoá [x0, y0, x1, y1], gốc trên-trái. Dùng chung cho Blender, Remotion và cửa kiểm. */
export const UI_ZONES: Record<Exclude<(typeof UI_ZONE_NAMES)[number], "none">, [number, number, number, number]> = {
  left_third: [0.035, 0.1, 0.365, 0.76],
  right_third: [0.635, 0.1, 0.965, 0.76],
  top_left: [0.035, 0.06, 0.4, 0.24],
  top_right: [0.6, 0.06, 0.965, 0.24],
  top_center: [0.32, 0.05, 0.68, 0.22],
  /** Shorts dọc: dải trên cho thẻ chữ, mặt nằm giữa khung */
  upper: [0.06, 0.06, 0.94, 0.3],
};
/** Dải phụ đề dưới đáy: không mặt nào được chạm vào. */
export const SUBTITLE_BAND: [number, number, number, number] = [0.12, 0.83, 0.88, 0.96];
/** Lệch ống kính theo vùng chủ thể (đơn vị: bề rộng khung). */
export const SUBJECT_SHIFT: Record<(typeof SUBJECT_ZONES)[number], number> = {
  left_third: 1 / 6,
  center: 0,
  right_third: -1 / 6,
};

export const ACTIONS = [
  "idle_breathe", "talk_gestures", "talk_both_hands", "shrug_confused", "point_explain", "slump_tired",
  "shock_jump", "walk_stopmotion", "sip_coffee", "nod_yes", "shake_no", "hands_on_hips", "facepalm", "wave", "lean_in",
] as const;
export const EXPRESSIONS = [
  "innocent_dot", "deadpan_tired", "shocked_wide", "smug_smirk", "sweating_nervous", "angry_brow",
  "blink", "happy_closed", "side_glance",
] as const;
export const MOUTHS = ["X", "A", "B", "C", "D", "E", "F", "G", "H", "smirk", "frown", "wavy", "shock_O", "grin"] as const;
export const FX_KINDS = ["sweat_drop", "shock_lines", "question", "exclaim", "sparkle", "anger", "steam", "motion_arcs"] as const;
export const SFX_TYPES = ["clack", "pop", "boing", "whoosh", "ding", "tumble"] as const;
export const UI_CUE_TYPES = ["step_badge", "part_callout", "brick_chart", "arrow"] as const;
export const BONES = ["root", "hips", "torso", "head", "arm.L", "arm.R", "hand.L", "hand.R", "leg.L", "leg.R"] as const;

/** Từ thương hiệu không được xuất hiện trong chữ hiển thị của video. */
export const BRAND_WORDS = /\b(lego|duplo)\b/i;
