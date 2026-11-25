// Động học thuận (FK) của rig minifig, khớp quy ước Blender:
// mọi xương chĩa +Z, roll 0 => ma trận nghỉ của xương = T(head) * Rx(90°).
// pose(b) = pose(cha) * inv(nghỉ(cha)) * nghỉ(b) * Euler(b); điểm gắn vào xương b: world = RigW * pose(b) * inv(nghỉ(b)) * điểm.
import type { Manifest, V3 } from "@lse/shared";
import { M4, apply, eulerXYZ, invRigid, mul, mulAll, rotX, rotZ, translation } from "./math3";

const BONE_ROLL = rotX(Math.PI / 2);

export class RigModel {
  readonly order: string[];
  private rest: Record<string, M4> = {};
  private restInv: Record<string, M4> = {};
  private parent: Record<string, string | null> = {};

  constructor(readonly manifest: Manifest) {
    const bones = manifest.rig.bones;
    this.order = [];
    const visit = (b: string) => {
      if (this.order.includes(b)) return;
      const p = bones[b].parent;
      if (p) visit(p);
      this.order.push(b);
    };
    Object.keys(bones).forEach(visit);
    for (const b of this.order) {
      this.rest[b] = mul(translation(bones[b].head), BONE_ROLL);
      this.restInv[b] = invRigid(this.rest[b]);
      this.parent[b] = bones[b].parent;
    }
  }

  /** Ma trận thế giới của rig (đặt + quay quanh Z). */
  static rigWorld(root: [number, number, number, number]): M4 {
    return mul(translation([root[0], root[1], root[2]]), rotZ(root[3]));
  }

  /** Ma trận "điểm-nghỉ -> thế giới" cho từng xương. */
  deform(root: [number, number, number, number], joints: Record<string, V3>): Record<string, M4> {
    const pose: Record<string, M4> = {};
    const out: Record<string, M4> = {};
    const W = RigModel.rigWorld(root);
    for (const b of this.order) {
      const e = joints[b] ?? [0, 0, 0];
      const local = eulerXYZ(e[0], e[1], e[2]);
      const p = this.parent[b];
      pose[b] = p ? mulAll(pose[p], this.restInv[p], this.rest[b], local) : mul(this.rest[b], local);
      out[b] = mulAll(W, pose[b], this.restInv[b]);
    }
    return out;
  }

  headCenter(root: [number, number, number, number], joints: Record<string, V3>): V3 {
    return apply(this.deform(root, joints).head, [0, 0, this.manifest.rig.head_center_z]);
  }

  headPoints(fig: string, root: [number, number, number, number], joints: Record<string, V3>): V3[] {
    const m = this.deform(root, joints).head;
    const boxes = this.manifest.cast[fig]?.head_boxes ?? [];
    return boxes.flatMap((b) => b.corners.map((c) => apply(m, c)));
  }
}
