"""Blender helpers for stop-motion keys.

Gestures, poses and timing moved to packages/director (TypeScript): src/actions.ts + src/acting.ts are the single source.
Blender only keys the baked values; this module keeps the CONSTANT-interpolation helper for Blender 5 slotted actions.
"""
from __future__ import annotations


def set_constant(obj):
    """Force CONSTANT interpolation on every fcurve of obj's action (Blender 5 slotted actions)."""
    ad = obj.animation_data
    if not ad or not ad.action:
        return
    act = ad.action
    curves = []
    if hasattr(act, "fcurves"):
        curves = list(act.fcurves)
    else:
        for layer in act.layers:
            for strip in layer.strips:
                cb = strip.channelbag(ad.action_slot)
                if cb:
                    curves += list(cb.fcurves)
    for fc in curves:
        for k in fc.keyframe_points:
            k.interpolation = "CONSTANT"
