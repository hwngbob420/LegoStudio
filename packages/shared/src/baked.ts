// Kiểu dữ liệu của manifest (Blender xuất) và baked_timeline (director nướng).
// Đơn vị: mét, trục Blender (Z lên). Mảng theo khung: phần tử 0 = khung 1.

export type V3 = [number, number, number];

export interface Manifest {
  version: number;
  source_hash: string;
  rig: { bones: Record<string, { head: V3; parent: string | null }>; head_center_z: number };
  cast: Record<string, { head_boxes: { part: string; corners: V3[] }[] }>;
  sets: Record<string, {
    anchors: Record<string, { location: V3; facing_deg: number }>;
    objects: ManifestObject[];
    /** Gđ 6 (set 3 vòng): bán kính vòm trời (m) tính từ tâm set; có trường này = set thế hệ mới */
    extent?: number;
    /** chiều cao vòm (m) */
    dome_h?: number;
    /** cao độ mặt sân diễn (m) */
    floor_z?: number;
    /** tâm sân diễn (m, toạ độ của set) */
    center?: V3;
  }>;
}

export interface ManifestObject {
  name: string;
  step: number;
  loc: V3;
  /** Gđ 6: hộp bao [minx, miny, minz, maxx, maxy, maxz] (m, toạ độ set) */
  bb?: [number, number, number, number, number, number];
  /** Gđ 6: nhóm cutaway (ceiling, front, side...) — bộ đạo diễn ẩn khi chắn máy */
  cut?: string;
  /** Gđ 6: vật gộp (vòng 2/3): hộp bao từng khối con, dùng cho kiểm che khuất */
  parts?: [number, number, number, number, number, number][];
  /** Gđ 6: vòng 1/2/3 */
  ring?: number;
  /** Gđ 6: vật treo / gắn tường có chủ ý, bộ kiểm "lơ lửng" bỏ qua */
  float_ok?: boolean;
  /** Gđ 6: kính / ô cửa sáng — nhìn xuyên được, không tính là vật che */
  see_through?: boolean;
  label?: string;
}

export interface BakedActor {
  fig: string;
  set: string;
  mark: string;
  props: string[];
  prop_color?: string;
  /** [x, y, z, rotZ] mỗi khung */
  root: [number, number, number, number][];
  /** Euler XYZ (radian) của từng khớp mỗi khung */
  joints: Record<string, V3[]>;
  /** [ô mắt, ô miệng] mỗi khung */
  face: [number, number][];
}

export interface BakedShot {
  id: string;
  f0: number;
  f1: number;
  lens: number;
  fstop: number;
  shift: [number, number];
  focus: { actor: string } | { distance: number };
  /** [x, y, z, rx, ry, rz] mỗi khung từ f0 đến f1 */
  keys: [number, number, number, number, number, number][];
}

export interface BakedTimeline {
  version: number;
  episode: string;
  fps: number;
  fps_out: number;
  frames: number;
  duration: number;
  resolution: [number, number];
  samples?: number;
  sets: { id: string; origin: V3; lighting: string }[];
  actors: Record<string, BakedActor>;
  shots: BakedShot[];
  /** Gạch nào hiện ở khung nào (lắp ráp). Gạch không có tên ở đây thì hiện từ đầu. */
  assembly: { set: string; lift: number; show: Record<string, number> }[];
  fx: { kind: string; actor: string; f0: number; f1: number; loc: V3; shot: string; size: number }[];
  sfx: { t: number; type: string; gain: number }[];
  /** Hộp đầu dự đoán (chiếu bằng toán, không cần Blender) để kiểm luật không che mặt. */
  qa: { shot: string; key_f: number; samples: { f: number; t: number; heads: Record<string, [number, number, number, number]> }[] }[];
  /** Block ~2 phút (5B): dải khung + mã băm lát timeline (đổi = phải render lại block đó). */
  blocks?: { id: string; f0: number; f1: number; hash: string }[];
  /**
   * Gđ 6 (chỉ có khi tập dùng set 3 vòng / ngữ pháp máy mới; tập cũ không có trường này nên nướng ra y hệt):
   * - shot_set: set của từng cảnh (cùng thứ tự shots). Máy chiếu chỉ bật đèn + trời của set đó.
   * - visibility: lịch hiện/ẩn hợp nhất (lắp ráp VÀ cutaway) cho vật cutaway: [khung, 1 hiện | 0 ẩn] từ khung 1.
   * - hidden: vật cutaway bị ẩn ở từng cảnh (để Studio/QA đọc).
   */
  stage?: {
    shot_set: string[];
    visibility: Record<string, [number, 0 | 1][]>;
    hidden: Record<string, string[]>;
  };
}
