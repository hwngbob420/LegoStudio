// Tab 5 — Xuất bản: render Blender bản cuối, lớp chữ, trộn tiếng, ghép video; xem kết quả + ảnh QA.
import React from "react";
import { Clapperboard, Scissors, Film } from "lucide-react";
import { wsUrl, type ProjectState } from "../api";
import { JobButton, JobList } from "../components/jobs";

export const PublishTab: React.FC<{ pid: string; state: ProjectState; rev: number }> = ({ pid, state, rev }) => (
  <div className="grid grid-cols-[360px_minmax(0,1fr)] gap-4">
    <section className="card space-y-4 p-4">
      <div className="text-lg font-bold">Xuất bản</div>
      <JobButton kind="publish" primary label="Xuất trọn tập (giọng → 3D → chữ → ghép)" icon={<Film className="h-4 w-4" />} />
      <JobButton kind="render" label="Render lại 3D (giữ giọng)" icon={<Clapperboard className="h-4 w-4" />} />
      <JobButton kind="recut" label="Chỉ cắt lại chữ + tiếng (nhanh)" icon={<Scissors className="h-4 w-4" />} />
      <p className="text-xs text-ink-500">Bản cuối render bằng Blender EEVEE trên GPU: khoảng 1,2–1,7 giây mỗi hình (12 hình/giây thế giới), tập 20 giây mất 6–8 phút.</p>
      <div className="border-t border-ink-700 pt-3">
        <div className="label">Việc gần đây</div>
        <JobList />
      </div>
      <div className="border-t border-ink-700 pt-3 text-xs text-ink-300">
        File video: <span className="font-mono">workspace\projects\{pid}\output_final.mp4</span>
      </div>
    </section>
    <section className="space-y-4">
      {state.hasVideo ? (
        <div className="card overflow-hidden"><video key={rev} src={wsUrl(`projects/${pid}/output_final.mp4`, rev)} controls className="w-full" /></div>
      ) : <div className="card p-6 text-ink-300">Chưa có video. Bấm "Xuất trọn tập".</div>}
      {state.hasVideo ? (
        <div className="card p-3">
          <div className="label">Ảnh kiểm tra (QA)</div>
          <img src={wsUrl(`projects/${pid}/qa_frames/_strip.jpg`, rev)} className="rounded border border-ink-700" />
        </div>
      ) : null}
    </section>
  </div>
);
