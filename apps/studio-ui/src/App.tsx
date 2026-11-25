import React, { useCallback, useEffect, useRef, useState } from "react";
import { Boxes, Clapperboard, FileText, Mic, Plus, Send, Blocks, CircleCheck, LoaderCircle } from "lucide-react";
import type { Script, Storyboard } from "@lse/shared";
import { api, type Library, type ProjectState, type ProjectSummary } from "./api";
import { ScriptTab } from "./tabs/ScriptTab";
import { WorkshopTab } from "./tabs/WorkshopTab";
import { VoiceTab } from "./tabs/VoiceTab";
import { DirectorTab } from "./tabs/DirectorTab";
import { PublishTab } from "./tabs/PublishTab";
import { JobsProvider } from "./components/jobs";

const TABS = [
  { id: "script", label: "Kịch bản", icon: FileText },
  { id: "workshop", label: "Xưởng", icon: Boxes },
  { id: "voice", label: "Giọng đọc", icon: Mic },
  { id: "director", label: "Đạo diễn & Xem trước", icon: Clapperboard },
  { id: "publish", label: "Xuất bản", icon: Send },
] as const;
type TabId = (typeof TABS)[number]["id"];

export type SaveState = "saved" | "saving" | "error";

export const App: React.FC = () => {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [pid, setPid] = useState<string>(() => localStorage.getItem("lse.project") ?? "showcase_v1");
  const [tab, setTab] = useState<TabId>(() => (localStorage.getItem("lse.tab") as TabId) ?? "director");
  const [state, setState] = useState<ProjectState | null>(null);
  const [lib, setLib] = useState<Library | null>(null);
  const [save, setSave] = useState<SaveState>("saved");
  const [err, setErr] = useState<string | null>(null);
  const [rev, setRev] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const reload = useCallback(async () => {
    try {
      const [ps, st, l] = await Promise.all([api.projects(), api.project(pid), api.library()]);
      setProjects(ps); setState(st); setLib(l); setErr(null); setRev((r) => r + 1);
    } catch (e) { setErr((e as Error).message); }
  }, [pid]);
  useEffect(() => { localStorage.setItem("lse.project", pid); void reload(); }, [pid]);
  useEffect(() => { localStorage.setItem("lse.tab", tab); }, [tab]);

  /** Tự lưu storyboard sau 800 ms không sửa (giống PSE). */
  const editStoryboard = useCallback((sb: Storyboard) => {
    setState((s) => (s ? { ...s, storyboard: sb } : s));
    setSave("saving");
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const r = await api.saveStoryboard(pid, sb);
        setState((s) => (s ? { ...s, issues: r.issues, refErrors: [] } : s));
        setSave("saved"); setErr(null); setRev((x) => x + 1);
      } catch (e) { setSave("error"); setErr((e as Error).message); }
    }, 800);
  }, [pid]);

  const editScript = useCallback(async (sc: Script) => {
    setState((s) => (s ? { ...s, script: sc } : s));
    setSave("saving");
    try { await api.saveScript(pid, sc); setSave("saved"); } catch (e) { setSave("error"); setErr((e as Error).message); }
  }, [pid]);

  const newProject = async () => {
    const title = window.prompt("Tên tập mới:");
    if (!title) return;
    try { const r = await api.createProject(title); setPid(r.id); setTab("script"); } catch (e) { setErr((e as Error).message); }
  };

  return (
    <JobsProvider project={pid} onJobDone={reload}>
      <div className="flex h-full flex-col">
        <header className="flex items-center gap-3 border-b border-ink-700 bg-ink-900 px-4 py-2">
          <div className="flex items-center gap-2 font-bold"><Blocks className="h-5 w-5 text-stud" /> Lego Studio</div>
          <select className="field w-64" value={pid} onChange={(e) => setPid(e.target.value)}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.title} ({p.id})</option>)}
          </select>
          <button className="btn" onClick={newProject}><Plus className="h-4 w-4" /> Tập mới</button>
          <nav className="ml-4 flex gap-1">
            {TABS.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm ${tab === t.id ? "bg-ink-700 text-white" : "text-ink-300 hover:bg-ink-800"}`}>
                <t.icon className="h-4 w-4" /> {t.label}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1.5 text-xs text-ink-300">
            {save === "saving" ? <><LoaderCircle className="h-4 w-4 animate-spin" /> Đang lưu...</> : save === "saved" ? <><CircleCheck className="h-4 w-4 text-ok" /> Đã tự lưu</> : <span className="text-brick">Lưu lỗi</span>}
          </div>
        </header>
        {err ? <div className="border-b border-brick/40 bg-brick/15 px-4 py-2 text-sm text-red-200">{err}</div> : null}
        <main className="min-h-0 flex-1 overflow-auto p-4">
          {!state || !lib ? <div className="text-ink-300">Đang tải...</div> : (
            <>
              {tab === "script" && <ScriptTab pid={pid} state={state} lib={lib} onScript={editScript} onReload={reload} />}
              {tab === "workshop" && <WorkshopTab pid={pid} state={state} lib={lib} onStoryboard={editStoryboard} onReload={reload} />}
              {tab === "voice" && <VoiceTab pid={pid} state={state} lib={lib} />}
              {tab === "director" && <DirectorTab pid={pid} state={state} lib={lib} rev={rev} onStoryboard={editStoryboard} />}
              {tab === "publish" && <PublishTab pid={pid} state={state} rev={rev} />}
            </>
          )}
        </main>
      </div>
    </JobsProvider>
  );
};
