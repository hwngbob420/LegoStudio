// Tab 4 — Đạo diễn & Xem trước: Player tức thì (Three.js), dãy thẻ cảnh, bảng sửa cảnh, lỗi bố cục, Kiểm khung (Blender).
import React, { useMemo, useRef, useState } from "react";
import { AlertTriangle, Plus, Trash2, Copy, ScanEye, Sparkles, Wand2, LoaderCircle } from "lucide-react";
import { ACTIONS, CAMERA_MOVES, CAMERA_PRESETS, EXPRESSIONS, FX_KINDS, SUBJECT_ZONES, UI_ZONE_NAMES, type Shot, type Storyboard } from "@lse/shared";
import { api, wsUrl, type Library, type ProjectState } from "../api";
import { PlayerPane, type PlayerPaneHandle } from "../components/PlayerPane";
import { Field, NumberInput, Select, TimeInput } from "../components/Fields";
import { JobButton } from "../components/jobs";

const PRESET_VI: Record<string, string> = { assembly_high: "Toàn cao (lắp ráp)", wide_establish: "Toàn", mcu: "Trung cận", ecu: "Cận mặt", two_shot: "Hai người" };
const MOVE_VI: Record<string, string> = { none: "Đứng yên", push_in: "Đẩy vào", pull_out: "Lùi ra", drift_right: "Trượt phải", crane_down: "Hạ cần" };
const ZONE_VI: Record<string, string> = { left_third: "1/3 trái", center: "Giữa", right_third: "1/3 phải", top_left: "Trên trái", top_right: "Trên phải", top_center: "Trên giữa", none: "Không có" };

