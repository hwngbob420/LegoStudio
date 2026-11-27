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
    objects: { name: string; step: number; loc: V3 }[];
  }>;
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
}
