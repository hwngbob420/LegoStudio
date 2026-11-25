"""Time references shared by the Blender compiler and the Remotion prop builder (stdlib only).

A time in the shotlist may be a number (seconds) or a reference string:
    "L2.start", "L2.end", "L3.w2" (start of the 2nd word of line L3, 1-based), "S1.t1", "END"
optionally followed by an offset: "L1.start-0.15", "L3.w3+0.1".
"""
from __future__ import annotations
import re

_RX = re.compile(r"\s*([A-Za-z0-9_]+(?:\.[a-z0-9]+)?)\s*(?:([+-])\s*([0-9.]+))?\s*")


class Timeline:
    def __init__(self, timing: dict):
        self.refs: dict = {}
        for lid, L in timing.get("lines", {}).items():
            self.refs[f"{lid}.start"] = L["start"]
            self.refs[f"{lid}.end"] = L["end"]
            for i, w in enumerate(L.get("words", []), 1):
                self.refs[f"{lid}.w{i}"] = w[0]
        self.refs["END"] = timing.get("duration", 0)

    def t(self, v):
        if v is None:
            return None
        if isinstance(v, (int, float)):
            return float(v)
        m = _RX.fullmatch(v)
        if not m or m.group(1) not in self.refs:
            raise ValueError(f"bad time ref {v!r}")
        base = self.refs[m.group(1)]
        if m.group(2):
            base += float(m.group(3)) * (1 if m.group(2) == "+" else -1)
        return base

    def resolve_shots(self, shots):
        for s in shots:
            s["_t0"] = self.t(s["t0"])
            self.refs[f"{s['id']}.t0"] = s["_t0"]
            s["_t1"] = self.t(s["t1"])
            self.refs[f"{s['id']}.t1"] = s["_t1"]
        return shots
