// Tab 2 — Xưởng: diễn viên (ráp minifig, Gđ 2C) và bộ set của tập.
import React from "react";
import type { Storyboard } from "@lse/shared";
import type { Library, ProjectState } from "../api";

export const WorkshopTab: React.FC<{ pid: string; state: ProjectState; lib: Library; onStoryboard: (sb: Storyboard) => void; onReload: () => void }> = ({ lib }) => (
  <div className="grid grid-cols-2 gap-4">
    <section className="card p-4">
      <div className="mb-2 text-lg font-bold">Diễn viên</div>
      <ul className="space-y-1 text-sm">{Object.entries(lib.cast).map(([id, r]) => <li key={id}>{r.name} <span className="text-ink-500">({id}, {lib.castTier[id] === "channel" ? "kho kênh" : "riêng tập"})</span></li>)}</ul>
    </section>
    <section className="card p-4">
      <div className="mb-2 text-lg font-bold">Bộ set</div>
      <ul className="space-y-1 text-sm">{Object.values(lib.sets).map((s) => <li key={s.id}>{s.name} <span className="text-ink-500">({s.id})</span></li>)}</ul>
    </section>
  </div>
);
