"""Offline TTS via Windows SAPI5 (System.Speech) with viseme + word-boundary capture.

    python apps/brick-engine/tts_sapi.py <production_dir>

Reads <prod>/script.json, writes per line: build/audio/<id>.wav (+ pitch-shifted per character),
build/audio/<id>.json (visemes, words), and lays lines on the episode timeline -> build/timing.json.

SAPI raises VisemeReached / SpeakProgress with audio positions, so lip-sync and word-synced subtitles
come for free, frame-accurate, with no network and no extra model downloads.
"""
from __future__ import annotations
import json, os, subprocess, sys, tempfile, wave

import paths as P

RECIPES = P.CAST

CS = r'''
using System;
using System.Collections.Generic;
using System.Speech.Synthesis;
using System.Speech.AudioFormat;
using System.Threading;
using System.Text;
using System.Globalization;
public static class LsTts {
    public static string Run(string text, string voice, int rate, string wav) {
        var vis = new List<string>(); var words = new List<string>();
        var done = new ManualResetEvent(false);
        var inv = CultureInfo.InvariantCulture;
        using (var s = new SpeechSynthesizer()) {
            try { s.SelectVoice(voice); } catch {}
            s.Rate = rate;
            s.SetOutputToWaveFile(wav);  // native format: custom formats skew AudioPosition
            s.VisemeReached += (o, e) => { lock (vis) vis.Add(string.Format(inv, "[{0},{1},{2}]",
                e.AudioPosition.TotalMilliseconds, e.Viseme, e.Duration.TotalMilliseconds)); };
            s.SpeakProgress += (o, e) => { lock (words) words.Add(string.Format(inv, "[{0},{1},{2},\"{3}\"]",
                e.AudioPosition.TotalMilliseconds, e.CharacterPosition, e.CharacterCount, e.Text.Replace("\"", "'"))); };
            s.SpeakCompleted += (o, e) => done.Set();
            s.SpeakAsync(text);
            done.WaitOne(60000);
            s.SetOutputToNull();
        }
        return "{\"visemes\":[" + string.Join(",", vis) + "],\"words\":[" + string.Join(",", words) + "]}";
    }
}
'''

PS = r'''
param([string]$cs, [string]$text, [string]$voice, [int]$rate, [string]$wav, [string]$out)
Add-Type -AssemblyName System.Speech
Add-Type -TypeDefinition (Get-Content -Raw $cs) -ReferencedAssemblies System.Speech
$j = [LsTts]::Run($text, $voice, $rate, $wav)
[IO.File]::WriteAllText($out, $j)
'''


def synth(text, voice, rate, wav_path, json_path):
    tmp = tempfile.mkdtemp(prefix="ls_tts_")
    cs, ps = os.path.join(tmp, "t.cs"), os.path.join(tmp, "t.ps1")
    open(cs, "w", encoding="utf-8").write(CS)
    open(ps, "w", encoding="utf-8").write(PS)
    subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps, "-cs", cs, "-text", text,
                    "-voice", voice, "-rate", str(rate), "-wav", wav_path, "-out", json_path], check=True)
    d = json.load(open(json_path, encoding="utf-8"))
    return d


def pitch_shift(src, dst, semitones, gain_db=0.0):
    """Formant-ish character voice: resample pitch while keeping duration (timings stay valid)."""
    with wave.open(src) as w:
        sr = w.getframerate()
    r = 2 ** (semitones / 12)
    af = f"asetrate={sr}*{r:.5f},aresample=44100,atempo={1 / r:.5f},highpass=f=70,volume={gain_db}dB"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-af", af, "-ac", "1", dst], check=True)


def wav_seconds(p):
    with wave.open(p) as w:
        return w.getnframes() / w.getframerate()


