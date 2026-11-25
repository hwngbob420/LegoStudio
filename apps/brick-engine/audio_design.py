"""Procedural sound design + mix (numpy only, no samples to license).

    python apps/brick-engine/audio_design.py <production_dir>

* SFX: ABS "clack" (bright transient + plastic body ring), pop, boing, whoosh, chart ding, brick tumble.
* BGM: light ukulele-ish pluck + marimba bass + shaker groove, generated to episode length.
* Mix: voice lines placed on the timeline, BGM ducked under speech, soft-limited -> build/mix.wav (48 kHz stereo).
"""
from __future__ import annotations
import json, math, os, sys, wave
import numpy as np

SR = 48000


def _read_wav(p):
    with wave.open(p) as w:
        sr, n, ch = w.getframerate(), w.getnframes(), w.getnchannels()
        a = np.frombuffer(w.readframes(n), dtype=np.int16).astype(np.float32) / 32768
    if ch > 1:
        a = a.reshape(-1, ch).mean(1)
    if sr != SR:
        x = np.linspace(0, len(a) - 1, int(len(a) * SR / sr))
        a = np.interp(x, np.arange(len(a)), a).astype(np.float32)
    return a


def _env(n, attack, decay):
    t = np.arange(n) / SR
    return np.minimum(1, t / max(attack, 1e-4)) * np.exp(-t / decay)


def _bandnoise(n, lo, hi, rng):
    x = rng.standard_normal(n)
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(n, 1 / SR)
    X[(f < lo) | (f > hi)] = 0
    y = np.fft.irfft(X, n)
    return y / (np.abs(y).max() + 1e-9)


def sfx_clack(rng, pitch=1.0):
    n = int(0.16 * SR)
    t = np.arange(n) / SR
    click = _bandnoise(n, 2500 * pitch, 9000, rng) * _env(n, 0.0004, 0.006)
    body = sum(np.sin(2 * math.pi * f * pitch * t + rng.uniform(0, 6)) * a for f, a in ((1650, 0.5), (2380, 0.35), (3900, 0.2)))
    body = body * _env(n, 0.0008, 0.022)
    thump = np.sin(2 * math.pi * 190 * pitch * t) * _env(n, 0.001, 0.018) * 0.6
    # second micro-click (studs seating)
    d = int(rng.uniform(0.012, 0.022) * SR)
    click2 = np.zeros(n)
    click2[d:] = click[: n - d] * 0.5
    return (click + body * 0.6 + thump + click2) * 0.55


def sfx_pop(rng):
    n = int(0.12 * SR)
    t = np.arange(n) / SR
    f = 500 + 900 * np.exp(-t / 0.02)
    return np.sin(2 * math.pi * np.cumsum(f) / SR) * _env(n, 0.001, 0.035) * 0.45


def sfx_boing(rng):
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    f = 260 + 140 * np.sin(2 * math.pi * 11 * t) * np.exp(-t / 0.2) + 200 * np.exp(-t / 0.05)
    return np.sin(2 * math.pi * np.cumsum(f) / SR) * _env(n, 0.002, 0.16) * 0.42


def sfx_whoosh(rng):
    n = int(0.35 * SR)
    t = np.arange(n) / SR
    w = _bandnoise(n, 300, 5000, rng) * np.sin(np.pi * t / t[-1]) ** 2
    return w * 0.22


def sfx_ding(rng):
    n = int(0.7 * SR)
    t = np.arange(n) / SR
    return (np.sin(2 * math.pi * 1568 * t) + 0.4 * np.sin(2 * math.pi * 3136 * t)) * _env(n, 0.002, 0.25) * 0.22


def sfx_tumble(rng):
    out = np.zeros(int(0.9 * SR))
    for k in range(7):
        c = sfx_clack(rng, pitch=rng.uniform(0.75, 1.2)) * rng.uniform(0.4, 0.9)
        p = int((0.05 + k * 0.1 + rng.uniform(-0.03, 0.03)) * SR)
        out[p:p + len(c)] += c[: len(out) - p]
    return out


SFX = {"clack": sfx_clack, "pop": sfx_pop, "boing": sfx_boing, "whoosh": sfx_whoosh, "ding": sfx_ding, "tumble": sfx_tumble}


def pluck(freq, dur, bright=0.6):
    """Karplus-Strong string (ukulele-ish)."""
    n = int(dur * SR)
    p = max(2, int(SR / freq))
    rng = np.random.default_rng(int(freq * 10))
    buf = rng.uniform(-1, 1, p)
    out = np.zeros(n)
    for i in range(n):
        out[i] = buf[i % p]
        buf[i % p] = 0.5 * (buf[i % p] + buf[(i + 1) % p]) * (0.993 + 0.006 * bright)
    return out * _env(n, 0.002, dur * 0.6)


