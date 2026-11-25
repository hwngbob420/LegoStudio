// Ghi JSON an toàn (chép từ pixel-story-engine): kiểm schema, ghi file tạm rồi đổi tên; gom ghi liên tiếp (auto-save).
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ZodType } from "zod";

export async function writeJsonAtomic<T>(file: string, schema: ZodType<T>, value: unknown, pretty = true): Promise<T> {
  const parsed = schema.parse(value);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, (pretty ? JSON.stringify(parsed, null, 2) : JSON.stringify(parsed)) + "\n", "utf8");
  // Windows đôi khi khóa tệp đích vài chục ms (diệt virus, lập chỉ mục): thử lại ngắn thay vì báo lỗi ngay.
  for (let attempt = 0; ; attempt++) {
    try { await fs.rename(tmp, file); break; } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if ((code !== "EPERM" && code !== "EBUSY" && code !== "EACCES") || attempt >= 6) throw err;
      await new Promise((r) => setTimeout(r, 60 * (attempt + 1)));
    }
  }
  return parsed;
}

export async function readJson<T>(file: string, schema: ZodType<T>): Promise<T> {
  return schema.parse(JSON.parse(await fs.readFile(file, "utf8")));
}

export function createDebouncedSaver<T>(save: (value: T) => Promise<void>, delayMs = 800) {
  let timer: NodeJS.Timeout | undefined;
  let pending: { value: T } | undefined;
  let running: Promise<void> = Promise.resolve();
  const run = () => {
    timer = undefined;
    if (!pending) return;
    const { value } = pending;
    pending = undefined;
    running = running.then(() => save(value));
  };
  return {
    push(value: T) {
      pending = { value };
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, delayMs);
    },
    async flush() {
      if (timer) clearTimeout(timer);
      run();
      await running;
    },
  };
}
