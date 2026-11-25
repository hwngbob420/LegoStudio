// Tab 2 — Xưởng: ráp minifig xem 3D, kho 2 tầng (Lưu sang kho kênh), bộ set + mốc đứng, sơ đồ tập dạng nút.
import React, { useEffect, useMemo, useState } from "react";
import { Lock, UserPlus, Save, ArrowUpFromLine, Hammer, Network, Users, Dice5 } from "lucide-react";
import { CastRecipe, EXPRESSIONS, type Storyboard } from "@lse/shared";
import { api, type Library, type ProjectState } from "../api";
import { Field, Select } from "../components/Fields";
import { MinifigViewer } from "../components/MinifigViewer";
import { JobButton } from "../components/jobs";
import { EpisodeCanvas } from "../components/EpisodeCanvas";

const HAIR = ["messy", "ponytail", "bun", "short_crop", "bob", "cap", "bald"] as const;
const PRINTS = ["hoodie", "blazer", "apron", "cardigan", "tee_star"] as const;
const DETAILS = ["blush", "freckles", "beard", "wrinkles", "lashes"] as const;
const ACCS = ["glasses_round", "glasses_square"] as const;
const SKINS = ["yellow_classic", "skin_light", "skin_light_warm", "skin_medium", "skin_medium_brown", "skin_deep_brown"];
const VOICES = ["Microsoft David Desktop", "Microsoft Zira Desktop"];
const VI: Record<string, string> = { messy: "Rối dựng", ponytail: "Đuôi ngựa", bun: "Búi", short_crop: "Cắt ngắn", bob: "Ngang vai", cap: "Mũ lưỡi trai", bald: "Hói",
  hoodie: "Áo hoodie", blazer: "Vest", apron: "Tạp dề", cardigan: "Cardigan", tee_star: "Áo phông ngôi sao",
  blush: "Má hồng", freckles: "Tàn nhang", beard: "Râu", wrinkles: "Nếp nhăn", lashes: "Mi dài", glasses_round: "Kính tròn", glasses_square: "Kính vuông" };

/** Vai quần chúng ngẫu nhiên nhưng lặp lại được (hạt giống = số thứ tự). */
function randomExtra(seed: number, palette: Record<string, string>) {
  let s = seed * 2654435761 >>> 0;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)];
  const cloth = Object.keys(palette).filter((k) => !k.startsWith("skin") && !k.startsWith("hair") && !k.startsWith("trans") && k !== "screen_glow");
  const skin = pick(SKINS);
  return { id: `extra_${String(seed).padStart(3, "0")}`, name: `Vai phụ ${seed}`, vibe: "Quần chúng", age: "", skin,
    hair: { style: pick(HAIR), color: pick(["hair_brown", "hair_black", "hair_grey", "hair_blonde", "hair_red"]) },
    torso: { color: pick(cloth), print: pick(PRINTS), print_color: pick(["white", "cream", "tan", "black"]) },
    arms: "", hands: skin, hips: pick(cloth), legs: "", accessories: r() < 0.3 ? [pick(ACCS)] : [], face_details: r() < 0.4 ? [pick(DETAILS)] : [],
    default_expression: pick(["innocent_dot", "happy_closed", "deadpan_tired", "smug_smirk"]),
    voice: { sapi: pick(VOICES), rate: 0, pitch_semitones: Math.round((r() * 6 - 3) * 2) / 2 } };
}

