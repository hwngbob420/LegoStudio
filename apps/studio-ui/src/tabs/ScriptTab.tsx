// Tab 1 — Kịch bản: gửi tư liệu, chọn ngôi kể / giọng văn / độ dài, bấm "Làm bản xem trước": Claude (skill screenwriter) viết
// kịch bản theo block ~2 phút -> tạo giọng -> AI đạo diễn dựng hình -> sang tab Duyệt block. "Chỉ viết kịch bản" dừng sau bước viết.
import React, { useEffect, useRef, useState } from "react";
import { Plus, Trash2, Save, LoaderCircle, Wand2, PenLine, CircleAlert, CircleCheck, FileText } from "lucide-react";
import { POVS, TARGET_SECONDS, TONES, linesForDuration, type BeatSheet, type Pov, type Script, type SourceEntry, type Tone } from "@lse/shared";
import { api, type Library, type ProjectState, type Writing } from "../api";
import { Field } from "../components/Fields";
import { useJobs } from "../components/jobs";
import { BeatEditor, CritiquePanel, SourcesPanel } from "../components/WritingRoom";

const fmtSec = (s: number) => (s < 60 ? `${s} giây` : `${s / 60} phút`);
const chip = (on: boolean) => `rounded-md border px-2 py-0.5 text-sm ${on ? "border-stud bg-stud/15" : "border-ink-700 hover:border-ink-500"}`;

/** Gđ 6: ý đồ hình ảnh mà biên kịch ghi cho câu (hiện dưới ô bối cảnh). */
const VISUAL_VI: Record<string, string> = {
  establishing_scale: "Mở cảnh toàn rộng", intimate_deadpan: "Cận mặt deadpan", satirical_low_angle: "Góc thấp châm biếm", overhead_chaos: "Nhìn từ trên (hỗn loạn)",
  cutaway_gag: "Cắt gag sang nơi khác", conversation: "Đối đáp qua vai", reveal: "Hé lộ (lùi / nâng máy)", isolation: "Cô lập (góc cao)",
};