def marimba(freq, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    return (np.sin(2 * math.pi * freq * t) + 0.25 * np.sin(2 * math.pi * freq * 4 * t) * np.exp(-t / 0.05)) * _env(n, 0.003, 0.22)


def note(m):
    return 440 * 2 ** ((m - 69) / 12)


def bgm(duration, bpm=112, seed=4):
    rng = np.random.default_rng(seed)
    n = int(duration * SR) + SR
    out = np.zeros(n)
    beat = 60 / bpm
    # I - vi - IV - V in C, light and cheeky
    prog = [(60, 64, 67), (57, 60, 64), (53, 57, 60), (55, 59, 62)]
    melody = [72, 74, 76, 79, 76, 74, 72, 67, 69, 72, 74, 72, 71, 67, 69, 71]
    cache = {}
    t, bar = 0.0, 0
    while t < duration + 0.5:
        ch = prog[bar % 4]
        for k in range(4):            # strum on beats 1&3, offbeat chops
            for sub, vel in ((0, 0.9), (0.5, 0.45)):
                tt = t + (k + sub) * beat
                for j, m in enumerate(ch):
                    key = ("p", m + 12)
                    if key not in cache:
                        cache[key] = pluck(note(m + 12), 0.5)
                    s = cache[key] * vel * 0.16
                    p = int((tt + j * 0.012) * SR)
                    out[p:p + len(s)] += s[: max(0, n - p)]
            # bass
            key = ("m", ch[0] - 24)
            if key not in cache:
                cache[key] = marimba(note(ch[0] - 24), 0.45)
            if k in (0, 2):
                s = cache[key] * 0.35
                p = int((t + k * beat) * SR)
                out[p:p + len(s)] += s[: max(0, n - p)]
            # shaker
            for sub in (0, 0.25, 0.5, 0.75):
                s = _bandnoise(int(0.05 * SR), 5000, 12000, rng) * _env(int(0.05 * SR), 0.003, 0.012) * (0.05 if sub else 0.08)
                p = int((t + (k + sub) * beat) * SR)
                out[p:p + len(s)] += s[: max(0, n - p)]
        # sparse melody every other bar
        if bar % 2 == 1:
            for i in range(4):
                m = melody[(bar * 4 + i) % len(melody)]
                key = ("mm", m)
                if key not in cache:
                    cache[key] = marimba(note(m), 0.35)
                s = cache[key] * 0.13
                p = int((t + i * beat) * SR)
                out[p:p + len(s)] += s[: max(0, n - p)]
        t += 4 * beat
        bar += 1
    return out[: int(duration * SR)]


def main(prod):
    build = os.path.join(prod, "build")
    timing = json.load(open(os.path.join(build, "timing.json"), encoding="utf-8"))
    ep = json.load(open(os.path.join(prod, "storyboard.json"), encoding="utf-8"))
    dur = float(ep.get("duration_override") or timing["duration"])
    n = int(dur * SR)
    vo = np.zeros(n)
    for lid, L in timing["lines"].items():
        a = _read_wav(L["wav"] if os.path.isabs(L["wav"]) else os.path.join(prod, L["wav"]))
        p = int(L["wav_start"] * SR)
        seg = a[: max(0, n - p)]
        vo[p:p + len(seg)] += seg * 1.15
    sfx = np.zeros(n)
    rng = np.random.default_rng(7)
    events = []
    ev_path = os.path.join(build, "sfx_events.json")
    if os.path.exists(ev_path):
        events += json.load(open(ev_path, encoding="utf-8"))
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from timeref import Timeline
    tl = Timeline(timing)
    tl.resolve_shots(ep["shots"])
    dur = float(ep.get("duration_override") or ep["shots"][-1]["_t1"])
    n = int(dur * SR)
    vo, sfx = vo[:n] if len(vo) >= n else np.pad(vo, (0, n - len(vo))), np.zeros(n)
    events += [dict(e, t=tl.t(e["t"])) for e in ep.get("sfx", [])]
    for e in events:
        t = e["t"]
        s = SFX[e["type"]](rng) * e.get("gain", 1.0)
        p = int(max(0, t) * SR)
        sfx[p:p + len(s)] += s[: max(0, n - p)]
    music = bgm(dur)
    # duck music under speech (smoothed envelope)
    env = np.convolve(np.abs(vo), np.ones(int(0.12 * SR)) / int(0.12 * SR), "same")
    duck = 1 - 0.62 * np.clip(env / (env.max() * 0.25 + 1e-9), 0, 1)
    fade = np.minimum(1, np.arange(n) / (0.4 * SR)) * np.minimum(1, (n - np.arange(n)) / (0.8 * SR))
    mix_m = vo + sfx * 0.9 + music * 0.55 * duck * fade
    # tiny stereo width: SFX/music slightly spread, VO centred
    L = mix_m + 0.08 * np.roll(music * duck, 240)
    R = mix_m + 0.08 * np.roll(music * duck, -240)
    st = np.stack([L, R], 1)
    peak = np.abs(st).max()
    st = np.tanh(st / max(peak, 1e-6) * 1.4) * 0.89   # soft limiter
    pcm = (st * 32767).astype(np.int16)
    out = os.path.join(build, "mix.wav")
    with wave.open(out, "w") as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print(f"mix -> {out} ({dur:.2f}s, {len(events)} sfx events)")


if __name__ == "__main__":
    main(os.path.abspath(sys.argv[1]))