export const WorkshopTab: React.FC<{ pid: string; state: ProjectState; lib: Library; onStoryboard: (sb: Storyboard) => void; onReload: () => void }> = ({ pid, state, lib, onStoryboard, onReload }) => {
  const [view, setView] = useState<"cast" | "canvas">("cast");
  const ids = Object.keys(lib.cast);
  const [sel, setSel] = useState(ids[0]);
  const [draft, setDraft] = useState<any>(lib.cast[ids[0]]);
  const [msg, setMsg] = useState<string | null>(null);
  const [expr, setExpr] = useState<string | undefined>();
  useEffect(() => { if (lib.cast[sel]) setDraft(structuredClone(lib.cast[sel])); }, [sel, lib]);
  const tier = lib.castTier[draft?.id];
  const baked = !!lib.manifest?.cast?.[draft?.id] && tier !== undefined && JSON.stringify(lib.cast[draft.id]) === JSON.stringify(draft);
  const valid = useMemo(() => CastRecipe.safeParse({ ...draft, arms: draft?.arms || draft?.torso?.color, legs: draft?.legs || draft?.hips }), [draft]);
  const set = (patch: any) => setDraft((d: any) => ({ ...d, ...patch }));
  const inEpisode = state.storyboard.cast.some((c) => c.id === draft?.id);
  const colorKeys = Object.keys(lib.palette);

  const save = async () => {
    if (!valid.success) { setMsg(valid.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")); return; }
    try {
      await api.saveCast(valid.data, tier === "channel" ? undefined : pid);
      setMsg(`Đã lưu "${valid.data.name}" ${tier === "channel" ? "vào kho kênh" : "vào kho riêng của tập"}. Bấm "Nướng kho" để có hình in áo, mặt và .glb thật (khoảng 1–2 phút).`);
      setSel(valid.data.id); onReload();
    } catch (e) { setMsg((e as Error).message); }
  };
  const promote = async () => {
    try { await api.promote(pid, draft.id); setMsg(`Đã chuyển "${draft.name}" sang kho kênh: mọi tập đều dùng được.`); onReload(); } catch (e) { setMsg((e as Error).message); }
  };
  const addToEpisode = (setId: string, mark: string) => {
    const sb = structuredClone(state.storyboard);
    if (!sb.sets.some((s) => s.id === setId)) sb.sets.push({ id: setId, lighting: lib.sets[setId].lighting });
    sb.cast.push({ id: draft.id, set: setId, mark });
    onStoryboard(sb);
    setMsg(`Đã thêm ${draft.name} vào tập ở mốc "${mark}". Sang tab Đạo diễn để cho nhân vật diễn.`);
  };

  if (view === "canvas") return (
    <div className="space-y-3">
      <div className="flex gap-2"><button className="btn" onClick={() => setView("cast")}><Users className="h-4 w-4" /> Ráp diễn viên</button><span className="self-center text-sm text-ink-300">Kéo dây từ Diễn viên sang Cảnh để thêm vào cảnh; chọn dây và bấm Delete để gỡ.</span></div>
      <EpisodeCanvas pid={pid} state={state} lib={lib} onStoryboard={onStoryboard} />
    </div>
  );

  return (
    <div className="grid grid-cols-[260px_minmax(0,1fr)_340px] gap-4">
      <section className="card space-y-2 p-3">
        <div className="flex items-center gap-2"><div className="font-bold">Diễn viên</div>
          <button className="btn ml-auto !px-2" title="Sơ đồ tập" onClick={() => setView("canvas")}><Network className="h-4 w-4" /></button></div>
        <ul className="space-y-1">
          {ids.map((id) => (
            <li key={id}><button onClick={() => setSel(id)} className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-sm ${sel === id ? "border-stud bg-ink-800" : "border-ink-700"}`}>
              <span className="h-4 w-4 rounded-full border border-ink-500" style={{ background: lib.palette[lib.cast[id].skin] }} />
              <span className="flex-1">{lib.cast[id].name}</span>
              {lib.castTier[id] === "channel" ? <span title="Kho kênh"><Lock className="h-3.5 w-3.5 text-ink-500" /></span> : <span className="rounded bg-stud/20 px-1 text-[10px] text-stud">Riêng tập</span>}
            </button></li>
          ))}
        </ul>
        <div className="flex gap-2 pt-2">
          <button className="btn flex-1" onClick={() => { const r = structuredClone(lib.cast.classic_yellow ?? lib.cast[ids[0]]); r.id = `fig_${ids.length + 1}`; r.name = "Nhân vật mới"; setDraft(r); setSel(""); }}><UserPlus className="h-4 w-4" /> Mới</button>
          <button className="btn flex-1" title="Vai quần chúng ngẫu nhiên (lặp lại được)" onClick={() => { const n = ids.filter((i) => i.startsWith("extra_")).length + 1; const r = randomExtra(n, lib.palette); r.arms = r.torso.color; r.legs = r.hips; setDraft(r); setSel(""); }}><Dice5 className="h-4 w-4" /> Quần chúng</button>
        </div>
        <div className="border-t border-ink-700 pt-2"><JobButton kind="library" label="Nướng kho (hình in, .glb)" icon={<Hammer className="h-4 w-4" />} /></div>
      </section>

      <section className="card grid grid-rows-[1fr_auto] overflow-hidden">
        <div className="relative min-h-[420px] bg-gradient-to-b from-ink-800 to-ink-950">
          {draft ? <MinifigViewer recipe={{ ...draft, arms: draft.arms || draft.torso.color, legs: draft.legs || draft.hips }} palette={lib.palette} faceSpec={lib.faceSpec} baked={baked} expression={expr} /> : null}
          <div className="absolute left-3 top-3 rounded bg-ink-950/70 px-2 py-1 text-xs text-ink-300">{baked ? "Bản nướng thật" : "Xem nhanh (ráp tạm từ bộ mảnh)"} · kéo để xoay</div>
        </div>
        <div className="flex flex-wrap gap-1 border-t border-ink-700 p-2">
          {EXPRESSIONS.filter((e) => e !== "blink").map((e) => <button key={e} className={`rounded px-2 py-0.5 text-xs ${expr === e ? "bg-stud text-ink-950" : "bg-ink-800"}`} onClick={() => setExpr(e === expr ? undefined : e)}>{e}</button>)}
        </div>
      </section>

      <section className="card space-y-2 p-3">
        {draft ? (<>
          <div className="grid grid-cols-2 gap-2">
            <Field label="ID"><input className="field font-mono" value={draft.id} onChange={(e) => set({ id: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} disabled={tier === "channel"} /></Field>
            <Field label="Tên"><input className="field" value={draft.name} onChange={(e) => set({ name: e.target.value })} /></Field>
          </div>
          <Field label="Tính cách / mong muốn hài"><input className="field" value={draft.vibe} onChange={(e) => set({ vibe: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Màu da"><Select value={draft.skin} options={SKINS} onChange={(v) => set({ skin: v, hands: v })} /></Field>
            <Field label="Biểu cảm mặc định"><Select value={draft.default_expression} options={EXPRESSIONS} onChange={(v) => set({ default_expression: v })} /></Field>
            <Field label="Kiểu tóc"><Select value={draft.hair.style} options={HAIR} labels={VI} onChange={(v) => set({ hair: { ...draft.hair, style: v } })} /></Field>
            <Field label="Màu tóc"><Select value={draft.hair.color} options={colorKeys} onChange={(v) => set({ hair: { ...draft.hair, color: v } })} /></Field>
            <Field label="Áo"><Select value={draft.torso.print} options={PRINTS} labels={VI} onChange={(v) => set({ torso: { ...draft.torso, print: v } })} /></Field>
            <Field label="Màu áo"><Select value={draft.torso.color} options={colorKeys} onChange={(v) => set({ torso: { ...draft.torso, color: v }, arms: v })} /></Field>
            <Field label="Màu hình in"><Select value={draft.torso.print_color} options={colorKeys} onChange={(v) => set({ torso: { ...draft.torso, print_color: v } })} /></Field>
            <Field label="Màu quần"><Select value={draft.legs} options={colorKeys} onChange={(v) => set({ legs: v, hips: v })} /></Field>
          </div>
          <Field label="Phụ kiện & chi tiết mặt">
            <div className="flex flex-wrap gap-1">
              {[...ACCS, ...DETAILS].map((k) => {
                const isAcc = (ACCS as readonly string[]).includes(k);
                const list: string[] = isAcc ? draft.accessories : draft.face_details;
                const on = list.includes(k);
                return <button key={k} className={`rounded border px-2 py-0.5 text-xs ${on ? "border-stud bg-stud/15" : "border-ink-700"}`}
                  onClick={() => set(isAcc ? { accessories: on ? list.filter((x) => x !== k) : [...list.filter((x) => !(ACCS as readonly string[]).includes(x)), k] } : { face_details: on ? list.filter((x) => x !== k) : [...list, k] })}>{VI[k]}</button>;
              })}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Giọng"><Select value={draft.voice.sapi} options={VOICES} onChange={(v) => set({ voice: { ...draft.voice, sapi: v } })} /></Field>
            <Field label={`Cao độ (${draft.voice.pitch_semitones ?? 0})`}><input type="range" min={-5} max={4} step={0.5} value={draft.voice.pitch_semitones ?? 0} className="w-full" onChange={(e) => set({ voice: { ...draft.voice, pitch_semitones: Number(e.target.value) } })} /></Field>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <button className="btn-primary" onClick={save}><Save className="h-4 w-4" /> Lưu</button>
            {tier && tier !== "channel" ? <button className="btn" onClick={promote}><ArrowUpFromLine className="h-4 w-4" /> Lưu sang kho kênh</button> : null}
          </div>
          {!inEpisode && tier ? (
            <div className="border-t border-ink-700 pt-2">
              <div className="label">Thêm vào tập ở mốc</div>
              {Object.values(lib.sets).map((s) => (
                <div key={s.id} className="mb-1 text-xs"><span className="text-ink-300">{s.name}:</span>{" "}
                  {s.anchors.map((a) => <button key={a} className="mr-1 rounded bg-ink-800 px-1.5 py-0.5 hover:bg-ink-700" onClick={() => addToEpisode(s.id, a)}>{a}</button>)}
                </div>
              ))}
            </div>
          ) : inEpisode ? <div className="text-xs text-ok">Đang có trong tập này.</div> : null}
          {msg ? <div className="rounded border border-ink-700 bg-ink-950 p-2 text-xs text-ink-300">{msg}</div> : null}
        </>) : null}
      </section>
    </div>
  );
};
