// Tab 3 — Giọng đọc & Mốc giờ: tạo giọng (TTS trên máy) hoặc nạp giọng thật + tự khớp giờ (Gđ 3B), nghe từng câu.
import React, { useRef, useState } from "react";
import { Mic, Upload, Play } from "lucide-react";
import { wsUrl, type Library, type ProjectState } from "../api";
import { JobButton } from "../components/jobs";

export const VoiceTab: React.FC<{ pid: string; state: ProjectState; lib: Library }> = ({ pid, state, lib }) => {
  const t = state.timing;
  const audio = useRef<HTMLAudioElement>(null);
  const [upMsg, setUpMsg] = useState<string | null>(null);
  const play = (url: string) => { if (audio.current) { audio.current.src = url; void audio.current.play(); } };
  const upload = async (lineId: string, file: File) => {
    const r = await fetch(`/api/projects/${pid}/voice/${lineId}`, { method: "POST", headers: { "content-type": file.type || "audio/wav" }, body: file });
    const j = await r.json().catch(() => ({}));
    setUpMsg(r.ok ? `Đã nạp giọng cho ${lineId}. Bấm "Tự khớp giờ" để căn mốc từng từ.` : j.error ?? "Nạp lỗi");
  };
  return (
    <div className="grid grid-cols-[320px_minmax(0,1fr)] gap-4">
      <section className="card space-y-3 p-4">
        <div className="text-lg font-bold">Giọng đọc</div>
        <JobButton kind="tts" primary label="Tạo giọng (máy tính đọc)" icon={<Mic className="h-4 w-4" />} />
        <p className="text-xs text-ink-500">Dùng giọng của từng nhân vật (đổi cao độ trong công thức minifig). Chạy offline, khoảng 5–10 giây.</p>
        <JobButton kind="align" label="Tự khớp giờ (Whisper)" />
        <p className="text-xs text-ink-500">Sau khi nạp giọng thật cho các câu: Whisper nghe lại và đặt mốc từng từ để khẩu hình khớp.</p>
        {upMsg ? <div className="text-sm text-ink-300">{upMsg}</div> : null}
        <audio ref={audio} controls className="w-full" />
      </section>
      <section className="card p-4">
        <div className="mb-2 text-lg font-bold">Mốc giờ từng câu</div>
        {!t ? <div className="text-sm text-ink-300">Chưa có giọng. Bấm "Tạo giọng" hoặc nạp file giọng cho từng câu.</div> : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-300"><tr><th className="w-12">Câu</th><th className="w-28">Người nói</th><th className="w-44">Thời gian</th><th>Lời (từ có mốc)</th><th className="w-24" /></tr></thead>
            <tbody>
              {Object.entries(t.lines).map(([id, L]) => (
                <tr key={id} className="align-top">
                  <td className="py-1 font-mono">{id}</td>
                  <td className="py-1">{lib.cast[L.speaker]?.name ?? L.speaker}</td>
                  <td className="py-1 font-mono text-ink-300">{L.start.toFixed(2)} → {L.end.toFixed(2)}</td>
                  <td className="py-1">{L.words.map((w, i) => <span key={i} title={`${w[0].toFixed(2)} s`} className="mr-1 rounded bg-ink-800 px-1">{w[1]}</span>)}</td>
                  <td className="py-1">
                    <div className="flex gap-1">
                      <button className="btn" title="Nghe" onClick={() => play(wsUrl(`projects/${pid}/${L.wav}`))}><Play className="h-3.5 w-3.5" /></button>
                      <label className="btn cursor-pointer" title="Nạp giọng thật cho câu này"><Upload className="h-3.5 w-3.5" />
                        <input type="file" accept="audio/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(id, e.target.files[0])} /></label>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {t ? <div className="mt-2 text-xs text-ink-500">Tổng thời lượng: {t.duration.toFixed(2)} s</div> : null}
      </section>
    </div>
  );
};