export const DirectorTab: React.FC<{ pid: string; state: ProjectState; lib: Library; rev: number; onStoryboard: (sb: Storyboard) => void; onReload: () => void }> = ({ pid, state, lib, rev, onStoryboard, onReload }) => {
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const [aiMsg, setAiMsg] = useState<string | null>(null);
  const runAi = async (kind: "storyboard" | "rewrite") => {
    setAiBusy(kind); setAiMsg(null);
    try {
      if (kind === "storyboard") {
        if (!window.confirm("AI sẽ dựng lại TOÀN BỘ storyboard của tập từ kịch bản + giọng đọc. Các chỉnh tay hiện tại sẽ bị thay. Tiếp tục?")) { setAiBusy(null); return; }
        const r = await api.ai(pid, "storyboard", {});
        setAiMsg(`${r.source === "ai" ? "AI đạo diễn" : "Đạo diễn tự động"} đã dựng ${r.storyboard.shots.length} cảnh. ${r.note ?? ""}`);
      } else {
        const note = window.prompt("Muốn cảnh này khác thế nào? (để trống = AI tự chọn)") ?? "";
        await api.ai(pid, "rewrite-shot", { shot: sel, note });
        setAiMsg(`Đã viết lại cảnh ${sel}.`);
      }
      onReload();
    } catch (e) { setAiMsg((e as Error).message); }
    setAiBusy(null);
  };
  const sb = state.storyboard;
  const [sel, setSel] = useState(sb.shots[1]?.id ?? sb.shots[0].id);
  const player = useRef<PlayerPaneHandle>(null);
  const [preview, setPreview] = useState<any>(null);
  const shotIdx = Math.max(0, sb.shots.findIndex((s) => s.id === sel));
  const shot = sb.shots[shotIdx];
  const castIds = sb.cast.map((c) => c.id);
  const issues = preview?.issues ?? state.issues;
  const byShot = useMemo(() => {
    const m: Record<string, any[]> = {};
    for (const i of issues) (m[i.shot] ??= []).push(i);
    return m;
  }, [issues]);

  const setShot = (patch: Partial<Shot>) => {
    const next = structuredClone(sb);
    next.shots[shotIdx] = { ...next.shots[shotIdx], ...patch };
    onStoryboard(next);
  };
  const setCam = (patch: Partial<Shot["camera"]>) => setShot({ camera: { ...shot.camera, ...patch } });
  const setActor = (aid: string, patch: any) => setShot({ actors: { ...(shot.actors ?? {}), [aid]: { ...(shot.actors?.[aid] ?? {}), ...patch } } });
  const addShot = () => {
    const next = structuredClone(sb);
    const last = next.shots[next.shots.length - 1];
    const id = `S${next.shots.length + 1}`;
    const prevEnd = last.t1;
    last.t1 = typeof prevEnd === "string" && prevEnd === "END" ? "END-1" : prevEnd;
    next.shots.push({ ...structuredClone(last), id, t0: `${last.id}.t1`, t1: "END", assembly: undefined, fx: [], actors: {} });
    onStoryboard(next);
    setSel(id);
  };
  const dupShot = () => {
    const next = structuredClone(sb);
    const c = structuredClone(shot);
    c.id = `S${next.shots.length + 1}`;
    next.shots.splice(shotIdx + 1, 0, c);
    onStoryboard(next);
    setSel(c.id);
  };
  const delShot = () => {
    if (sb.shots.length < 2) return;
    const next = structuredClone(sb);
    next.shots.splice(shotIdx, 1);
    onStoryboard(next);
    setSel(next.shots[Math.max(0, shotIdx - 1)].id);
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_420px] gap-4">
      <div className="space-y-3">
        <PlayerPane ref={player} pid={pid} rev={rev} onShot={setSel} onPreview={setPreview} />
        <div className="flex items-center gap-2">
          <button className="btn-primary" disabled={!!aiBusy} onClick={() => runAi("storyboard")}>
            {aiBusy === "storyboard" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} AI tạo Storyboard
          </button>
          {aiMsg ? <span className="text-sm text-ink-300">{aiMsg}</span> : null}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {sb.shots.map((s) => {
            const err = (byShot[s.id] ?? []).some((i) => i.level === "error");
            return (
              <button key={s.id} onClick={() => setSel(s.id)}
                className={`min-w-44 rounded-lg border p-2 text-left text-xs ${s.id === sel ? "border-stud bg-ink-800" : "border-ink-700 bg-ink-900"} ${err ? "!border-brick" : ""}`}>
                <div className="flex items-center gap-1 font-semibold">{s.id} {err ? <AlertTriangle className="h-3.5 w-3.5 text-brick" /> : null}</div>
                <div className="text-ink-300">{PRESET_VI[s.camera.preset]} · {(s.subjects ?? []).map((a) => lib.catalog.cast[a]?.name ?? a).join(", ") || "toàn cảnh"}</div>
                <div className="font-mono text-ink-500">{String(s.t0)} → {String(s.t1)}</div>
              </button>
            );
          })}
          <button className="btn shrink-0" onClick={addShot}><Plus className="h-4 w-4" /> Cảnh</button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="card p-3">
            <div className="mb-2 flex items-center justify-between text-sm font-semibold">Lỗi bố cục <span className="text-xs font-normal text-ink-300">{issues.length} mục</span></div>
            {state.refErrors.length ? <ul className="mb-2 space-y-1 text-sm text-red-300">{state.refErrors.map((e, i) => <li key={i}>{e}</li>)}</ul> : null}
            {issues.length ? (
              <ul className="max-h-40 space-y-1 overflow-auto text-sm">
                {issues.map((i: any, k: number) => (
                  <li key={k} className={i.level === "error" ? "text-red-300" : "text-amber-200"}>
                    <button className="text-left hover:underline" onClick={() => { setSel(i.shot); if (i.t !== undefined) player.current?.seekSec(i.t); }}>{i.message}</button>
                  </li>
                ))}
              </ul>
            ) : <div className="text-sm text-ok">Không có lỗi: không thẻ chữ nào che mặt.</div>}
          </div>
          <div className="card p-3">
            <div className="mb-2 flex items-center justify-between text-sm font-semibold">Kiểm khung bằng Blender <JobButton kind="contact" icon={<ScanEye className="h-4 w-4" />} /></div>
            {state.hasContact ? <a href={wsUrl(`projects/${pid}/contact_sheet.jpg`, rev)} target="_blank"><img src={wsUrl(`projects/${pid}/contact_sheet.jpg`, rev)} className="rounded border border-ink-700" /></a>
              : <div className="text-sm text-ink-500">Chưa có contact sheet.</div>}
          </div>
        </div>
      </div>

      <aside className="card h-fit space-y-3 p-3">
        <div className="flex items-center gap-2">
          <div className="text-lg font-bold">Cảnh {shot.id}</div>
          <button className="btn ml-auto" title="AI viết lại riêng cảnh này" disabled={!!aiBusy || shotIdx === 0} onClick={() => runAi("rewrite")}>
            {aiBusy === "rewrite" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          </button>
          <button className="btn" title="Nhân bản" onClick={dupShot}><Copy className="h-4 w-4" /></button>
          <button className="btn" title="Xoá cảnh" onClick={delShot}><Trash2 className="h-4 w-4" /></button>
        </div>
        <Field label="Tóm tắt"><input className="field" value={shot.summary ?? ""} onChange={(e) => setShot({ summary: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Bắt đầu"><TimeInput value={shot.t0} onChange={(v) => setShot({ t0: v })} /></Field>
          <Field label="Kết thúc"><TimeInput value={shot.t1} onChange={(v) => setShot({ t1: v })} /></Field>
          <Field label="Bộ set"><Select value={shot.set} options={sb.sets.map((s) => s.id)} onChange={(v) => setShot({ set: v })} labels={Object.fromEntries(Object.values(lib.sets).map((s) => [s.id, s.name]))} /></Field>
          <Field label="Khung duyệt"><TimeInput value={shot.key_t} onChange={(v) => setShot({ key_t: v })} placeholder="giữa cảnh" /></Field>
        </div>
        <div className="rounded-lg border border-ink-700 p-2">
          <div className="label">Máy quay</div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Cỡ cảnh"><Select value={shot.camera.preset} options={CAMERA_PRESETS} labels={PRESET_VI} onChange={(v) => setCam({ preset: v })} /></Field>
            <Field label="Chuyển động"><Select value={shot.camera.move ?? "none"} options={CAMERA_MOVES} labels={MOVE_VI} onChange={(v) => setCam({ move: v })} /></Field>
            <Field label={`Góc ngang (${shot.camera.yaw ?? 0}°)`}><input type="range" min={-40} max={40} value={shot.camera.yaw ?? 0} onChange={(e) => setCam({ yaw: Number(e.target.value) })} className="w-full" /></Field>
            <Field label="Khoảng cách (m)"><NumberInput step={0.05} value={shot.camera.distance} onChange={(v) => setCam({ distance: v })} /></Field>
            <Field label="Tiêu cự (mm)"><NumberInput value={shot.camera.lens} onChange={(v) => setCam({ lens: v })} /></Field>
            <Field label="Khẩu độ f/"><NumberInput step={0.1} value={shot.camera.fstop} onChange={(v) => setCam({ fstop: v })} /></Field>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Chủ thể đứng"><Select value={shot.subject_zone} options={SUBJECT_ZONES} labels={ZONE_VI} onChange={(v) => setShot({ subject_zone: v })} /></Field>
          <Field label="Vùng chữ"><Select value={shot.ui_safe_zone} options={UI_ZONE_NAMES} labels={ZONE_VI} onChange={(v) => setShot({ ui_safe_zone: v })} /></Field>
        </div>
        <Field label="Chủ thể (camera bám theo)">
          <div className="flex flex-wrap gap-2">
            {castIds.map((a) => {
              const on = (shot.subjects ?? []).includes(a);
              return <button key={a} className={`rounded-md border px-2 py-0.5 text-sm ${on ? "border-stud bg-stud/15" : "border-ink-700"}`}
                onClick={() => setShot({ subjects: on ? (shot.subjects ?? []).filter((x) => x !== a) : [...(shot.subjects ?? []), a].slice(-2) })}>{lib.catalog.cast[a]?.name ?? a}</button>;
            })}
          </div>
        </Field>
        {castIds.map((aid) => {
          const A = shot.actors?.[aid] ?? {};
          return (
            <div key={aid} className="rounded-lg border border-ink-700 p-2">
              <div className="mb-1 text-sm font-semibold">{lib.catalog.cast[aid]?.name ?? aid}</div>
              <div className="label">Biểu cảm</div>
              {(A.expr ?? []).map((e, k) => (
                <div key={k} className="mb-1 grid grid-cols-[1fr_1.3fr_auto] gap-1">
                  <TimeInput value={e.t} onChange={(v) => { const x = [...(A.expr ?? [])]; x[k] = { ...e, t: v }; setActor(aid, { expr: x }); }} />
                  <Select value={e.e} options={EXPRESSIONS} onChange={(v) => { const x = [...(A.expr ?? [])]; x[k] = { ...e, e: v }; setActor(aid, { expr: x }); }} />
                  <button className="btn" onClick={() => setActor(aid, { expr: (A.expr ?? []).filter((_, i) => i !== k) })}><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
              <button className="btn mb-2 !py-0.5 text-xs" onClick={() => setActor(aid, { expr: [...(A.expr ?? []), { t: shot.t0, e: "innocent_dot" }] })}><Plus className="h-3.5 w-3.5" /> Biểu cảm</button>
              <div className="label">Động tác</div>
              {(A.acts ?? []).map((c, k) => (
                <div key={k} className="mb-1 grid grid-cols-[1.4fr_1fr_1fr_auto] gap-1">
                  <Select value={c.a} options={ACTIONS} onChange={(v) => { const x = [...(A.acts ?? [])]; x[k] = { ...c, a: v }; setActor(aid, { acts: x }); }} />
                  <TimeInput value={c.t0} onChange={(v) => { const x = [...(A.acts ?? [])]; x[k] = { ...c, t0: v }; setActor(aid, { acts: x }); }} />
                  <TimeInput value={c.t1} onChange={(v) => { const x = [...(A.acts ?? [])]; x[k] = { ...c, t1: v }; setActor(aid, { acts: x }); }} />
                  <button className="btn" onClick={() => setActor(aid, { acts: (A.acts ?? []).filter((_, i) => i !== k) })}><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
              <button className="btn !py-0.5 text-xs" onClick={() => setActor(aid, { acts: [...(A.acts ?? []), { a: "talk_gestures", t0: shot.t0, t1: shot.t1 }] })}><Plus className="h-3.5 w-3.5" /> Động tác</button>
            </div>
          );
        })}
        <div className="rounded-lg border border-ink-700 p-2">
          <div className="label">Hiệu ứng</div>
          {(shot.fx ?? []).map((f, k) => (
            <div key={k} className="mb-1 grid grid-cols-[1.2fr_1fr_1fr_1fr_auto] gap-1">
              <Select value={f.kind} options={FX_KINDS} onChange={(v) => { const x = [...(shot.fx ?? [])]; x[k] = { ...f, kind: v }; setShot({ fx: x }); }} />
              <Select value={f.actor} options={castIds} onChange={(v) => { const x = [...(shot.fx ?? [])]; x[k] = { ...f, actor: v }; setShot({ fx: x }); }} />
              <TimeInput value={f.t0} onChange={(v) => { const x = [...(shot.fx ?? [])]; x[k] = { ...f, t0: v }; setShot({ fx: x }); }} />
              <TimeInput value={f.t1} onChange={(v) => { const x = [...(shot.fx ?? [])]; x[k] = { ...f, t1: v }; setShot({ fx: x }); }} />
              <button className="btn" onClick={() => setShot({ fx: (shot.fx ?? []).filter((_, i) => i !== k) })}><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
          <button className="btn !py-0.5 text-xs" onClick={() => setShot({ fx: [...(shot.fx ?? []), { kind: "sparkle", actor: castIds[0], t0: shot.t0, t1: shot.t1 }] })}><Plus className="h-3.5 w-3.5" /> Hiệu ứng</button>
        </div>
        {(byShot[shot.id] ?? []).length ? (
          <ul className="space-y-1 rounded-lg border border-brick/50 bg-brick/10 p-2 text-sm text-red-200">
            {byShot[shot.id].map((i, k) => <li key={k}>{i.message}</li>)}
          </ul>
        ) : null}
      </aside>
    </div>
  );
};
