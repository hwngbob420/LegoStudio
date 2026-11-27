// Theo dõi việc nền (Blender, Remotion, TTS) của tập đang mở: hỏi server mỗi 1,5 giây khi có việc đang chạy.
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { LoaderCircle, CircleCheck, CircleAlert, Play } from "lucide-react";
import { api, type Job } from "../api";

interface Ctx { jobs: Job[]; run: (kind: string) => Promise<void>; busy: (kind?: string) => Job | undefined; refresh: () => Promise<void> }
const JobsCtx = createContext<Ctx>({ jobs: [], run: async () => {}, busy: () => undefined, refresh: async () => {} });
export const useJobs = () => useContext(JobsCtx);

export const JobsProvider: React.FC<{ project: string; onJobDone: () => void; children: React.ReactNode }> = ({ project, onJobDone, children }) => {
  const [jobs, setJobs] = useState<Job[]>([]);
  const prev = useRef<Record<string, string>>({});
  const refresh = useCallback(async () => {
    const js = await api.jobs(project).catch(() => [] as Job[]);
    for (const j of js) if (prev.current[j.id] && prev.current[j.id] !== j.status && (j.status === "done" || j.status === "error")) onJobDone();
    prev.current = Object.fromEntries(js.map((j) => [j.id, j.status]));
    setJobs(js);
  }, [project, onJobDone]);
  useEffect(() => { void refresh(); }, [project]);
  const active = jobs.some((j) => j.status === "running" || j.status === "queued");
  useEffect(() => {
    if (!active) return;
    const t = setInterval(refresh, 1500);
    return () => clearInterval(t);
  }, [active, refresh]);
  const run = async (kind: string) => { await api.runJob(project, kind); await refresh(); };
  const busy = (kind?: string) => jobs.find((j) => (j.status === "running" || j.status === "queued") && (!kind || j.kind === kind));
  return <JobsCtx.Provider value={{ jobs, run, busy, refresh }}>{children}</JobsCtx.Provider>;
};

export const LABEL: Record<string, string> = { make_preview: "Làm bản xem trước", fix_block: "Claude sửa block", write_script: "Viết kịch bản", tts: "Tạo giọng", contact: "Kiểm khung", render: "Render 3D", publish: "Xuất bản trọn tập", recut: "Cắt lại chữ + tiếng", library: "Nướng kho" };

/** Nút chạy một việc nền, kèm trạng thái và thanh tiến độ. */
export const JobButton: React.FC<{ kind: string; label?: string; primary?: boolean; icon?: React.ReactNode }> = ({ kind, label, primary, icon }) => {
  const { run, busy, jobs } = useJobs();
  const b = busy(kind);
  const last = jobs.find((j) => j.kind === kind);
  return (
    <div className="flex flex-col gap-1">
      <button className={primary ? "btn-primary" : "btn"} disabled={!!busy()} onClick={() => run(kind)}>
        {b ? <LoaderCircle className="h-4 w-4 animate-spin" /> : icon ?? <Play className="h-4 w-4" />} {label ?? LABEL[kind] ?? kind}
      </button>
      {b && b.progress !== undefined && b.progress < 1 ? (
        <div className="h-1.5 w-full overflow-hidden rounded bg-ink-700"><div className="h-full bg-stud" style={{ width: `${Math.round(b.progress * 100)}%` }} /></div>
      ) : null}
      {b ? <span className="text-xs text-ink-300">{b.status === "queued" ? "Đang chờ lượt..." : `Đang chạy: ${b.stage ?? ""}`}</span> : null}
      {!b && last?.status === "error" ? <span className="text-xs text-red-300">Lỗi: {last.error}</span> : null}
    </div>
  );
};

export const JobList: React.FC = () => {
  const { jobs } = useJobs();
  if (!jobs.length) return <div className="text-sm text-ink-500">Chưa có việc nào.</div>;
  return (
    <ul className="space-y-1 text-sm">
      {jobs.slice(0, 8).map((j) => (
        <li key={j.id} className="flex items-center gap-2">
          {j.status === "done" ? <CircleCheck className="h-4 w-4 text-ok" /> : j.status === "error" ? <CircleAlert className="h-4 w-4 text-brick" /> : <LoaderCircle className="h-4 w-4 animate-spin text-stud" />}
          <span>{LABEL[j.kind] ?? j.kind}</span>
          <span className="text-ink-500">{j.stage ?? ""}</span>
          <span className="ml-auto text-xs text-ink-500">{j.createdAt.slice(11, 19)}</span>
        </li>
      ))}
    </ul>
  );
};
