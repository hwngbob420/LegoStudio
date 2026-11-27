// Gọi server (vite proxy /api -> 127.0.0.1:8788).
import type { Issue } from "@lse/director";
import type { BeatSheet, BlockReview, CritiqueLog, ReviewComment, ReviewNote, Script, SourceEntry, Storyboard, Timing, WritingInput } from "@lse/shared";

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const r = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? `Lỗi ${r.status}`);
  return j as T;
}

export interface ProjectSummary { id: string; title: string; hasVideo: boolean }
export interface ProjectState {
  project: { id: string; title: string } | null;
  script: Script | null;
  storyboard: Storyboard;
  timing: Timing | null;
  issues: Issue[];
  refErrors: string[];
  hasVideo: boolean;
  hasContact: boolean;
}
export interface Job { id: string; project: string; kind: string; status: "queued" | "running" | "done" | "error"; stage?: string; progress?: number; log: string[]; error?: string; createdAt: string; endedAt?: string }
export interface Library {
  catalog: { cast: Record<string, { name: string; vibe: string }>; sets: Record<string, { anchors: string[]; lighting: string; notes?: string }>; actions: Record<string, string>; expressions: string[] };
  cast: Record<string, any>;
  castTier: Record<string, string>;
  sets: Record<string, { id: string; name: string; lighting: string; anchors: string[]; notes?: string }>;
  lighting: Record<string, any>;
  palette: Record<string, string>;
  faceSpec: any;
  manifest: any;
  bakedReady: boolean;
}

export const api = {
  library: () => req<Library>("GET", "/api/library"),
  projects: () => req<ProjectSummary[]>("GET", "/api/projects"),
  createProject: (title: string) => req<{ id: string; title: string }>("POST", "/api/projects", { title }),
  project: (id: string) => req<ProjectState>("GET", `/api/projects/${id}`),
  saveScript: (id: string, s: Script) => req<Script>("PUT", `/api/projects/${id}/script`, s),
  saveStoryboard: (id: string, sb: Storyboard) => req<{ storyboard: Storyboard; issues: Issue[] }>("PUT", `/api/projects/${id}/storyboard`, sb),
  preview: (id: string, block?: string) => req<any>("GET", `/api/projects/${id}/preview${block ? `?block=${block}` : ""}`),
  runJob: (id: string, kind: string) => req<Job>("POST", `/api/projects/${id}/jobs`, { kind }),
  jobs: (project?: string) => req<Job[]>("GET", `/api/jobs${project ? `?project=${project}` : ""}`),
  qa: (id: string) => req<any>("GET", `/api/projects/${id}/qa`),
  saveCast: (recipe: unknown, episode?: string) => req<any>("POST", `/api/library/cast${episode ? `?episode=${episode}` : ""}`, recipe),
  promote: (episode: string, id: string) => req<any>("POST", "/api/library/promote", { episode, id }),
  ai: (id: string, task: string, body: unknown) => req<any>("POST", `/api/projects/${id}/ai/${task}`, body),
  sources: (id: string) => req<SourceEntry[]>("GET", `/api/projects/${id}/sources`),
  deleteSource: (id: string, sid: string) => req<any>("DELETE", `/api/projects/${id}/sources/${sid}`),
  uploadSource: async (id: string, file: File): Promise<SourceEntry> => {
    const fd = new FormData();
    fd.append("file", file, file.name);
    const r = await fetch(`/api/projects/${id}/sources`, { method: "POST", body: fd });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((j as { error?: string }).error ?? `Lỗi ${r.status}`);
    return j as SourceEntry;
  },
  writing: (id: string) => req<Writing>("GET", `/api/projects/${id}/writing`),
  saveBeats: (id: string, b: BeatSheet) => req<BeatSheet>("PUT", `/api/projects/${id}/writing/beats`, b),
  generate: (id: string, body: { input?: WritingInput; from?: "dialogue" }) => req<Job>("POST", `/api/projects/${id}/writing/generate`, body),
  aiStatus: () => req<{ ok: boolean; provider: string; message: string }>("GET", "/api/ai/status"),
  // block ~2 phút + bảng duyệt
  blocks: (id: string) => req<BlockList>("GET", `/api/projects/${id}/blocks`),
  splitBlocks: (id: string) => req<{ blocks: { id: string; lines: number }[] }>("POST", `/api/projects/${id}/blocks/split`),
  addComment: (id: string, bid: string, c: { text: string; kind: ReviewComment["kind"]; line?: string; shot?: string }) => req<ReviewComment>("POST", `/api/projects/${id}/blocks/${bid}/comments`, c),
  updateComment: (id: string, bid: string, cid: string, patch: { resolved?: boolean; text?: string }) => req<BlockReview>("PATCH", `/api/projects/${id}/blocks/${bid}/comments/${cid}`, patch),
  deleteComment: (id: string, bid: string, cid: string) => req<BlockReview>("DELETE", `/api/projects/${id}/blocks/${bid}/comments/${cid}`),
  setBlockStatus: (id: string, bid: string, status: BlockReview["status"]) => req<BlockReview>("PUT", `/api/projects/${id}/blocks/${bid}/status`, { status }),
  fixBlock: (id: string, bid: string) => req<Job>("POST", `/api/projects/${id}/blocks/${bid}/fix`),
  makePreview: (id: string, body: { input?: WritingInput; from?: "write" | "voice" | "direct" }) => req<Job>("POST", `/api/projects/${id}/make-preview`, body),
};

export interface BlockView {
  id: string; index: number; f0: number; f1: number; t0: number; t1: number; hash: string;
  lines: { id: string; speaker: string; text: string; beat?: string }[];
  shots: string[];
  notes: ReviewNote[];
  review: BlockReview;
  output?: { file: string; fresh: boolean };
}
export interface BlockList { ready: boolean; reason: string; duration?: number; blocks: BlockView[] }

export interface Writing { input: WritingInput | null; beats: BeatSheet | null; beatCritique: CritiqueLog | null; scriptCritique: CritiqueLog | null }

/** Đường dẫn file trong workspace qua server, có tham số chống cache. */
export const wsUrl = (p: string, bust?: string | number) => `/ws/${p}${bust ? `?v=${bust}` : ""}`;
