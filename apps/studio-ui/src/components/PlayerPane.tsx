// Player: phát composition gộp (Three.js xem trước + lớp chữ + giọng) với dữ liệu nướng mới nhất từ server.
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { StudioComposition } from "@lse/video-engine/studio";
import { Layers } from "lucide-react";
import { api } from "../api";

export interface PlayerPaneHandle { seekSec: (t: number) => void }

export const PlayerPane = forwardRef<PlayerPaneHandle, { pid: string; rev: number; onShot?: (id: string) => void; onPreview?: (p: any) => void }>(
  ({ pid, rev, onShot, onPreview }, ref) => {
    const [data, setData] = useState<any>(null);
    const [err, setErr] = useState<string | null>(null);
    const [overlay, setOverlay] = useState(true);
    const [frame, setFrame] = useState(0);
    const player = useRef<PlayerRef>(null);
    useEffect(() => {
      let live = true;
      api.preview(pid).then((d) => { if (live) { setData(d); setErr(null); onPreview?.(d); } }).catch((e) => live && setErr(e.message));
      return () => { live = false; };
    }, [pid, rev]);
    useEffect(() => {
      const p = player.current;
      if (!p) return;
      const h = (e: { detail: { frame: number } }) => setFrame(e.detail.frame);
      p.addEventListener("frameupdate", h);
      return () => p.removeEventListener("frameupdate", h);
    }, [data]);
    const T = data?.timeline;
    useImperativeHandle(ref, () => ({ seekSec: (t: number) => player.current?.seekTo(Math.round(t * (T?.fps_out ?? 60))) }), [T]);
    if (err) return <div className="card p-6 text-sm text-ink-300">Chưa xem trước được: {err}</div>;
    if (!T) return <div className="card flex aspect-video items-center justify-center text-ink-300">Đang nướng timeline...</div>;
    const dur = Math.ceil(T.duration * T.fps_out);
    const wf = Math.min(T.frames, Math.floor((frame * T.fps) / T.fps_out) + 1);
    const shot = T.shots.find((s: any) => s.f0 <= wf && wf <= s.f1);
    return (
      <div className="card overflow-hidden">
        <Player ref={player} component={StudioComposition as any} inputProps={{ ...data, assetBase: "/baked", showOverlay: overlay }}
          durationInFrames={dur} fps={T.fps_out} compositionWidth={T.resolution[0]} compositionHeight={T.resolution[1]}
          style={{ width: "100%", aspectRatio: "16 / 9" }} controls numberOfSharedAudioTags={8} acknowledgeRemotionLicense />
        <div className="relative h-8 border-t border-ink-700 bg-ink-950">
          {T.shots.map((s: any) => {
            const left = ((s.f0 - 1) / T.frames) * 100, width = ((s.f1 - s.f0 + 1) / T.frames) * 100;
            const hasErr = (data.issues ?? []).some((i: any) => i.shot === s.id && i.level === "error");
            return (
              <button key={s.id} title={s.id} onClick={() => { player.current?.seekTo(Math.round(((s.f0 - 1) / T.fps) * T.fps_out)); onShot?.(s.id); }}
                className={`absolute top-1 h-6 truncate rounded border px-1 text-left text-xs ${shot?.id === s.id ? "border-stud bg-stud/20" : "border-ink-700 bg-ink-800"} ${hasErr ? "!border-brick" : ""}`}
                style={{ left: `${left}%`, width: `calc(${width}% - 2px)` }}>{s.id}</button>
            );
          })}
        </div>
        <div className="flex items-center gap-3 px-3 py-1.5 text-xs text-ink-300">
          <span>Khung thế giới {wf}/{T.frames} · cảnh {shot?.id} · {(frame / T.fps_out).toFixed(2)} s</span>
          <button className="btn ml-auto !py-0.5" onClick={() => setOverlay((o) => !o)}><Layers className="h-3.5 w-3.5" /> {overlay ? "Ẩn lớp chữ" : "Hiện lớp chữ"}</button>
        </div>
      </div>
    );
  },
);
