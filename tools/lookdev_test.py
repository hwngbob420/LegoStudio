"""Look-dev turntable still: all recipes in a row on a plate. Run:
blender -b --factory-startup -P tools/lookdev_test.py -- out.png [expr_index] [mouth_index]
"""
import sys, os, math
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "engine"))
import bpy
from mathutils import Vector
import look_dev as LD, brick_builder as BB, minifig_builder as MB

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
out = argv[0] if argv else os.path.abspath("lookdev.png")
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o)
LD.setup_render(1280, 720, samples=32)
preset = LD.load_lighting("studio_bright")
LD.setup_world(preset)
LD.setup_lights(preset, (0, 0, 0))
sb = BB.SetBuilder("Plate", origin=(-0.8, -0.5, 0))
sb.place("baseplate", 20, 12, 0, 0, 0, "green_bright")
sb.place("brick", 2, 4, 2, 9, 0, "red")
sb.place("brick", 1, 4, 14, 9, 0, "blue")
sb.place("round", 1, 1, 17, 3, 0, "white")
ids = sorted(f[:-5] for f in os.listdir(MB.RECIPES) if f.endswith(".json"))
for i, fid in enumerate(ids):
    rig = MB.build_minifig(fid)
    rig.location = (-0.5 + i * 0.25, 0, BB.PLATE * 0.5)
    h = MB.head_object(rig)
    if len(argv) > 1:
        h["face_expr"] = float(argv[1])
    if len(argv) > 2:
        h["face_mouth"] = float(argv[2])
    if i == 1:
        rig.pose.bones["arm.R"].rotation_euler = (math.radians(-70), 0, 0)
        rig.pose.bones["head"].rotation_euler = (0, math.radians(20), 0)
    if i == 2:
        rig.pose.bones["arm.L"].rotation_euler = (0, 0, math.radians(60))
        rig.pose.bones["leg.R"].rotation_euler = (math.radians(-30), 0, 0)
cam_d = bpy.data.cameras.new("Cam")
cam = bpy.data.objects.new("Cam", cam_d)
bpy.context.scene.collection.objects.link(cam)
cam.location = (0.0, -1.55, 0.42)
LD.aim(cam, (0.0, 0, 0.2))
cam_d.lens = 50
cam_d.dof.use_dof = True
cam_d.dof.focus_distance = 1.55
cam_d.dof.aperture_fstop = 2.8
bpy.context.scene.camera = cam
bpy.context.scene.render.filepath = out
bpy.ops.render.render(write_still=True)
print("LOOKDEV_OK", out)
