// Phòng biên kịch (Tab 1): tư liệu gửi lên, sửa/duyệt dàn ý, xem phiếu phê bình đạt/không đạt.
import React, { useRef, useState } from "react";
import { CheckCircle2, CircleX, FileText, FileUp, ImageOff, LoaderCircle, Plus, Trash2 } from "lucide-react";
import type { BeatSheet, CritiqueLog, SourceEntry } from "@lse/shared";
import { api, type Library } from "../api";

const CHECK_LABELS: Record<string, string> = {
  hook: "Mở đầu có móc", one_idea: "Một ý duy nhất", viewpoint: "Thông điệp rõ ràng", escalation: "Leo thang có số liệu", twist: "Cú lật đã gài",
  value_shift: "Nhịp nào cũng đổi giá trị", button: "Chốt bằng Step N", on_screen: "Có ý tưởng thẻ chữ", cast_fit: "Vai hài rõ", length_fit: "Đúng độ dài",
  covers_beats: "Đủ nhịp, đúng thứ tự", distinct_voices: "Che tên vẫn biết ai nói", setup_punch: "Setup -> punch cuối câu", short_lines: "Câu ngắn",
  no_exposition_dump: "Không giảng bài", callback: "Có callback", facts_from_source: "Số liệu có nguồn", natural_english: "Tiếng Anh tự nhiên, không thương hiệu",
};
const KIND_LABELS: Record<string, string> = { hook: "Móc mở đầu", setup: "Dựng tình huống", escalation: "Leo thang", complication: "Phản biện", twist: "Cú lật", payoff: "Hệ quả", button: "Câu chốt" };
const KINDS = Object.keys(KIND_LABELS) as BeatSheet["beats"][number]["kind"][];

export const SourcesPanel: React.FC<{ pid: string; sources: SourceEntry[]; selected: string[]; onSelect: (ids: string[]) => void; onChanged: (added?: SourceEntry) => void }> = ({ pid, sources, selected, onSelect, onChanged }) => {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const send = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true); setErr(null);
    for (const f of Array.from(files)) {
      try { onChanged(await api.uploadSource(pid, f)); } catch (e) { setErr(`${f.name}: ${(e as Error).message}`); }
    }
    setBusy(false);
    if (input.current) input.current.value = "";
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="label mb-0">Tư liệu (outline, cốt truyện)</span>
        <button className="btn ml-auto" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />} Gửi file
        </button>
        <input ref={input} type="file" multiple hidden accept=".docx,.pdf,.md,.txt,.fountain" onChange={(e) => send(e.target.files)} />
      </div>
      <div className="rounded-md border border-dashed border-ink-700 p-2 text-xs text-ink-300"
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); send(e.dataTransfer.files); }}>
        {sources.length ? (
          <ul className="space-y-1">{sources.map((s) => (
            <li key={s.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={selected.includes(s.id)} onChange={(e) => onSelect(e.target.checked ? [...selected, s.id] : selected.filter((x) => x !== s.id))} />
              {s.needs_vision ? <ImageOff className="h-4 w-4 text-amber-400" /> : <FileText className="h-4 w-4 text-ink-300" />}
              <span className="truncate" title={s.name}>{s.name}</span>
              <span className="ml-auto shrink-0 text-xs text-ink-500">{s.needs_vision ? "ảnh chụp" : `${s.chars.toLocaleString()} chữ`}</span>
              <button className="btn px-1.5" title="Xóa tư liệu" onClick={async () => { await api.deleteSource(pid, s.id); onSelect(selected.filter((x) => x !== s.id)); onChanged(); }}><Trash2 className="h-3.5 w-3.5" /></button>
            </li>))}</ul>
        ) : <div>Kéo thả hoặc bấm "Gửi file": .docx, .pdf, .md, .txt, .fountain (tối đa 20 MB).</div>}
      </div>
      {sources.some((s) => s.needs_vision && selected.includes(s.id)) ? <p className="text-xs text-amber-400">PDF ảnh chụp không có lớp chữ: AI sẽ đọc bằng hình ảnh (Gemini hoặc Claude), có thể kém chính xác hơn.</p> : null}
      {err ? <p className="text-xs text-red-400">{err}</p> : null}
    </div>
  );
};

