"""Compare head boxes of two contact.json files (regression gate). Exit 1 when any edge moves more than --tol (fraction of frame).

    python apps/brick-engine/tools/compare_contact.py <baseline contact.json> <new contact.json> [--tol 0.005]
"""
import json, sys

a, b = json.load(open(sys.argv[1], encoding="utf-8")), json.load(open(sys.argv[2], encoding="utf-8"))
tol = float(sys.argv[sys.argv.index("--tol") + 1]) if "--tol" in sys.argv else 0.005
worst, rows = 0.0, []
for sa, sb in zip(a["shots"], b["shots"]):
    for actor, ba in sa["heads"].items():
        bb = sb["heads"].get(actor)
        if bb is None:
            rows.append(f"{sa['id']} {actor}: MISSING in new"); worst = 1.0; continue
        d = max(abs(x - y) for x, y in zip(ba, bb))
        worst = max(worst, d)
        rows.append(f"{sa['id']} {actor}: max edge diff {d:.5f}")
print("\n".join(rows))
print(f"worst {worst:.5f} (tol {tol}) -> {'PASS' if worst <= tol else 'FAIL'}")
sys.exit(0 if worst <= tol else 1)
