// Tab 1 — Kịch bản & Kế hoạch: sửa lời thoại; AI phân tích truyện (Gđ 3A).
import React, { useEffect, useState } from "react";
import { Plus, Trash2, Save, Sparkles, LoaderCircle } from "lucide-react";
import type { Script } from "@lse/shared";
import { api, type Library, type ProjectState } from "../api";
import { Field } from "../components/Fields";

export const ScriptTab: React.FC<{ pid: string; state: ProjectState; lib: Library; onScript: (s: Script) => void; onReload: () => void }> = ({ pid, state, lib, onScript, onReload }) => {
  const [sc, setSc] = useState<Script | null>(state.script);
  const [story, setStory] = useState("");
  const [mood, setMood] = useState("Hài hước");
  const [view, setView] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => setSc(state.script), [state.script]);
  const speakers = Object.keys(lib.cast);
  if (!sc) return <div className="text-ink-300">Tập này chưa có script.json.</div>;
  const setLine = (i: number, patch: Partial<Script["lines"][number]>) => { const x = structuredClone(sc); x.lines[i] = { ...x.lines[i], ...patch }; setSc(x); };
  const analyze = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await api.ai(pid, "script", { story, mood, viewpoint: view });
      setMsg(`AI đã viết ${r.script.lines.length} câu thoại${r.newCast?.length ? `, đề xuất ${r.newCast.length} diễn viên mới cho tập` : ""}. Bấm "Tạo giọng" ở tab Giọng đọc, rồi "AI tạo Storyboard" ở tab Đạo diễn.`);
      onReload();
    } catch (e) { setMsg((e as Error).message); }
    setBusy(false);
  };
  return (
    <div className="grid grid-cols-[420px_minmax(0,1fr)] gap-4">
      <section className="card space-y-3 p-4">
        <div className="text-lg font-bold">Nạp truyện</div>
        <Field label="Truyện thô / ý tưởng"><textarea className="field h-56" value={story} onChange={(e) => setStory(e.target.value)} placeholder="Dán truyện hoặc ý tưởng tập phim..." /></Field>
        <Field label="Không khí">
          <div className="flex flex-wrap gap-2">{["Hài hước", "Kịch tính", "Ấm áp", "Châm biếm đời thường"].map((m) => (
            <button key={m} className={`rounded-md border px-2 py-0.5 text-sm ${mood === m ? "border-stud bg-stud/15" : "border-ink-700"}`} onClick={() => setMood(m)}>{m}</button>))}</div>
        </Field>
        <Field label="Góc nhìn của tôi (bắt buộc, AI sẽ lồng vào)"><textarea className="field h-20" value={view} onChange={(e) => setView(e.target.value)} placeholder="Ví dụ: cà phê không thay được giấc ngủ..." /></Field>
        <button className="btn-primary" disabled={busy || !story.trim() || !view.trim()} onClick={analyze}>
          {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Phân tích bằng AI
        </button>
        {msg ? <div className="text-sm text-ink-300">{msg}</div> : null}
      </section>
      <section className="card space-y-3 p-4">
        <div className="flex items-center gap-2">
          <div className="text-lg font-bold">Kịch bản thoại sạch</div>
          <button className="btn-primary ml-auto" onClick={() => onScript(sc)}><Save className="h-4 w-4" /> Lưu kịch bản</button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Tên tập"><input className="field" value={sc.title} onChange={(e) => setSc({ ...sc, title: e.target.value })} /></Field>
          <Field label="Mở đầu lắp ráp (giây)"><input className="field" type="number" step={0.1} value={sc.start_offset} onChange={(e) => setSc({ ...sc, start_offset: Number(e.target.value) })} /></Field>
          <Field label="Đuôi cuối (giây)"><input className="field" type="number" step={0.1} value={sc.tail} onChange={(e) => setSc({ ...sc, tail: Number(e.target.value) })} /></Field>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-ink-300"><tr><th className="w-14">ID</th><th className="w-44">Người nói</th><th>Lời thoại</th><th className="w-20">Nghỉ trước</th><th className="w-10" /></tr></thead>
          <tbody>
            {sc.lines.map((L, i) => (
              <tr key={i} className="align-top">
                <td className="py-1 font-mono text-ink-300">{L.id}</td>
                <td className="py-1 pr-2"><select className="field" value={L.speaker} onChange={(e) => setLine(i, { speaker: e.target.value })}>{speakers.map((s) => <option key={s} value={s}>{lib.cast[s]?.name ?? s}</option>)}</select></td>
                <td className="py-1 pr-2"><input className="field" value={L.text} onChange={(e) => setLine(i, { text: e.target.value })} /></td>
                <td className="py-1 pr-2"><input className="field" type="number" step={0.05} value={L.gap_before ?? 0.3} onChange={(e) => setLine(i, { gap_before: Number(e.target.value) })} /></td>
                <td className="py-1"><button className="btn" onClick={() => setSc({ ...sc, lines: sc.lines.filter((_, k) => k !== i) })}><Trash2 className="h-3.5 w-3.5" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn" onClick={() => setSc({ ...sc, lines: [...sc.lines, { id: `L${sc.lines.length + 1}`, speaker: speakers[0], text: "...", gap_before: 0.3 }] })}><Plus className="h-4 w-4" /> Thêm câu</button>
        <p className="text-xs text-ink-500">Câu ngắn, có dấu chấm câu để giọng đọc ngắt nghỉ. Mốc tham chiếu trong storyboard: L1.start, L1.end, L1.w3 (từ thứ 3).</p>
      </section>
    </div>
  );
};
