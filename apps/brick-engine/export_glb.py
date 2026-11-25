"""Export channel-library geometry as .glb for the Three.js preview (phase C).

    blender -b --factory-startup -P apps/brick-engine/export_glb.py

Writes workspace/channel_library/baked/glb/:
    cast_<id>.glb      every rigid minifig part in REST figure space, extras {"bone": <joint>, "part": <name>}
    prop_mug.glb       the mug at its own origin (preview attaches it to hand.R like Blender does)
    set_<SetId>.glb    every brick of the set at set origin (0,0,0), node names == manifest object names
Coordinates stay Blender Z-up (export_yup=False). The preview converts axes in ONE place (scene root).
Rig motion is NOT exported: the preview applies packages/director FK per frame, same as Blender.
"""
import json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy  # noqa: E402

import paths as P  # noqa: E402
import minifig_builder as MB  # noqa: E402
import sets_library as SL  # noqa: E402


def wipe():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o)


def export(objs, path):
    vl = bpy.context.view_layer
    for o in list(vl.objects):
        if o is not None:
            o.select_set(False)
    for o in objs:
        o.select_set(True)
    vl.objects.active = objs[0]
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_yup=False,
                              export_extras=True, export_apply=False, export_animations=False, export_cameras=False,
                              export_lights=False)


def main():
    os.makedirs(P.GLB, exist_ok=True)
    report = {}
    for fn in sorted(os.listdir(P.CAST)):
        if not fn.endswith(".json"):
            continue
        cid = fn[:-5]
        wipe()
        rig = MB.build_minifig(cid)
        bpy.context.view_layer.update()
        parts = []
        for ob in list(rig.children):
            if ob.type != "MESH":
                continue
            mw = ob.matrix_world.copy()
            bone = ob.parent_bone
            ob.parent = None
            ob.matrix_world = mw
            ob["bone"] = bone
            ob["part"] = ob.name.split("_", 2)[-1]
            parts.append(ob)
        out = os.path.join(P.GLB, f"cast_{cid}.glb")
        export(parts, out)
        report[out] = len(parts)
    wipe()
    me = MB.mesh_mug()
    if not me.materials:
        me.materials.append(None)
    mug = bpy.data.objects.new("mug", me)
    bpy.context.scene.collection.objects.link(mug)
    export([mug], os.path.join(P.GLB, "prop_mug.glb"))
    for sid, builder in SL.SETS.items():
        wipe()
        sb = builder(origin=(0, 0, 0))
        bpy.context.view_layer.update()
        objs = [o for o in sb.coll.objects if o.type == "MESH"]
        out = os.path.join(P.GLB, f"set_{sid}.glb")
        export(objs, out)
        report[out] = len(objs)
    for k, v in report.items():
        print(f"[glb] {os.path.basename(k)}: {v} nodes, {os.path.getsize(k) // 1024} KB")


if __name__ == "__main__":
    main()
