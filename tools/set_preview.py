"""Preview a brick set (wide shot). blender -b --factory-startup -P tools/set_preview.py -- <SetName> <out.png> [lighting]"""
import sys, os, math, time
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "engine"))
import bpy
import look_dev as LD, brick_builder as BB, sets_library as SL, minifig_builder as MB
argv = sys.argv[sys.argv.index("--") + 1:]
name, out = argv[0], argv[1]
light = argv[2] if len(argv) > 2 else "studio_bright"
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o)
t = time.time()
LD.setup_render(1280, 720, samples=24)
p = LD.load_lighting(light); LD.setup_world(p); LD.setup_lights(p, (0, 0, 0))
sb = SL.SETS[name]()
print("parts:", len(sb.objects), "unique meshes:", len(BB._MESH_CACHE), "build s:", round(time.time() - t, 2))
figs = ["max_dev", "priya_lead"]
for fid, an in zip(figs, [a for a in sb.anchors if "mark" in a or a.startswith("cafe") or a.startswith("stage_")][:2]):
    rig = MB.build_minifig(fid)
    a = sb.anchors[an]
    rig.location = a["location"]; rig.rotation_euler = (0, 0, math.radians(a["facing_deg"]))
cd = bpy.data.cameras.new("Cam"); cam = bpy.data.objects.new("Cam", cd); bpy.context.scene.collection.objects.link(cam)
cam.location = (0, -2.9, 1.25); LD.aim(cam, (0, 0.2, 0.25)); cd.lens = 35
cd.dof.use_dof = True; cd.dof.focus_distance = 2.9; cd.dof.aperture_fstop = 2.0
bpy.context.scene.camera = cam
bpy.context.scene.render.filepath = out
bpy.ops.render.render(write_still=True)
print("SET_OK", round(time.time() - t, 1), "s")
