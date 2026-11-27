// Ngẫu nhiên tất định: cùng hạt giống luôn cho cùng dãy số (không dùng Math.random).

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/**
 * Nhiễu chậm tất định (value noise): nút ngẫu nhiên chuẩn N(0,1) cách nhau `every` khung, nội suy cosin giữa các nút.
 * Dùng cho rung tay máy quay và "boil" khớp: lệch từ khung này sang khung kế rất nhỏ (không giật), vẫn ghi thành
 * khoá CONSTANT 12 hình/giây như stop-motion. Trả `n` giá trị, phần tử i là khung i (tính từ 0).
 */
export function smoothNoise(rng: Rng, n: number, every: number): number[] {
  const step = Math.max(1, every);
  const knots = Array.from({ length: Math.ceil(n / step) + 2 }, () => rng.gauss(0, 1));
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const k = Math.floor(i / step), u = (i % step) / step;
    const w = (1 - Math.cos(Math.PI * u)) / 2;
    out.push(knots[k] * (1 - w) + knots[k + 1] * w);
  }
  return out;
}

/** CRC32 giống zlib.crc32 của Python (dùng làm hạt giống theo ID). */
export function crc32(s: string): number {
  const bytes = new TextEncoder().encode(s);
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export class Rng {
  private s: number;
  private spare: number | null = null;

  constructor(seed: number) {
    this.s = (seed >>> 0) || 0x9e3779b9;
  }

  /** mulberry32, [0, 1) */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  uniform(a: number, b: number): number {
    return a + (b - a) * this.next();
  }

  /** Phân phối chuẩn (Box-Muller). */
  gauss(mu: number, sigma: number): number {
    if (this.spare !== null) {
      const v = this.spare;
      this.spare = null;
      return mu + sigma * v;
    }
    let u = 0;
    while (u <= 1e-12) u = this.next();
    const v = this.next();
    const r = Math.sqrt(-2 * Math.log(u));
    this.spare = r * Math.sin(2 * Math.PI * v);
    return mu + sigma * r * Math.cos(2 * Math.PI * v);
  }
}
