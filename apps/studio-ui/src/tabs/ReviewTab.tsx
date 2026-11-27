// Tab Duyệt (5C): tập chia block ~2 phút. Mỗi block: Player xem riêng, lời thoại, nhận xét tự động (code + Claude),
// góp ý của bạn, nút "Claude sửa block này" (chỉ block đó đổi) và "Duyệt block".
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  CircleAlert, CircleCheck, Info, LoaderCircle, MessageSquarePlus, Scissors, Sparkles, Trash2, Check, Undo2, Wand2, Bot, Cpu, Clapperboard, Mic,
} from "lucide-react";
import type { ReviewComment } from "@lse/shared";
import { api, wsUrl, type BlockList, type Library, type ProjectState } from "../api";
import { PlayerPane, type PlayerPaneHandle } from "../components/PlayerPane";
import { useJobs } from "../components/jobs";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "Chờ duyệt", cls: "border-ink-500 text-ink-300" },
  needs_fix: { label: "Cần sửa", cls: "border-amber-500/60 text-amber-300" },
  fixing: { label: "Claude đang sửa", cls: "border-stud/60 text-stud" },
  approved: { label: "Đã duyệt", cls: "border-emerald-500/60 text-emerald-300" },
};
const KIND: Record<ReviewComment["kind"], string> = { content: "Nội dung", visual: "Hình ảnh", any: "Chung" };

