"""Brick look-dev: ABS plastic materials, 2D face material, lighting presets, render settings.

Runs inside Blender (bpy + stdlib only).
"""
from __future__ import annotations
import json, math, os
import bpy

ENGINE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(ENGINE_DIR)
VAULT = os.path.join(ROOT, "vault_config")
ASSETS = os.path.join(ROOT, "asset_vault")
PALETTE = json.load(open(os.path.join(VAULT, "palette.json"), encoding="utf-8"))
FACE_SPEC = json.load(open(os.path.join(VAULT, "face_atlases", "face_atlas_spec.json"), encoding="utf-8"))


def srgb_to_lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def color(name_or_hex, alpha=1.0):
    h = PALETTE.get(name_or_hex, name_or_hex).lstrip("#")
    return tuple(srgb_to_lin(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (alpha,)


def _inp(node, *names):
    for n in names:
        if n in node.inputs:
            return node.inputs[n]
    return None


def _set(node, value, *names):
    s = _inp(node, *names)
    if s is not None:
        s.default_value = value


def _new_mat(name):
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    return m


_MAT_CACHE: dict = {}


def abs_material(cname: str, kind: str = "abs"):
    """Glossy ABS plastic with a hint of subsurface. kind: abs | trans | glow | matte | metal."""
    key = (cname, kind)
    if key in _MAT_CACHE:
        return _MAT_CACHE[key]
    m = _new_mat(f"ABS_{cname}_{kind}")
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    col = color(cname)
    _set(b, col, "Base Color")
    _set(b, 0.22, "Roughness")
    _set(b, 0.5, "Specular IOR Level")
    _set(b, 0.35, "Coat Weight")
    _set(b, 0.06, "Coat Roughness")
    _set(b, 0.06, "Subsurface Weight")
    _set(b, 0.02, "Subsurface Scale")
    _set(b, col[:3], "Subsurface Radius")
    if kind == "trans":
        _set(b, 0.9, "Transmission Weight")
        _set(b, 0.05, "Roughness")
        _set(b, 0.0, "Subsurface Weight")
        m.surface_render_method = "BLENDED" if hasattr(m, "surface_render_method") else None
    elif kind == "glow":
        _set(b, col, "Emission Color")
        _set(b, 3.0, "Emission Strength")
    elif kind == "matte":
        _set(b, 0.6, "Roughness")
        _set(b, 0.0, "Coat Weight")
    elif kind == "metal":
        _set(b, 1.0, "Metallic")
        _set(b, 0.25, "Roughness")
    m.diffuse_color = col
    _MAT_CACHE[key] = m
    return m


def image(path, colorspace="sRGB"):
    name = os.path.basename(path)
    img = bpy.data.images.get(name)
    if img is None:
        img = bpy.data.images.load(path)
        try:
            img.colorspace_settings.name = colorspace
        except Exception:
            pass
    return img


def textured_material(name, cname, tex_path, mapping="UV"):
    """ABS base colour with an alpha-over printed decal (torso prints, screens)."""
    m = abs_material(cname).copy()
    m.name = name
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    tx = nt.nodes.new("ShaderNodeTexImage")
    tx.image = image(tex_path)
    tx.extension = "CLIP"
    nt.links.new(tc.outputs[mapping], tx.inputs["Vector"])
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.inputs["A"].default_value = color(cname)
    nt.links.new(tx.outputs["Alpha"], mix.inputs["Factor"])
    nt.links.new(tx.outputs["Color"], mix.inputs["B"])
    nt.links.new(mix.outputs["Result"], b.inputs["Base Color"])
    return m


def screen_material(name, tex_path, strength=2.2, mapping="Generated"):
    """Emissive printed tile (monitor screens, backlit menus, stage screens)."""
    m = _new_mat(name)
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    tx = nt.nodes.new("ShaderNodeTexImage")
    tx.image = image(tex_path)
    nt.links.new(tc.outputs[mapping], tx.inputs["Vector"])
    nt.links.new(tx.outputs["Color"], b.inputs["Base Color"])
    nt.links.new(tx.outputs["Color"], _inp(b, "Emission Color"))
    _set(b, strength, "Emission Strength")
    _set(b, 0.15, "Roughness")
    _set(b, 0.4, "Coat Weight")
    return m


def matte_material(name, cname, strength=0.0):
    m = _new_mat(name)
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    _set(b, color(cname), "Base Color")
    _set(b, 0.9, "Roughness")
    _set(b, 0.0, "Specular IOR Level")
    if strength:
        _set(b, color(cname), "Emission Color")
        _set(b, strength, "Emission Strength")
    return m


def face_material(fig_id: str, skin: str):
    """Head material: skin ABS + detail layer + eyes atlas cell + mouth atlas cell.

    Cells are chosen by object custom properties `face_expr` / `face_mouth` (Attribute node, OBJECT type),
    so a constant keyframe switches the face on an exact frame. The head mesh UV maps u 0..1 across the
    front arc and v 0..1 over head height; outside that range the overlay alpha is masked to zero.
    """
    cols, rows = FACE_SPEC["grid"]
    m = abs_material(skin).copy()
    m.name = f"Face_{fig_id}"
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["UV"], sep.inputs[0])

    def inside(axis):
        g = nt.nodes.new("ShaderNodeMath"); g.operation = "GREATER_THAN"; g.inputs[1].default_value = 0.0
        l = nt.nodes.new("ShaderNodeMath"); l.operation = "LESS_THAN"; l.inputs[1].default_value = 1.0
        nt.links.new(sep.outputs[axis], g.inputs[0]); nt.links.new(sep.outputs[axis], l.inputs[0])
        mm = nt.nodes.new("ShaderNodeMath"); mm.operation = "MULTIPLY"
        nt.links.new(g.outputs[0], mm.inputs[0]); nt.links.new(l.outputs[0], mm.inputs[1])
        return mm.outputs[0]

    mu, mv = inside("X"), inside("Y")
    mask = nt.nodes.new("ShaderNodeMath"); mask.operation = "MULTIPLY"
    nt.links.new(mu, mask.inputs[0]); nt.links.new(mv, mask.inputs[1])

    def atlas_layer(prop, tex_path):
        at = nt.nodes.new("ShaderNodeAttribute"); at.attribute_type = "OBJECT"; at.attribute_name = prop
        col_i = nt.nodes.new("ShaderNodeMath"); col_i.operation = "FLOORED_MODULO"; col_i.inputs[1].default_value = cols
        nt.links.new(at.outputs["Fac"], col_i.inputs[0])
        row_d = nt.nodes.new("ShaderNodeMath"); row_d.operation = "DIVIDE"; row_d.inputs[1].default_value = cols
        nt.links.new(at.outputs["Fac"], row_d.inputs[0])
        row_i = nt.nodes.new("ShaderNodeMath"); row_i.operation = "FLOOR"
        nt.links.new(row_d.outputs[0], row_i.inputs[0])
        # image v=0 is bottom; row 0 is top -> v_off = rows-1-row
        vflip = nt.nodes.new("ShaderNodeMath"); vflip.operation = "SUBTRACT"; vflip.inputs[0].default_value = rows - 1
        nt.links.new(row_i.outputs[0], vflip.inputs[1])
        off = nt.nodes.new("ShaderNodeCombineXYZ")
        nt.links.new(col_i.outputs[0], off.inputs["X"]); nt.links.new(vflip.outputs[0], off.inputs["Y"])
        add = nt.nodes.new("ShaderNodeVectorMath"); add.operation = "ADD"
        nt.links.new(tc.outputs["UV"], add.inputs[0]); nt.links.new(off.outputs[0], add.inputs[1])
        sc = nt.nodes.new("ShaderNodeVectorMath"); sc.operation = "MULTIPLY"
        sc.inputs[1].default_value = (1 / cols, 1 / rows, 1)
        nt.links.new(add.outputs[0], sc.inputs[0])
        tx = nt.nodes.new("ShaderNodeTexImage"); tx.image = image(tex_path); tx.extension = "CLIP"
        tx.interpolation = "Cubic"
        nt.links.new(sc.outputs[0], tx.inputs["Vector"])
        return tx

    def plain_layer(tex_path):
        tx = nt.nodes.new("ShaderNodeTexImage"); tx.image = image(tex_path); tx.extension = "CLIP"
        nt.links.new(tc.outputs["UV"], tx.inputs["Vector"])
        return tx

    tex = os.path.join(ASSETS, "textures")
    base = color(skin)
    cur = None
    layers = []
    det = os.path.join(tex, f"detail_{fig_id}.png")
    if os.path.exists(det):
        layers.append(plain_layer(det))
    layers.append(atlas_layer("face_expr", os.path.join(tex, "atlas_eyes.png")))
    layers.append(atlas_layer("face_mouth", os.path.join(tex, "atlas_mouths.png")))
    for tx in layers:
        fac = nt.nodes.new("ShaderNodeMath"); fac.operation = "MULTIPLY"
        nt.links.new(tx.outputs["Alpha"], fac.inputs[0]); nt.links.new(mask.outputs[0], fac.inputs[1])
        mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"
        if cur is None:
            mix.inputs["A"].default_value = base
        else:
            nt.links.new(cur, mix.inputs["A"])
        nt.links.new(fac.outputs[0], mix.inputs["Factor"])
        nt.links.new(tx.outputs["Color"], mix.inputs["B"])
        cur = mix.outputs["Result"]
    nt.links.new(cur, b.inputs["Base Color"])
    # printed ink is a touch rougher than the gloss plastic
    return m


# ------------------------------------------------------------------ lighting & render
def load_lighting(preset_name: str) -> dict:
    return json.load(open(os.path.join(VAULT, "lighting_presets", f"{preset_name}.json"), encoding="utf-8"))


def setup_world(preset: dict):
    sc = bpy.context.scene
    w = sc.world or bpy.data.worlds.new("World")
    sc.world = w
    try:
        w.use_nodes = True
    except Exception:
        pass
    nt = w.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = preset.get("hdri_strength", 1.0)
    hdri = os.path.join(ASSETS, "hdri", preset.get("hdri", "") or "_none_")
    if preset.get("hdri") and os.path.exists(hdri):
        tc = nt.nodes.new("ShaderNodeTexCoord")
        mp = nt.nodes.new("ShaderNodeMapping")
        mp.inputs["Rotation"].default_value = (0, 0, math.radians(preset.get("hdri_rotation_deg", 0)))
        env = nt.nodes.new("ShaderNodeTexEnvironment")
        env.image = bpy.data.images.load(hdri)
        nt.links.new(tc.outputs["Generated"], mp.inputs["Vector"])
        nt.links.new(mp.outputs["Vector"], env.inputs["Vector"])
        # tint for mood
        mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"; mix.blend_type = "MULTIPLY"
        mix.inputs["Factor"].default_value = 1.0
        mix.inputs["B"].default_value = color(preset.get("world_tint", "#FFFFFF"))
        nt.links.new(env.outputs["Color"], mix.inputs["A"])
        nt.links.new(mix.outputs["Result"], bg.inputs["Color"])
    else:
        bg.inputs["Color"].default_value = color(preset.get("world_color", "#9FB8D0"))
    nt.links.new(bg.outputs[0], out.inputs["Surface"])


def add_light(name, kind, loc, rot_deg, energy, col="#FFFFFF", size=1.0, coll=None):
    ld = bpy.data.lights.new(name, kind)
    ld.energy = energy
    ld.color = color(col)[:3]
    if kind == "AREA":
        ld.size = size
    elif kind in ("POINT", "SPOT"):
        ld.shadow_soft_size = size
    elif kind == "SUN":
        ld.angle = math.radians(size)
    ob = bpy.data.objects.new(name, ld)
    ob.location = loc
    ob.rotation_euler = [math.radians(a) for a in rot_deg]
    (coll or bpy.context.scene.collection).objects.link(ob)
    return ob


def aim(ob, target):
    from mathutils import Vector
    d = Vector(target) - ob.location
    ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


def setup_lights(preset: dict, center=(0, 0, 0), coll=None):
    """Key + fill + rim rig declared in the preset, positioned relative to the set centre."""
    from mathutils import Vector
    c = Vector(center)
    obs = []
    for L in preset.get("lights", []):
        ob = add_light(L["name"], L["type"], c + Vector(L["offset"]), (0, 0, 0), L["energy"],
                       L.get("color", "#FFFFFF"), L.get("size", 1.0), coll)
        aim(ob, c + Vector(L.get("aim_offset", (0, 0, 0.3))))
        obs.append(ob)
    return obs


def setup_render(width=1920, height=1080, fps=12, samples=32, fast=False):
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE"
    sc.render.resolution_x, sc.render.resolution_y = width, height
    sc.render.resolution_percentage = 100
    sc.render.fps = fps
    sc.render.fps_base = 1
    sc.render.film_transparent = False
    ee = sc.eevee
    for attr, val in (("taa_render_samples", 8 if fast else samples), ("use_raytracing", not fast),
                      ("use_shadows", True), ("shadow_ray_count", 1), ("shadow_step_count", 4 if not fast else 2),
                      ("use_gtao", True), ("fast_gi_method", "GLOBAL_ILLUMINATION"), ("use_fast_gi", True),
                      ("ray_tracing_method", "SCREEN"), ("volumetric_tile_size", "16")):
        try:
            setattr(ee, attr, val)
        except Exception:
            pass
    try:
        ee.ray_tracing_options.resolution_scale = "2"
        ee.ray_tracing_options.use_denoise = True
    except Exception:
        pass
    vs = sc.view_settings
    vs.exposure = -0.2
    try:
        vs.view_transform = "AgX"
        vs.look = "AgX - Medium High Contrast"
    except Exception:
        try:
            vs.look = "Medium High Contrast"
        except Exception:
            pass
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGB"
    try:
        sc.render.image_settings.compression = 15
    except Exception:
        pass
