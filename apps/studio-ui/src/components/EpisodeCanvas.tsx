// Sơ đồ tập dạng nút (React Flow, như Xưởng của PSE). Chỉ là một CÁCH NHÌN: dây Diễn viên -> Cảnh = diễn viên có mặt
// trong cảnh (shot.actors); Bộ set -> Cảnh = shot.set. canvas.json chỉ lưu vị trí nút.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Background, Controls, MiniMap, Position, ReactFlow, type Connection, type Edge, type Node, type OnNodesChange, type OnEdgesChange } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { Storyboard } from "@lse/shared";
import type { Library, ProjectState } from "../api";

const COL = { actor: "#a46bff", set: "#3fb978", shot: "#ffcc33" };

export const EpisodeCanvas: React.FC<{ pid: string; state: ProjectState; lib: Library; onStoryboard: (sb: Storyboard) => void }> = ({ pid, state, lib, onStoryboard }) => {
  const sb = state.storyboard;
  const [pos, setPos] = useState<Record<string, { x: number; y: number }>>({});
  useEffect(() => { fetch(`/api/projects/${pid}/canvas`).then((r) => r.json()).then((c) => setPos(c.nodes ?? {})).catch(() => {}); }, [pid]);
  const persist = useCallback((p: Record<string, { x: number; y: number }>) => {
    void fetch(`/api/projects/${pid}/canvas`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ nodes: p }) });
  }, [pid]);

  const built: Node[] = useMemo(() => {
    const n: Node[] = [];
    // chốt nối khai báo sẵn: dây vẽ được ngay cả khi trình duyệt chưa đo được nút
    const handles = [
      { type: "source" as const, position: Position.Right, x: 166, y: 20, width: 4, height: 4 },
      { type: "target" as const, position: Position.Left, x: 0, y: 20, width: 4, height: 4 },
    ];
    const style = (c: string) => ({ border: `2px solid ${c}`, background: "#141821", color: "#e7ebf3", borderRadius: 10, fontSize: 12, width: 170 });
    sb.cast.forEach((c, i) => n.push({ id: `actor:${c.id}`, position: pos[`actor:${c.id}`] ?? { x: 0, y: i * 70 }, data: { label: `${lib.cast[c.id]?.name ?? c.id} · ${c.mark}` }, style: style(COL.actor), width: 170, height: 44, handles, sourcePosition: "right" as never }));
    sb.sets.forEach((s, i) => n.push({ id: `set:${s.id}`, position: pos[`set:${s.id}`] ?? { x: 0, y: (sb.cast.length + i) * 70 + 40 }, data: { label: lib.sets[s.id]?.name ?? s.id }, style: style(COL.set), width: 170, height: 44, handles, sourcePosition: "right" as never }));
    sb.shots.forEach((s, i) => n.push({ id: `shot:${s.id}`, position: pos[`shot:${s.id}`] ?? { x: 360, y: i * 90 }, data: { label: `${s.id} · ${s.camera.preset}${s.summary ? ` · ${s.summary}` : ""}` }, style: style(COL.shot), width: 170, height: 44, handles, targetPosition: "left" as never }));
    return n;
  }, [sb, pos, lib]);

  // React Flow cần giữ trạng thái nút (kích thước đo được, đang kéo...) giữa các lần vẽ
  const [nodes, setNodes] = useState<Node[]>([]);
  useEffect(() => {
    setNodes((old) => built.map((b) => { const o = old.find((x) => x.id === b.id); return o ? { ...o, data: b.data, style: b.style, position: pos[b.id] ?? o.position } : b; }));
  }, [built]);

  const edges: Edge[] = useMemo(() => {
    const e: Edge[] = [];
    for (const s of sb.shots) {
      for (const a of new Set([...Object.keys(s.actors ?? {}), ...(s.subjects ?? [])])) e.push({ id: `e:${a}:${s.id}`, source: `actor:${a}`, target: `shot:${s.id}`, style: { stroke: COL.actor } });
      e.push({ id: `s:${s.set}:${s.id}`, source: `set:${s.set}`, target: `shot:${s.id}`, style: { stroke: COL.set }, deletable: false });
    }
    return e;
  }, [sb]);

  const onNodesChange: OnNodesChange = (changes) => {
    const ch = changes.toArray();
    setNodes((n) => changes.applyTo(n));
    const ended = ch.filter((c) => c.type === "position" && !c.dragging);
    if (ended.length) {
      const next = { ...pos };
      for (const n of nodes) next[n.id] = n.position;
      for (const c of ch) if (c.type === "position" && c.position) next[c.id] = c.position;
      setPos(next);
      persist(next);
    }
  };
  /** Nối dây = sửa storyboard thật (cùng API với thẻ cảnh ở tab Đạo diễn). */
  const onConnect = (c: Connection) => {
    const [kind, id] = (c.source ?? "").split(":");
    const shotId = (c.target ?? "").split(":")[1];
    const next = structuredClone(sb);
    const shot = next.shots.find((s) => s.id === shotId);
    if (!shot) return;
    if (kind === "actor") shot.actors = { ...(shot.actors ?? {}), [id]: shot.actors?.[id] ?? { expr: [{ t: shot.t0, e: "innocent_dot" }] } };
    else if (kind === "set") shot.set = id;
    onStoryboard(next);
  };
  const onEdgesChange: OnEdgesChange = (changes) => {
    const removed = changes.toArray().filter((c) => c.type === "remove").map((c) => c.id).filter((id) => id.startsWith("e:"));
    if (!removed.length) return;
    const next = structuredClone(sb);
    for (const id of removed) {
      const [, a, shotId] = id.split(":");
      const shot = next.shots.find((s) => s.id === shotId);
      if (!shot) continue;
      if (shot.actors) delete shot.actors[a];
      shot.subjects = (shot.subjects ?? []).filter((x) => x !== a);
    }
    onStoryboard(next);
  };

  return (
    <div className="card h-[640px] overflow-hidden">
      <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
        className="dark" fitView onlyRenderVisibleElements>
        <Background gap={18} />
        <MiniMap pannable zoomable />
        <Controls />
      </ReactFlow>
    </div>
  );
};