export const ReviewTab: React.FC<{ pid: string; state: ProjectState; lib: Library; rev: number; onReload: () => void }> = ({ pid, state, lib, rev, onReload }) => {
  const { busy, jobs, refresh } = useJobs();
  const [list, setList] = useState<BlockList | null>(null);
  const [sel, setSel] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [kind, setKind] = useState<ReviewComment["kind"]>("any");
  const [anchor, setAnchor] = useState<{ line?: string; shot?: string }>({});
  const [view, setView] = useState<"live" | "final">("live");
  const player = useRef<PlayerPaneHandle>(null);
  const job = busy("make_preview") ?? busy("fix_block");

  const load = useCallback(async () => {
    try {
      const l = await api.blocks(pid);
      setList(l); setErr(null);
      setSel((cur) => (l.blocks.some((b) => b.id === cur) ? cur : l.blocks[0]?.id ?? ""));
    } catch (e) { setErr((e as Error).message); }
  }, [pid]);
  useEffect(() => { void load(); }, [load, rev]);

  if (err) return <div className="card p-6 text-sm text-red-300">{err}</div>;
  if (!list) return <div className="text-ink-300">Đang tải các block...</div>;
  const b = list.blocks.find((x) => x.id === sel) ?? list.blocks[0];
  const approved = list.blocks.filter((x) => x.review.status === "approved").length;
  const names = (id: string) => lib.cast[id]?.name ?? id;
  const lastErr = jobs.find((j) => j.kind === "make_preview" || j.kind === "fix_block");

  const act = async (fn: () => Promise<unknown>) => { try { await fn(); await load(); } catch (e) { setErr((e as Error).message); setTimeout(() => setErr(null), 6000); } };
  const addComment = () => act(async () => {
    await api.addComment(pid, b.id, { text: text.trim(), kind, ...anchor });
    setText(""); setAnchor({});
  });
  const fix = () => act(async () => { await api.fixBlock(pid, b.id); await refresh(); });
  const seekLine = (lid: string) => {
    const L = state.timing?.lines[lid];
    if (L && b) player.current?.seekSec(Math.max(0, L.start - b.t0 - 0.2));
  };
  const longNoBlocks = !state.script?.lines.some((l) => l.block) && (state.timing?.duration ?? 0) > 150;

  return (
    <div className="grid grid-cols-[300px_minmax(0,1fr)] gap-4">
      <aside className="card sticky top-0 max-h-[calc(100vh-7rem)] space-y-3 self-start overflow-y-auto p-3">
        <div className="flex items-baseline gap-2">
          <div className="text-lg font-bold">Các block</div>
          <span className="text-xs text-ink-300">{approved}/{list.blocks.length} đã duyệt{list.duration ? ` · ${fmt(list.duration)}` : ""}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded bg-ink-700"><div className="h-full bg-emerald-500" style={{ width: `${(100 * approved) / Math.max(1, list.blocks.length)}%` }} /></div>
        <ul className="space-y-1">
          {list.blocks.map((x) => {
            const open = x.review.comments.filter((c) => !c.resolved).length;
            const errs = x.notes.filter((n) => n.level === "error").length;
            return (
              <li key={x.id}>
                <button onClick={() => setSel(x.id)} className={`w-full rounded-md border px-2 py-1.5 text-left ${x.id === b?.id ? "border-stud bg-stud/10" : "border-ink-700 hover:border-ink-500"}`}>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-semibold">Block {x.index + 1}</span>
                    {list.ready ? <span className="text-xs text-ink-300">{fmt(x.t0)}–{fmt(x.t1)}</span> : null}
                    <span className={`ml-auto rounded border px-1.5 text-[11px] ${STATUS[x.review.status].cls}`}>{STATUS[x.review.status].label}</span>
                  </div>
                  <div className="mt-0.5 flex gap-3 text-xs text-ink-500">
                    <span>{x.lines.length} câu</span>
                    {open ? <span className="text-amber-300">{open} góp ý</span> : null}
                    {errs ? <span className="text-red-300">{errs} lỗi hình</span> : null}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
        {longNoBlocks ? (
          <div className="space-y-2 rounded-md border border-ink-700 p-2 text-xs text-ink-300">
            <p>Tập này làm trước khi có block. Chia thành các block ~2 phút để duyệt và sửa từng đoạn (sau đó tạo giọng lại, câu cũ được dùng lại).</p>
            <button className="btn w-full justify-center" disabled={!!busy()} onClick={() => act(async () => { await api.splitBlocks(pid); await api.makePreview(pid, { from: "voice" }); await refresh(); onReload(); })}>
              <Scissors className="h-4 w-4" /> Chia block + dựng lại
            </button>
          </div>
        ) : null}
        {job ? (
          <div className="space-y-1 rounded-md border border-stud/40 p-2">
            <div className="flex items-center gap-1.5 text-sm text-stud"><LoaderCircle className="h-4 w-4 animate-spin" /> {job.kind === "fix_block" ? "Claude đang sửa block" : "Đang làm bản xem trước"}</div>
            <div className="h-1.5 w-full overflow-hidden rounded bg-ink-700"><div className="h-full bg-stud transition-all" style={{ width: `${Math.round((job.progress ?? 0.02) * 100)}%` }} /></div>
            <div className="text-xs text-ink-300">{STAGE[job.stage ?? ""] ?? job.stage} · {job.log.filter((l) => !l.startsWith("[progress]")).at(-1) ?? ""}</div>
          </div>
        ) : lastErr?.status === "error" ? <div className="text-xs text-red-300">Lỗi: {lastErr.log.filter((l) => l.startsWith("LỖI")).at(-1) ?? lastErr.error}</div> : null}
      </aside>

      {b ? (
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-lg font-bold">Block {b.index + 1}</div>
            {list.ready ? <span className="text-sm text-ink-300">{fmt(b.t0)}–{fmt(b.t1)} · {fmt(b.t1 - b.t0)} · {b.lines.length} câu · {b.shots.length} cảnh</span> : null}
            <span className={`rounded border px-1.5 text-xs ${STATUS[b.review.status].cls}`}>{STATUS[b.review.status].label}</span>
            <div className="ml-auto flex gap-2">
              <button className="btn-primary" disabled={!!busy() || !b.review.comments.some((c) => !c.resolved)} onClick={fix}
                title="Claude đọc góp ý, viết lại thoại block này (nếu cần), tạo giọng câu đổi và dựng lại hình. Block khác giữ nguyên.">
                <Wand2 className="h-4 w-4" /> Claude sửa block này
              </button>
              {b.review.status === "approved"
                ? <button className="btn" onClick={() => act(() => api.setBlockStatus(pid, b.id, "draft"))}><Undo2 className="h-4 w-4" /> Bỏ duyệt</button>
                : <button className="btn" disabled={b.review.status === "fixing"} onClick={() => act(() => api.setBlockStatus(pid, b.id, "approved"))}><Check className="h-4 w-4" /> Duyệt block</button>}
            </div>
          </div>

          {list.ready && b.output ? (
            <div className="flex gap-1 text-xs">
              <button className={`rounded-md border px-2 py-0.5 ${view === "live" ? "border-stud bg-stud/15" : "border-ink-700"}`} onClick={() => setView("live")}>Xem trước nhanh (Three.js)</button>
              <button className={`rounded-md border px-2 py-0.5 ${view === "final" ? "border-stud bg-stud/15" : "border-ink-700"}`} onClick={() => setView("final")}>Bản render cuối (Blender){b.output.fresh ? "" : " · cũ"}</button>
              {!b.output.fresh ? <span className="text-amber-300">Block đã sửa sau lần render này; bấm Xuất bản để render lại riêng block này.</span> : null}
            </div>
          ) : null}
          {list.ready && b.output && view === "final" ? <div className="card overflow-hidden"><video key={`${b.id}${rev}`} src={wsUrl(`projects/${pid}/${b.output.file}`, rev)} controls className="w-full" /></div>
            : list.ready ? <PlayerPane key={b.id} ref={player} pid={pid} rev={rev} block={b.id} onShot={(id) => setAnchor({ shot: id })} />
            : <div className="card flex items-center gap-3 p-6 text-sm text-ink-300"><Info className="h-5 w-5" /> {list.reason}
                <button className="btn ml-auto" disabled={!!busy()} onClick={() => act(async () => { await api.makePreview(pid, { from: state.timing ? "direct" : "voice" }); await refresh(); })}>
                  {state.timing ? <Clapperboard className="h-4 w-4" /> : <Mic className="h-4 w-4" />} {state.timing ? "Dựng hình" : "Tạo giọng + dựng hình"}
                </button></div>}

          <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-4">
            <section className="card space-y-2 p-3">
              <div className="text-sm font-semibold">Lời thoại</div>
              <table className="w-full text-sm">
                <tbody>
                  {b.lines.map((L) => (
                    <tr key={L.id} className={`group align-top ${anchor.line === L.id ? "bg-stud/10" : ""}`}>
                      <td className="w-12 cursor-pointer py-0.5 font-mono text-xs text-ink-500" onClick={() => seekLine(L.id)} title="Nghe câu này">{L.id}</td>
                      <td className="w-28 py-0.5 pr-2 text-ink-300">{names(L.speaker)}</td>
                      <td className="cursor-pointer py-0.5" onClick={() => seekLine(L.id)}>{L.text}</td>
                      <td className="w-8 py-0.5"><button className="invisible text-ink-300 group-hover:visible" title="Góp ý câu này" onClick={() => { setAnchor({ line: L.id }); setKind("content"); }}><MessageSquarePlus className="h-4 w-4" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <div className="space-y-4">
              <section className="card space-y-2 p-3">
                <div className="text-sm font-semibold">Nhận xét</div>
                {b.notes.length ? (
                  <ul className="space-y-1.5 text-sm">
                    {b.notes.map((n) => (
                      <li key={n.id} className="flex gap-2">
                        {n.level === "error" ? <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-brick" /> : n.level === "warn" ? <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" /> : <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-ok" />}
                        <span className="flex-1">{n.text}</span>
                        <span className="shrink-0 text-[11px] text-ink-500" title={n.source === "claude" ? "Claude tự chấm" : "Code kiểm"}>{n.source === "claude" ? <Bot className="h-3.5 w-3.5" /> : <Cpu className="h-3.5 w-3.5" />}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-xs text-ink-500">Không có nhận xét.</p>}
                {b.review.history.length ? (
                  <div className="border-t border-ink-700 pt-2 text-xs text-ink-300">
                    {b.review.history.slice(-3).map((h, i) => <p key={i} className="flex gap-1.5"><Sparkles className="h-3.5 w-3.5 shrink-0 text-stud" /> {h.summary}</p>)}
                  </div>
                ) : null}
              </section>

              <section className="card space-y-2 p-3">
                <div className="text-sm font-semibold">Góp ý của bạn</div>
                {b.review.comments.length ? (
                  <ul className="space-y-1.5 text-sm">
                    {b.review.comments.map((c) => (
                      <li key={c.id} className={`flex gap-2 ${c.resolved ? "text-ink-500 line-through" : ""}`}>
                        <span className="shrink-0 rounded border border-ink-700 px-1 text-[11px]">{KIND[c.kind]}{c.line ? ` · ${c.line}` : ""}{c.shot ? ` · ${c.shot}` : ""}</span>
                        <span className="flex-1">{c.text}</span>
                        <button title={c.resolved ? "Mở lại" : "Đánh dấu đã xong"} onClick={() => act(() => api.updateComment(pid, b.id, c.id, { resolved: !c.resolved }))}>{c.resolved ? <Undo2 className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}</button>
                        <button title="Xoá" onClick={() => act(() => api.deleteComment(pid, b.id, c.id))}><Trash2 className="h-3.5 w-3.5" /></button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <textarea className="field h-20" value={text} onChange={(e) => setText(e.target.value)}
                  placeholder="Ví dụ: Câu L12 chưa buồn cười, cho Priya đáp gắt hơn. Hoặc: cảnh biểu đồ nên cận mặt Max lúc nói con số." />
                <div className="flex flex-wrap items-center gap-2">
                  {(Object.keys(KIND) as ReviewComment["kind"][]).map((k) => (
                    <button key={k} className={`rounded-md border px-2 py-0.5 text-xs ${kind === k ? "border-stud bg-stud/15" : "border-ink-700"}`} onClick={() => setKind(k)}>{KIND[k]}</button>
                  ))}
                  {anchor.line || anchor.shot ? (
                    <button className="rounded-md border border-stud/50 px-2 py-0.5 text-xs text-stud" onClick={() => setAnchor({})} title="Bỏ gắn">{anchor.line ? `Câu ${anchor.line}` : `Cảnh ${anchor.shot}`} ×</button>
                  ) : <span className="text-xs text-ink-500">Bấm biểu tượng ở cuối câu hoặc vạch cảnh dưới Player để gắn góp ý.</span>}
                  <button className="btn ml-auto" disabled={!text.trim()} onClick={addComment}><MessageSquarePlus className="h-4 w-4" /> Thêm góp ý</button>
                </div>
              </section>
            </div>
          </div>
        </div>
      ) : <div className="card p-6 text-ink-300">Chưa có block nào.</div>}
    </div>
  );
};

const STAGE: Record<string, string> = { write: "Claude viết kịch bản", fix: "Claude sửa thoại", tts: "Tạo giọng", direct: "AI đạo diễn dựng hình" };
