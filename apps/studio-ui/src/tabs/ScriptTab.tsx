// Tab 1 — Kịch bản & Kế hoạch: gửi tư liệu (outline), phòng biên kịch (dàn ý -> phê bình -> duyệt -> thoại), sửa lời thoại.
import React, { useEffect, useState } from "react";
import { Plus, Trash2, Save, Sparkles, LoaderCircle, ListTree, PenLine, CheckCheck } from "lucide-react";
import { TARGET_SECONDS, type BeatSheet, type Script, type SourceEntry } from "@lse/shared";
import { api, type Library, type ProjectState, type Writing } from "../api";
import { Field } from "../components/Fields";
import { BeatEditor, CritiquePanel, SourcesPanel } from "../components/WritingRoom";

const fmtSec = (s: number) => (s < 60 ? `${s} giây` : `${s / 60} phút`);
const MAILBOX_HINT = "Nếu đang dùng Hộp thư Claude: gõ \"xử lý hộp thư\" trong Claude Code để Claude trả lời từng bước.";

export const ScriptTab: React.FC<{ pid: string; state: ProjectState; lib: Library; onScript: (s: Script) => void; onReload: () => void }> = ({ pid, state, lib, onScript, onReload }) => {
  const [sc, setSc] = useState<Script | null>(state.script);
  const [story, setStory] = useState("");
  const [mood, setMood] = useState("Hài hước");
  const [view, setView] = useState("");
  const [target, setTarget] = useState(45);
  const [sources, setSources] = useState<SourceEntry[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [writing, setWriting] = useState<Writing | null>(null);
  const [beats, setBeats] = useState<BeatSheet | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => setSc(state.script), [state.script]);
  const loadWriting = async () => {
    const [src, w] = await Promise.all([api.sources(pid), api.writing(pid)]);
    setSources(src); setWriting(w); setBeats(w.beats);
    if (w.input) { setStory(w.input.story); setMood(w.input.mood); setView(w.input.viewpoint); setTarget(w.input.targetSec); setPicked(w.input.sourceIds.filter((id) => src.some((s) => s.id === id))); }
  };
  useEffect(() => { setStory(""); setView(""); setPicked([]); loadWriting().catch(() => undefined); }, [pid]);
  const speakers = Object.keys(lib.cast);
  if (!sc) return <div className="text-ink-300">Tập này chưa có script.json.</div>;
  const setLine = (i: number, patch: Partial<Script["lines"][number]>) => { const x = structuredClone(sc); x.lines[i] = { ...x.lines[i], ...patch }; setSc(x); };
  const body = { story, mood, viewpoint: view, targetSec: target, sourceIds: picked };
  const ready = (story.trim() || picked.length) && view.trim();
  const run = async (label: string, fn: () => Promise<string>) => {
    setBusy(label); setMsg(null);
    try { setMsg(await fn()); } catch (e) { setMsg((e as Error).message); }
    setBusy(null);
  };
  const quick = () => run("Đang viết kịch bản...", async () => {
    const r = await api.ai(pid, "script", body);
    onReload(); await loadWriting();
    return `AI đã viết ${r.script.lines.length} câu thoại${r.newCast?.length ? `, thêm ${r.newCast.length} diễn viên mới cho tập` : ""}. Bước tiếp: tab Giọng đọc -> "Tạo giọng", rồi tab Đạo diễn -> "AI tạo Storyboard".`;
  });
  const draftBeats = () => run("Đang lập dàn ý và tự phê bình...", async () => {
    const r = await api.ai(pid, "beats", body);
    await loadWriting(); onReload();
    return `Dàn ý ${r.beats.beats.length} nhịp đã sẵn sàng${r.newCast?.length ? `, thêm ${r.newCast.length} diễn viên mới` : ""}. Đọc, sửa nếu cần, rồi bấm "Duyệt & viết thoại".`;
  });
  const saveBeats = async (approved: boolean) => { if (!beats) return; const s = await api.saveBeats(pid, { ...beats, approved }); setBeats(s); return s; };
  const writeLines = () => run("Đang viết thoại, phê bình và sửa...", async () => {
    await saveBeats(true);
    const r = await api.ai(pid, "script-from-beats", {});
    onReload(); await loadWriting();
    return `Đã viết ${r.script.lines.length} câu thoại từ dàn ý. Đọc lại (nhất là câu chốt), sửa tay nếu muốn, rồi sang tab Giọng đọc.`;
  });
  return (
    <div className="grid grid-cols-[440px_minmax(0,1fr)] gap-4">
      <section className="card space-y-3 self-start p-4">
        <div className="text-lg font-bold">Nạp truyện</div>
        <SourcesPanel pid={pid} sources={sources} selected={picked} onSelect={setPicked}
          onChanged={async (added) => { setSources(await api.sources(pid)); if (added) setPicked((p) => [...p, added.id]); }} />
        <Field label="Hoặc dán truyện / ý tưởng"><textarea className="field h-32" value={story} onChange={(e) => setStory(e.target.value)} placeholder="Dán truyện, outline hoặc ý tưởng tập phim..." /></Field>
        <Field label="Không khí">
          <div className="flex flex-wrap gap-2">{["Hài hước", "Kịch tính", "Ấm áp", "Châm biếm đời thường"].map((m) => (
            <button key={m} className={`rounded-md border px-2 py-0.5 text-sm ${mood === m ? "border-stud bg-stud/15" : "border-ink-700"}`} onClick={() => setMood(m)}>{m}</button>))}</div>
        </Field>
        <Field label="Độ dài mục tiêu">
          <div className="flex flex-wrap gap-2">{TARGET_SECONDS.map((t) => (
            <button key={t} className={`rounded-md border px-2 py-0.5 text-sm ${target === t ? "border-stud bg-stud/15" : "border-ink-700"}`} onClick={() => setTarget(t)}>{fmtSec(t)}</button>))}</div>
        </Field>
        <Field label="Góc nhìn của tôi (bắt buộc, AI sẽ lồng vào)"><textarea className="field h-20" value={view} onChange={(e) => setView(e.target.value)} placeholder="Ví dụ: cà phê không thay được giấc ngủ..." /></Field>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={!!busy || !ready} onClick={draftBeats}><ListTree className="h-4 w-4" /> Lập dàn ý (khuyên dùng)</button>
          <button className="btn" disabled={!!busy || !ready} onClick={quick}><Sparkles className="h-4 w-4" /> Viết nhanh 1 bước</button>
        </div>
        <p className="text-xs text-ink-500">"Lập dàn ý": AI dựng khung nhịp, tự chấm theo danh sách và sửa; bạn duyệt rồi AI mới viết thoại. "Viết nhanh": một bước, hợp tập ngắn.</p>
        {busy ? <div className="flex items-center gap-2 text-sm text-ink-300"><LoaderCircle className="h-4 w-4 animate-spin" /> {busy} <span className="text-xs text-ink-500">{MAILBOX_HINT}</span></div> : null}
        {msg ? <div className="text-sm text-ink-300">{msg}</div> : null}
      </section>
      <div className="space-y-4">
        {beats ? (
          <section className="card space-y-3 p-4">
            <div className="flex items-center gap-2">
              <div className="text-lg font-bold">Dàn ý</div>
              {beats.approved ? <span className="flex items-center gap-1 rounded bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300"><CheckCheck className="h-3.5 w-3.5" /> Đã duyệt</span> : <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs text-amber-300">Chờ bạn duyệt</span>}
              <button className="btn ml-auto" disabled={!!busy} onClick={() => saveBeats(false).then(() => setMsg("Đã lưu dàn ý."))}><Save className="h-4 w-4" /> Lưu</button>
              <button className="btn-primary" disabled={!!busy} onClick={writeLines}><PenLine className="h-4 w-4" /> Duyệt & viết thoại</button>
            </div>
            <CritiquePanel log={writing?.beatCritique ?? null} title="AI tự chấm dàn ý" />
            <BeatEditor sheet={beats} lib={lib} onChange={setBeats} />
          </section>
        ) : null}
        <section className="card space-y-3 p-4">
          <div className="flex items-center gap-2">
            <div className="text-lg font-bold">Kịch bản thoại sạch</div>
            <button className="btn-primary ml-auto" onClick={() => onScript(sc)}><Save className="h-4 w-4" /> Lưu kịch bản</button>
          </div>
          <CritiquePanel log={writing?.scriptCritique ?? null} title="AI tự chấm kịch bản" />
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
    </div>
  );
};
