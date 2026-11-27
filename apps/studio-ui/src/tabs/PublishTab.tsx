// Tab 5 — Xuất bản: bản chính (Blender + chữ + tiếng), phụ đề đa ngôn ngữ, Shorts dọc, chi phí AI và Hộp thư Claude.
import React, { useEffect, useState } from "react";
import { Clapperboard, Scissors, Film, Languages, Smartphone, Sparkles, Save, Inbox, Coins } from "lucide-react";
import { api, wsUrl, type ProjectState } from "../api";
import { JobButton, JobList, useJobs } from "../components/jobs";

export const PublishTab: React.FC<{ pid: string; state: ProjectState; rev: number }> = ({ pid, state, rev }) => {
  const { busy } = useJobs();
  const [langs, setLangs] = useState<Record<string, string>>({});
  const [lang, setLang] = useState("vi");
  const [loc, setLoc] = useState<any>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [costs, setCosts] = useState<any>(null);
  const [queue, setQueue] = useState<any[]>([]);
  useEffect(() => { fetch("/api/langs").then((r) => r.json()).then(setLangs); fetch("/api/costs").then((r) => r.json()).then(setCosts); fetch("/api/ai/queue").then((r) => r.json()).then(setQueue); }, [rev]);
  useEffect(() => { fetch(`/api/projects/${pid}/locale/${lang}`).then((r) => r.json()).then(setLoc); }, [pid, lang]);
  const saveLoc = async () => { await fetch(`/api/projects/${pid}/locale/${lang}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(loc) }); setMsg("Đã lưu bản dịch."); };
  const aiTranslate = async () => {
    setMsg("AI đang dịch...");
    try { setLoc(await api.ai(pid, "translate", { lang })); setMsg("AI đã dịch xong, hãy đọc lại rồi bấm Lưu."); } catch (e) { setMsg((e as Error).message); }
  };
  const shorts = async () => {
    try { const r = await (await fetch(`/api/projects/${pid}/shorts`, { method: "POST" })).json(); setMsg(r.error ?? `Đã tạo tập ${r.id} (1080x1920) và xếp lịch render. Chọn tập đó ở ô trên cùng để xem tiến độ.`); }
    catch (e) { setMsg((e as Error).message); }
  };
  return (
    <div className="grid grid-cols-[380px_minmax(0,1fr)] gap-4">
      <section className="space-y-4">
        <div className="card space-y-3 p-4">
          <div className="text-lg font-bold">Xuất bản</div>
          <JobButton kind="publish" primary label="Xuất trọn tập (giọng → 3D → chữ → ghép)" icon={<Film className="h-4 w-4" />} />
          <JobButton kind="render" label="Render lại 3D (giữ giọng)" icon={<Clapperboard className="h-4 w-4" />} />
          <JobButton kind="recut" label="Chỉ cắt lại chữ + tiếng (nhanh)" icon={<Scissors className="h-4 w-4" />} />
          <p className="text-xs text-ink-500">3D render bằng Blender EEVEE theo từng block ~2 phút: block không đổi từ lần trước được dùng lại, chỉ block vừa sửa phải render. Tắt app giữa chừng thì lần sau làm tiếp. Khoảng 1,2–1,7 giây mỗi hình (12 hình/giây thế giới). Mỗi block ra một video riêng, xem ở tab Duyệt block.</p>
          <button className="btn" onClick={shorts}><Smartphone className="h-4 w-4" /> Tạo Shorts dọc 1080x1920</button>
        </div>
        <div className="card space-y-2 p-4">
          <div className="flex items-center gap-2 font-bold"><Languages className="h-4 w-4" /> Phụ đề đa ngôn ngữ</div>
          <div className="flex gap-2">
            <select className="field" value={lang} onChange={(e) => setLang(e.target.value)}>{Object.entries(langs).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <button className="btn" onClick={aiTranslate}><Sparkles className="h-4 w-4" /> AI dịch</button>
            <button className="btn" onClick={saveLoc}><Save className="h-4 w-4" /></button>
          </div>
          <button className="btn-primary w-full justify-center" disabled={!!busy()} onClick={async () => { await saveLoc(); await fetch(`/api/projects/${pid}/jobs`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: "export_lang", lang }) }); setMsg(`Đã xếp lịch xuất phụ đề ${langs[lang]}.`); }}>
            Xuất bản phụ đề {langs[lang] ?? lang}
          </button>
          <p className="text-xs text-ink-500">Dùng lại hình 3D và giọng đã có; chỉ làm lại lớp chữ. Ra file output_final_{lang}.mp4.</p>
        </div>
        <div className="card space-y-1 p-4 text-sm">
          <div className="flex items-center gap-2 font-bold"><Coins className="h-4 w-4" /> Sổ chi phí AI</div>
          {costs ? <div className="text-ink-300">{costs.calls} lần gọi · {costs.input_tokens.toLocaleString()} token vào · {costs.output_tokens.toLocaleString()} token ra</div> : null}
          <div className="flex items-center gap-2 pt-2 font-bold"><Inbox className="h-4 w-4" /> Hộp thư Claude</div>
          <div className="text-ink-300">{queue.length ? `${queue.length} việc đang chờ Claude trả lời (gõ "xử lý hộp thư" trong Claude Code).` : "Không có việc nào đang chờ."}</div>
        </div>
        <div className="card p-4"><div className="label">Việc gần đây</div><JobList /></div>
      </section>
      <section className="space-y-4">
        {state.hasVideo ? <div className="card overflow-hidden"><video key={rev} src={wsUrl(`projects/${pid}/output_final.mp4`, rev)} controls className="w-full" /></div>
          : <div className="card p-6 text-ink-300">Chưa có video. Bấm "Xuất trọn tập".</div>}
        {msg ? <div className="card p-3 text-sm text-ink-300">{msg}</div> : null}
        {loc ? (
          <div className="card p-3">
            <div className="label">Bản dịch {langs[lang]} (sửa trực tiếp)</div>
            <table className="w-full text-sm">
              <tbody>{Object.entries(loc.lines as Record<string, string>).map(([id, t]) => (
                <tr key={id}><td className="w-12 py-0.5 font-mono text-ink-300">{id}</td>
                  <td><input className="field" value={t} onChange={(e) => setLoc({ ...loc, lines: { ...loc.lines, [id]: e.target.value } })} /></td></tr>
              ))}</tbody>
            </table>
          </div>
        ) : null}
        {state.hasVideo ? <div className="card p-3"><div className="label">Ảnh kiểm tra (QA)</div><img src={wsUrl(`projects/${pid}/qa_frames/_strip.jpg`, rev)} className="rounded border border-ink-700" /></div> : null}
      </section>
    </div>
  );
};