def speech_span(wav_path):
    """Measured speech onset/offset (s) from the audio envelope."""
    import numpy as np
    with wave.open(wav_path) as w:
        sr = w.getframerate()
        a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(float)
    env = np.convolve(np.abs(a), np.ones(int(sr * 0.01)) / int(sr * 0.01), "same")
    idx = np.where(env > env.max() * 0.04)[0]
    return idx[0] / sr, idx[-1] / sr


def calibrate(d, wav_path):
    """SAPI's AudioPosition drifts (~1.4x) from the real audio, so map the viseme span linearly onto the
    measured speech span. Returns d with visemes/words in true seconds (ms fields stay ms)."""
    on, off = speech_span(wav_path)
    v = [x for x in d["visemes"] if x[1] != 0]
    if not v:
        return d
    vs, ve = v[0][0], v[-1][0] + v[-1][2]
    k = (off - on) * 1000 / max(1.0, ve - vs)
    f = lambda ms: on * 1000 + (ms - vs) * k
    d["visemes"] = [[f(a), vv, dd * k] for a, vv, dd in d["visemes"]]
    d["words"] = [[f(a), cp, cc, w] for a, cp, cc, w in d["words"]]
    d["calibration"] = {"scale": round(k, 4), "onset": round(on, 3), "offset": round(off, 3)}
    return d


def trim_info(d, total):
    """SAPI pads silence; find first/last non-silent viseme to tighten timeline gaps."""
    vs = [v for v in d["visemes"] if v[1] != 0]
    if not vs:
        return 0.0, total
    start = max(0.0, vs[0][0] / 1000 - 0.03)
    end = min(total, (vs[-1][0] + vs[-1][2]) / 1000 + 0.05)
    return start, end


def main(prod):
    script = json.load(open(os.path.join(prod, "script.json"), encoding="utf-8"))
    adir = os.path.join(prod, "build", "audio")
    os.makedirs(adir, exist_ok=True)
    t = float(script.get("start_offset", 0.0))
    timing = {"lines": {}, "fps_world": script.get("fps_world", 12)}
    for L in script["lines"]:
        r = json.load(open(os.path.join(RECIPES, f"{L['speaker']}.json"), encoding="utf-8"))
        v = r["voice"]
        raw = os.path.join(adir, f"{L['id']}_raw.wav")
        js = os.path.join(adir, f"{L['id']}.json")
        d = synth(L["text"], v["sapi"], int(L.get("rate", v.get("rate", 0))), raw, js)
        wav = os.path.join(adir, f"{L['id']}.wav")
        pitch_shift(raw, wav, float(v.get("pitch_semitones", 0)), float(v.get("gain_db", 0)))
        total = wav_seconds(wav)
        d = calibrate(d, wav)
        json.dump(d, open(js, "w"), indent=0)
        s0, s1 = trim_info(d, total)
        t += float(L.get("gap_before", 0.3))
        start = t - s0                      # place the wav so speech begins at t
        timing["lines"][L["id"]] = {
            "speaker": L["speaker"], "text": L["text"], "wav": os.path.relpath(wav, prod).replace(os.sep, "/"), "wav_start": round(start, 3),
            "start": round(t, 3), "end": round(start + s1, 3),
            "visemes": [[round(start + a / 1000, 3), int(vv), round(dd / 1000, 3)] for a, vv, dd in d["visemes"]],
            "words": [[round(start + a / 1000, 3), w] for a, cp, cc, w in d["words"]],
        }
        t = start + s1
        print(f"  {L['id']} {L['speaker']:<12} {timing['lines'][L['id']]['start']:6.2f}-{timing['lines'][L['id']]['end']:6.2f}  {L['text']}")
    timing["duration"] = round(t + float(script.get("tail", 1.0)), 3)
    json.dump(timing, open(os.path.join(prod, "build", "timing.json"), "w"), indent=1)
    print("timing ->", os.path.join(prod, "build", "timing.json"), "duration", timing["duration"])


if __name__ == "__main__":
    main(os.path.abspath(sys.argv[1]))
