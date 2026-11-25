"""Export the geometry facts the TypeScript director needs -> workspace/channel_library/manifest.json

    blender -b --factory-startup -P apps/brick-engine/export_manifest.py

Everything is in Blender world units (Z up, metres) relative to each set's origin / each figure's rig origin.
"""
import hashlib, json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import paths as P  # noqa: E402
import minifig_builder as MB  # noqa: E402
import sets_library as SL  # noqa: E402

R = lambda v, n=5: [round(float(x), n) for x in v]


def source_hash():
    h = hashlib.sha1()
    for fn in ("brick_builder.py", "sets_library.py", "minifig_builder.py"):
        h.update(open(os.path.join(P.ENGINE, fn), "rb").read().replace(b"\r\n", b"\n"))
    return h.hexdigest()[:12]


def main():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)
    out = {"version": 1, "units": "blender metres, Z up", "source_hash": source_hash(),
           "rig": {"bones": {}, "head_center_z": round((MB.HEAD_Z0 + MB.HEAD_Z1) / 2, 6)}, "cast": {}, "sets": {}}
    for bn, (head, parent) in MB.BONES.items():
        out["rig"]["bones"][bn] = {"head": R(head, 6), "parent": parent}
    for sid, builder in SL.SETS.items():
        sb = builder(origin=(0, 0, 0))
        bpy.context.view_layer.update()
        objs = [{"name": o.name, "step": int(o.get("step", 0)), "loc": R(o.matrix_world.translation, 6)} for o in sb.objects]
        out["sets"][sid] = {"anchors": {k: {"location": R(v["location"], 6), "facing_deg": v["facing_deg"]} for k, v in sb.anchors.items()},
                            "objects": objs}
    for cid in sorted(P.cast_recipe_files()):
        rig = MB.build_minifig(cid)
        bpy.context.view_layer.update()
        boxes = []
        for ob in rig.children:
            if ob.parent_bone == "head" and ob.type == "MESH":
                boxes.append({"part": ob.name.split("_", 1)[-1] if "_" in ob.name else ob.name,
                              "corners": [R(ob.matrix_world @ Vector(c), 6) for c in ob.bound_box]})
        out["cast"][cid] = {"head_boxes": boxes}
    os.makedirs(os.path.dirname(P.MANIFEST), exist_ok=True)
    json.dump(out, open(P.MANIFEST, "w", encoding="utf-8"), separators=(",", ":"))
    print(f"[manifest] {len(out['sets'])} sets, {len(out['cast'])} cast -> {P.MANIFEST} ({os.path.getsize(P.MANIFEST) // 1024} KB)")


if __name__ == "__main__":
    main()
