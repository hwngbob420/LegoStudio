// Lát timeline theo block (5B): cắt dải khung [f0, f1] ra một timeline độc lập bắt đầu từ khung 1.
// Dùng cho: Player xem riêng một block, và mã băm quyết định block nào phải render lại (cùng mã băm = cùng hình).
// Chạy được cả trong trình duyệt (Studio), nên dùng SHA-256 viết bằng TS thuần, không dùng node:crypto.
import type { BakedTimeline } from "@lse/shared";

const r5 = (x: number) => Math.round(x * 1e5) / 1e5;
/** Gạch đã hiện từ lâu / sẽ hiện sau block: kẹp lại để giá trị không phụ thuộc block khác (hoạt cảnh rơi chỉ dài 2 khung). */
const PAST = -2;

export function sliceTimeline(T: BakedTimeline, f0: number, f1: number): BakedTimeline {
  const n = f1 - f0 + 1;
  const reb = (f: number) => f - f0 + 1;
  const t0 = (f0 - 1) / T.fps;
  const actors: BakedTimeline["actors"] = {};
  for (const [id, a] of Object.entries(T.actors)) {
    actors[id] = {
      ...a,
      root: a.root.slice(f0 - 1, f1),
      joints: Object.fromEntries(Object.entries(a.joints).map(([b, arr]) => [b, arr.slice(f0 - 1, f1)])),
      face: a.face.slice(f0 - 1, f1),
    };
  }
  const shots = T.shots.filter((s) => s.f1 >= f0 && s.f0 <= f1).map((s) => {
    const a = Math.max(s.f0, f0), b = Math.min(s.f1, f1);
    return { ...s, f0: reb(a), f1: reb(b), keys: s.keys.slice(a - s.f0, b - s.f0 + 1) };
  });
  const assembly = T.assembly.map((e) => ({
    ...e, show: Object.fromEntries(Object.entries(e.show).map(([k, v]) => [k, Math.min(n + 1, Math.max(PAST, reb(v)))])),
  }));
  const fx = T.fx.filter((e) => e.f1 >= f0 && e.f0 <= f1).map((e) => ({ ...e, f0: Math.max(PAST, reb(e.f0)), f1: Math.min(n + 1, reb(e.f1)) }));
  const tEnd = f1 / T.fps;
  const sfx = T.sfx.filter((e) => e.t >= t0 - 1e-9 && e.t < tEnd - 1e-9).map((e) => ({ ...e, t: r5(e.t - t0) }));
  const qa = T.qa
    .map((q) => ({ ...q, key_f: reb(q.key_f), samples: q.samples.filter((s) => s.f >= f0 && s.f <= f1).map((s) => ({ ...s, f: reb(s.f), t: r5((reb(s.f) - 1) / T.fps) })) }))
    .filter((q) => q.samples.length);
  const out: BakedTimeline = { ...T, frames: n, duration: r5(n / T.fps), actors, shots, assembly, fx, sfx, qa };
  delete out.blocks;
  return out;
}

/** Mã băm nội dung lát [f0, f1]: bỏ tên tập và đánh số lại ID cảnh (ID cảnh đổi khi block khác thêm/bớt cảnh). */
export function sliceHash(T: BakedTimeline, f0: number, f1: number): string {
  const s = sliceTimeline(T, f0, f1);
  const ids = new Map(s.shots.map((x, i) => [x.id, `s${i}`]));
  const norm = {
    ...s, episode: "",
    shots: s.shots.map((x) => ({ ...x, id: ids.get(x.id) })),
    fx: s.fx.map((x) => ({ ...x, shot: ids.get(x.shot) ?? "" })),
    qa: s.qa.map((x) => ({ ...x, shot: ids.get(x.shot) ?? "" })),
  };
  return sha256Hex(stableJson(norm)).slice(0, 16);
}

/** JSON với khoá sắp xếp (thứ tự khoá không ảnh hưởng mã băm). */
export function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

// ---------------------------------------------------------------- SHA-256 (FIPS 180-4), TS thuần
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export function sha256Hex(text: string): string {
  const msg = new TextEncoder().encode(text);
  const len = msg.length;
  const total = Math.ceil((len + 9) / 64) * 64;
  const buf = new Uint8Array(total);
  buf.set(msg);
  buf[len] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(total - 8, Math.floor(len / 0x20000000), false);
  dv.setUint32(total - 4, (len << 3) >>> 0, false);
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
  }
  return Array.from(h, (x) => x.toString(16).padStart(8, "0")).join("");
}