export const CritiquePanel: React.FC<{ log: CritiqueLog | null; title: string }> = ({ log, title }) => {
  if (!log?.rounds.length) return null;
  // nhiều phần (tập dài): gộp — một mục chỉ "đạt" khi mọi phần đều đạt; lý do lấy từ phần trượt đầu tiên
  const ids = [...new Set(log.rounds.flatMap((r) => r.checks.map((c) => c.id)))];
  const merged = ids.map((id) => {
    const fail = log.rounds.find((r) => r.checks.some((c) => c.id === id && !c.pass));
    const c = fail?.checks.find((x) => x.id === id) ?? log.rounds.at(-1)!.checks.find((x) => x.id === id) ?? { id, pass: true, reason: "" };
    return { ...c, pass: !fail, reason: fail?.label ? `${fail.label}: ${c.reason}` : c.reason };
  });
  const rate = merged.filter((c) => c.pass).length / Math.max(1, merged.length);
  const fixed = log.rounds.filter((r) => r.applied).length;
  return (
    <div className="rounded-md border border-ink-700 p-3">
      <div className="mb-1 flex items-center gap-2 text-sm font-bold">{title}
        <span className="ml-auto text-xs font-normal text-ink-300">{Math.round(rate * 100)}% mục đạt{log.rounds.length > 1 ? ` · ${log.rounds.length} phần` : ""}{fixed ? ` · Claude đã tự sửa ${fixed} lượt` : ""}</span>
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">{merged.map((c) => (
        <li key={c.id} className="flex items-start gap-1.5" title={c.reason}>
          {c.pass ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" /> : <CircleX className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />}
          <span><span>{CHECK_LABELS[c.id] ?? c.id}</span>{c.pass ? null : <span className="text-ink-300"> — {c.reason}</span>}</span>
        </li>))}</ul>
      {merged.some((c) => !c.pass) ? <p className="mt-1 text-xs text-ink-500">Mục đỏ là Claude tự nhận chưa đạt: đọc lại đoạn đó, sửa tay hoặc sửa dàn ý rồi bấm "Viết lại thoại".</p> : null}
    </div>
  );
};

export const BeatEditor: React.FC<{ sheet: BeatSheet; lib: Library; onChange: (s: BeatSheet) => void }> = ({ sheet, lib, onChange }) => {
  const set = (i: number, patch: Partial<BeatSheet["beats"][number]>) => { const x = structuredClone(sheet); x.beats[i] = { ...x.beats[i], ...patch }; onChange(x); };
  const castIds = Object.keys(lib.cast);
  const total = sheet.beats.reduce((a, b) => a + b.est_lines, 0);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="block"><span className="label">Tên tập</span><input className="field" value={sheet.title} onChange={(e) => onChange({ ...sheet, title: e.target.value})} /></label>
        <label className="block"><span className="label">Running gag</span><input className="field" value={sheet.runner} onChange={(e) => onChange({ ...sheet, runner: e.target.value})} /></label>
        <label className="col-span-2 block"><span className="label">Ý chính của tập</span><input className="field" value={sheet.idea} onChange={(e) => onChange({ ...sheet, idea: e.target.value})} /></label>
      </div>
      <ol className="space-y-2">{sheet.beats.map((b, i) => (
        <li key={i} className="rounded-md border border-ink-700 p-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-ink-300">{b.id}</span>
            {b.chapter && b.chapter !== sheet.beats[i - 1]?.chapter ? <span className="rounded bg-stud/15 px-1.5 text-xs text-stud">{b.chapter}</span> : null}
            <select className="field w-40" value={b.kind} onChange={(e) => set(i, { kind: e.target.value as typeof b.kind })}>{KINDS.map((k) => <option key={k} value={k}>{KIND_LABELS[k]}</option>)}</select>
            <select className="field w-44" multiple={false} value={b.speakers[0]} onChange={(e) => set(i, { speakers: [e.target.value, ...b.speakers.slice(1).filter((x) => x !== e.target.value)] })}>
              {castIds.map((c) => <option key={c} value={c}>{lib.cast[c]?.name ?? c}</option>)}
            </select>
            <span className="truncate text-xs text-ink-300">{b.speakers.slice(1).map((s) => lib.cast[s]?.name ?? s).join(", ")}</span>
            <label className="ml-auto flex items-center gap-1 text-xs text-ink-300">số câu<input className="field w-14" type="number" min={1} max={20} value={b.est_lines} onChange={(e) => set(i, { est_lines: Math.max(1, Number(e.target.value)) })} /></label>
            <button className="btn px-1.5" title="Xóa nhịp" onClick={() => onChange({ ...sheet, beats: sheet.beats.filter((_, k) => k !== i).map((x, k) => ({ ...x, id: `B${k + 1}` })) })}><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
          <textarea className="field mt-1 h-14" value={b.summary} onChange={(e) => set(i, { summary: e.target.value })} />
          <div className="mt-1 grid grid-cols-3 gap-2">
            <input className="field" placeholder="Giá trị đổi (tự tin -> hoảng)" value={b.value_shift} onChange={(e) => set(i, { value_shift: e.target.value })} />
            <input className="field" placeholder="Cú hài chính" value={b.joke} onChange={(e) => set(i, { joke: e.target.value })} />
            <input className="field" placeholder="Thẻ chữ / biểu đồ" value={b.on_screen} onChange={(e) => set(i, { on_screen: e.target.value })} />
          </div>
        </li>))}</ol>
      <div className="flex items-center gap-2">
        <button className="btn" onClick={() => onChange({ ...sheet, beats: [...sheet.beats, { id: `B${sheet.beats.length + 1}`, kind: "escalation", summary: "...", value_shift: "", joke: "", on_screen: "", speakers: [sheet.cast[0] ?? castIds[0]], est_lines: 2 }] })}><Plus className="h-4 w-4" /> Thêm nhịp</button>
        <span className="text-xs text-ink-300">Tổng khoảng {total} câu thoại.</span>
      </div>
    </div>
  );
};