export const ScriptTab: React.FC<{ pid: string; state: ProjectState; lib: Library; onScript: (s: Script) => void; onReload: () => void; onPreviewReady?: () => void }> = ({ pid, state, lib, onScript, onReload, onPreviewReady }) => {
  const { busy, jobs, refresh } = useJobs();
  const [sc, setSc] = useState<Script | null>(state.script);
  const [story, setStory] = useState("");
  const [pov, setPov] = useState<Pov>("dialogue");
  const [tones, setTones] = useState<Tone[]>(["deadpan"]);
  const [message, setMessage] = useState("");
  const [notes, setNotes] = useState("");
  const [target, setTarget] = useState(60);
  const [sources, setSources] = useState<SourceEntry[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [writing, setWriting] = useState<Writing | null>(null);
  const [beats, setBeats] = useState<BeatSheet | null>(null);
  const [ai, setAi] = useState<{ ok: boolean; provider: string; message: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const job = busy("make_preview") ?? busy("write_script");
  const lastJob = jobs.find((j) => j.kind === "write_script" || j.kind === "make_preview");
  // bản xem trước vừa xong -> tự sang tab Duyệt block
  const seen = useRef<Record<string, string>>({});
  useEffect(() => {
    for (const j of jobs) if (j.kind === "make_preview" && seen.current[j.id] && seen.current[j.id] !== "done" && j.status === "done") onPreviewReady?.();
    seen.current = Object.fromEntries(jobs.map((j) => [j.id, j.status]));
  }, [jobs]);

  const loadWriting = async (fillForm = false) => {
    const [src, w] = await Promise.all([api.sources(pid), api.writing(pid)]);
    setSources(src); setWriting(w); setBeats(w.beats);
    if (fillForm && w.input) {
      setStory(w.input.story); setPov(w.input.pov); setTones(w.input.tones); setMessage(w.input.message); setNotes(w.input.notes);
      setTarget(w.input.targetSec); setPicked(w.input.sourceIds.filter((id) => src.some((s) => s.id === id)));
    }
  };
  useEffect(() => { setStory(""); setMessage(""); setNotes(""); setPicked([]); loadWriting(true).catch(() => undefined); api.aiStatus().then(setAi).catch(() => undefined); }, [pid]);
  useEffect(() => { setSc(state.script); loadWriting().catch(() => undefined); }, [state.script]);

  const speakers = Object.keys(lib.cast);
  if (!sc) return <div className="text-ink-300">Tập này chưa có script.json.</div>;
  const setLine = (i: number, patch: Partial<Script["lines"][number]>) => { const x = structuredClone(sc); x.lines[i] = { ...x.lines[i], ...patch }; setSc(x); };
  const toggleTone = (t: Tone) => setTones((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : cur.length >= 2 ? [cur[1], t] : [...cur, t]));
  const budget = linesForDuration(target);
  const ready = !!(story.trim() || picked.length);

  const input = () => ({ story, sourceIds: picked, pov, tones, message, notes, targetSec: target });
  const generate = async (from?: "dialogue") => {
    setMsg(null);
    try {
      if (from === "dialogue" && beats) await api.saveBeats(pid, beats);
      await api.generate(pid, from ? { from } : { input: input() });
      await refresh();
      setMsg(from ? "Claude đang viết lại thoại theo dàn ý bạn sửa..." : "Claude đang viết kịch bản. Tập dài có thể mất 10–30 phút; bạn cứ làm việc khác, xong sẽ tự hiện.");
    } catch (e) { setMsg((e as Error).message); api.aiStatus().then(setAi).catch(() => undefined); }
  };
  const makePreview = async () => {
    setMsg(null);
    try {
      await api.makePreview(pid, { input: input() });
      await refresh();
      setMsg("Đang làm bản xem trước: Claude viết kịch bản theo block 2 phút, rồi tạo giọng và dựng hình. Tập 20 phút có thể mất 30–60 phút; xong sẽ tự mở tab Duyệt block.");
    } catch (e) { setMsg((e as Error).message); api.aiStatus().then(setAi).catch(() => undefined); }
  };

  return (
    <div className="grid grid-cols-[460px_minmax(0,1fr)] gap-4">
      <section className="card space-y-4 self-start p-4">
        <div className="text-lg font-bold">Nạp truyện</div>
        <SourcesPanel pid={pid} sources={sources} selected={picked} onSelect={setPicked}
          onChanged={async (added) => { setSources(await api.sources(pid)); if (added) setPicked((p) => [...p, added.id]); }} />
        <Field label="Hoặc dán truyện / outline"><textarea className="field h-28" value={story} onChange={(e) => setStory(e.target.value)} placeholder="Dán cốt truyện, outline hoặc ý tưởng..." /></Field>

        <div>
          <span className="label">Ngôi kể</span>
          <div className="grid grid-cols-2 gap-2">{(Object.keys(POVS) as Pov[]).map((k) => (
            <button key={k} className={`rounded-md border p-2 text-left ${pov === k ? "border-stud bg-stud/10" : "border-ink-700 hover:border-ink-500"}`} onClick={() => setPov(k)}>
              <div className="text-sm font-semibold">{POVS[k].label}</div>
              <div className="text-xs text-ink-300">{POVS[k].hint}</div>
            </button>))}</div>
        </div>

        <div>
          <span className="label">Giọng văn (chọn tối đa 2)</span>
          <div className="flex flex-wrap gap-1.5">{(Object.keys(TONES) as Tone[]).map((t) => (
            <button key={t} title={TONES[t].hint} className={chip(tones.includes(t))} onClick={() => toggleTone(t)}>{TONES[t].label}</button>))}</div>
          {tones.length ? <p className="mt-1 text-xs text-ink-300">{tones.map((t) => `${TONES[t].label}: ${TONES[t].hint}`).join(" · ")}</p> : null}
        </div>

        <div>
          <span className="label">Độ dài mục tiêu</span>
          <div className="flex flex-wrap gap-1.5">{TARGET_SECONDS.map((t) => (
            <button key={t} className={chip(target === t)} onClick={() => setTarget(t)}>{fmtSec(t)}</button>))}</div>
          <p className="mt-1 text-xs text-ink-300">Khoảng {budget.min}–{budget.max} câu thoại{target > 150 ? `; chia khoảng ${Math.round(target / 120)} block 2 phút để duyệt và sửa từng đoạn` : ""}.</p>
        </div>

        <Field label="Thông điệp người xem mang về (tuỳ chọn)">
          <textarea className="field h-16" value={message} onChange={(e) => setMessage(e.target.value)}
            placeholder="Ví dụ: Cà phê chỉ là vay năng lượng, ngủ đủ mới là trả nợ." />
          <span className="mt-1 block text-xs text-ink-500">Một câu: xem xong, khán giả nên nghĩ hoặc làm gì khác đi? Đây là quan điểm của riêng bạn, Claude sẽ cài nó vào cú lật và câu kết. Bỏ trống thì Claude tự rút từ tư liệu.</span>
        </Field>
        <Field label="Yêu cầu thêm cho biên kịch (tuỳ chọn)">
          <textarea className="field h-16" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ví dụ: giữ nguyên chi tiết 5 ly cà phê; tránh nói về chính trị; kết bằng một câu hỏi cho khán giả." />
        </Field>

        {ai ? (
          <div className={`flex items-start gap-2 rounded-md border p-2 text-xs ${ai.ok ? "border-emerald-500/30 text-emerald-300" : "border-amber-500/40 text-amber-300"}`}>
            {ai.ok ? <CircleCheck className="mt-0.5 h-4 w-4 shrink-0" /> : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />}
            <span>{ai.message}</span>
          </div>
        ) : null}
        <button className="btn-primary w-full justify-center py-2 text-base" disabled={!!busy() || !ready} onClick={makePreview}
          title="Claude viết kịch bản (chia block ~2 phút) -> tạo giọng -> AI đạo diễn dựng hình -> mở tab Duyệt block">
          {job ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Wand2 className="h-5 w-5" />} Làm bản xem trước
        </button>
        <button className="btn w-full justify-center" disabled={!!busy() || !ready} onClick={() => generate()} title="Chỉ viết kịch bản, chưa tạo giọng và dựng hình">
          <FileText className="h-4 w-4" /> Chỉ viết kịch bản
        </button>
        {job ? (
          <div className="space-y-1">
            <div className="h-1.5 w-full overflow-hidden rounded bg-ink-700"><div className="h-full bg-stud transition-all" style={{ width: `${Math.round((job.progress ?? 0.02) * 100)}%` }} /></div>
            <div className="text-xs text-ink-300">{job.status === "queued" ? "Đang chờ lượt..." : job.log.filter((l) => !l.startsWith("[progress]")).at(-1) ?? "Claude đang đọc tư liệu..."}</div>
          </div>
        ) : null}
        {!job && lastJob?.status === "error" ? <div className="text-sm text-red-300">Lỗi: {lastJob.log.filter((l) => l.startsWith("LỖI")).at(-1) ?? lastJob.error}</div> : null}
        {msg ? <div className="text-sm text-ink-300">{msg}</div> : null}
        {!ready ? <p className="text-xs text-ink-500">Gửi ít nhất một file tư liệu (hoặc dán truyện) để bật nút.</p> : null}
      </section>

      <div className="space-y-4">
        {beats ? (
          <section className="card space-y-3 p-4">
            <div className="flex items-center gap-2">
              <div className="text-lg font-bold">Dàn ý Claude đã lập</div>
              <span className="text-xs text-ink-300">{beats.beats.length} nhịp</span>
              <button className="btn ml-auto" disabled={!!busy()} onClick={() => api.saveBeats(pid, beats).then(() => setMsg("Đã lưu dàn ý.")).catch((e) => setMsg(e.message))}><Save className="h-4 w-4" /> Lưu dàn ý</button>
              <button className="btn" disabled={!!busy()} onClick={() => generate("dialogue")}><PenLine className="h-4 w-4" /> Viết lại thoại theo dàn ý</button>
            </div>
            <CritiquePanel log={writing?.beatCritique ?? null} title="Claude tự chấm dàn ý" />
            <details>
              <summary className="cursor-pointer text-sm text-ink-300">Xem và sửa từng nhịp</summary>
              <div className="mt-2"><BeatEditor sheet={beats} lib={lib} onChange={setBeats} /></div>
            </details>
          </section>
        ) : null}
        <section className="card space-y-3 p-4">
          <div className="flex items-center gap-2">
            <div className="text-lg font-bold">Kịch bản thoại sạch</div>
            <span className="text-xs text-ink-300">{sc.lines.length} câu</span>
            <button className="btn-primary ml-auto" onClick={() => onScript(sc)}><Save className="h-4 w-4" /> Lưu kịch bản</button>
          </div>
          <CritiquePanel log={writing?.scriptCritique ?? null} title="Claude tự chấm kịch bản" />
          <div className="grid grid-cols-3 gap-2">
            <Field label="Tên tập"><input className="field" value={sc.title} onChange={(e) => setSc({ ...sc, title: e.target.value })} /></Field>
            <Field label="Mở đầu lắp ráp (giây)"><input className="field" type="number" step={0.1} value={sc.start_offset} onChange={(e) => setSc({ ...sc, start_offset: Number(e.target.value) })} /></Field>
            <Field label="Đuôi cuối (giây)"><input className="field" type="number" step={0.1} value={sc.tail} onChange={(e) => setSc({ ...sc, tail: Number(e.target.value) })} /></Field>
          </div>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-300"><tr><th className="w-12">Block</th><th className="w-14">ID</th><th className="w-44">Người nói</th><th>Lời thoại</th><th className="w-44">Bối cảnh</th><th className="w-20">Nghỉ trước</th><th className="w-10" /></tr></thead>
            <tbody>
              {sc.lines.map((L, i) => (
                <tr key={i} className={`align-top ${i > 0 && L.block && L.block !== sc.lines[i - 1].block ? "border-t-2 border-stud/40" : ""}`}>
                  <td className="py-1 font-mono text-xs text-ink-500">{L.block && (i === 0 || L.block !== sc.lines[i - 1].block) ? L.block : ""}</td>
                  <td className="py-1 font-mono text-ink-300">{L.id}</td>
                  <td className="py-1 pr-2"><select className="field" value={L.speaker} onChange={(e) => setLine(i, { speaker: e.target.value })}>{speakers.map((s) => <option key={s} value={s}>{lib.cast[s]?.name ?? s}</option>)}</select></td>
                  <td className="py-1 pr-2"><input className="field" value={L.text} onChange={(e) => setLine(i, { text: e.target.value })} /></td>
                  <td className="py-1 pr-2">
                    <select className="field" title={L.visual ? `Ý đồ hình: ${VISUAL_VI[L.visual] ?? L.visual}` : "Bối cảnh (bộ set) của câu"} value={L.location ?? ""}
                      onChange={(e) => setLine(i, { location: e.target.value || undefined })}>
                      <option value="">(theo câu trước)</option>
                      {Object.values(lib.sets).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    {L.visual ? <div className="mt-0.5 text-[11px] text-ink-500">{VISUAL_VI[L.visual] ?? L.visual}</div> : null}
                  </td>
                  <td className="py-1 pr-2"><input className="field" type="number" step={0.05} value={L.gap_before ?? 0.3} onChange={(e) => setLine(i, { gap_before: Number(e.target.value) })} /></td>
                  <td className="py-1"><button className="btn" onClick={() => setSc({ ...sc, lines: sc.lines.filter((_, k) => k !== i) })}><Trash2 className="h-3.5 w-3.5" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="btn" onClick={() => setSc({ ...sc, lines: [...sc.lines, { id: `L${1 + Math.max(0, ...sc.lines.map((l) => Number(/^L(\d+)$/.exec(l.id)?.[1] ?? 0)))}`, speaker: speakers[0], text: "...", gap_before: 0.3, ...(sc.lines.at(-1)?.block ? { block: sc.lines.at(-1)!.block } : {}) }] })}><Plus className="h-4 w-4" /> Thêm câu</button>
          <p className="text-xs text-ink-500">Câu ngắn, có dấu chấm câu để giọng đọc ngắt nghỉ. Xong thì sang tab Giọng đọc, bấm "Tạo giọng".</p>
        </section>
      </div>
    </div>
  );
};
