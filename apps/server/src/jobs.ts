// Hàng đợi việc nền: chạy LẦN LƯỢT từng việc nặng (Blender, Remotion, TTS) vì chỉ có một GPU.
// Trạng thái ghi ra workspace/_jobs/jobs.json để tắt app mở lại vẫn thấy lịch sử; việc đang chạy dở được đánh dấu "lỗi".
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export type JobStatus = "queued" | "running" | "done" | "error";
export interface Step { cmd: string; args: string[]; label: string }
export interface Job {
  id: string;
  project: string;
  kind: string;
  status: JobStatus;
  steps: Step[];
  stage?: string;
  progress?: number;
  log: string[];
  createdAt: string;
  startedAt?: string;
  endedAt?: string;
  error?: string;
}

/** Cách chạy một lệnh; test thay bằng bản giả. Trả mã thoát; gọi onLine cho từng dòng in ra. */
export type Runner = (step: Step, cwd: string, onLine: (line: string) => void) => Promise<number>;

export const spawnRunner: Runner = (step, cwd, onLine) =>
  new Promise((resolve) => {
    const p = spawn(step.cmd, step.args, { cwd, shell: process.platform === "win32", windowsHide: true });
    let buf = "";
    const feed = (d: Buffer) => {
      buf += d.toString("utf8");
      const parts = buf.split(/\r?\n/);
      buf = parts.pop() ?? "";
      parts.forEach((l) => l.trim() && onLine(l));
    };
    p.stdout.on("data", feed);
    p.stderr.on("data", feed);
    p.on("close", (code) => { if (buf.trim()) onLine(buf); resolve(code ?? 1); });
    p.on("error", (e) => { onLine(String(e)); resolve(1); });
  });

export class JobQueue {
  private jobs: Job[] = [];
  private running = false;
  private seq = 0;
  constructor(private file: string, private cwd: string, private runner: Runner = spawnRunner,
    private onDone?: (job: Job) => void | Promise<void>, private now: () => string = () => new Date().toISOString()) {
    if (existsSync(file)) {
      try {
        this.jobs = JSON.parse(readFileSync(file, "utf8")) as Job[];
        for (const j of this.jobs) if (j.status === "running" || j.status === "queued") { j.status = "error"; j.error = "App bị tắt khi việc đang chạy. Bấm chạy lại."; }
        this.seq = this.jobs.length;
      } catch { this.jobs = []; }
    }
  }

  list(project?: string) { return this.jobs.filter((j) => !project || j.project === project).slice(-50).reverse(); }
  get(id: string) { return this.jobs.find((j) => j.id === id); }

  enqueue(project: string, kind: string, steps: Step[]): Job {
    const job: Job = { id: `job${String(++this.seq).padStart(4, "0")}`, project, kind, status: "queued", steps, log: [], createdAt: this.now() };
    this.jobs.push(job);
    this.persist();
    void this.pump();
    return job;
  }

  /** Chờ tới khi hết việc (dùng trong test). */
  async idle() { while (this.running || this.jobs.some((j) => j.status === "queued")) await new Promise((r) => setTimeout(r, 10)); }

  private persist() {
    mkdirSync(path.dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.jobs.slice(-200), null, 1));
  }

  private async pump() {
    if (this.running) return;
    const job = this.jobs.find((j) => j.status === "queued");
    if (!job) return;
    this.running = true;
    job.status = "running";
    job.startedAt = this.now();
    this.persist();
    try {
      for (const step of job.steps) {
        job.stage = step.label;
        this.persist();
        const code = await this.runner(step, this.cwd, (line) => {
          job.log.push(line);
          if (job.log.length > 400) job.log.splice(0, job.log.length - 400);
          const st = /^== (\w+) ==/.exec(line);
          if (st) job.stage = st[1];
          const pr = /\[progress\]\s+\w+\s+(\d+)\/(\d+)/.exec(line);
          if (pr) job.progress = Number(pr[1]) / Number(pr[2]);
        });
        if (code !== 0) throw new Error(`Bước "${step.label}" lỗi (mã ${code}). Xem nhật ký.`);
      }
      job.status = "done";
      job.progress = 1;
    } catch (e) {
      job.status = "error";
      job.error = (e as Error).message;
    }
    job.endedAt = this.now();
    this.persist();
    try { await this.onDone?.(job); } catch { /* không để lỗi phụ làm treo hàng đợi */ }
    this.running = false;
    void this.pump();
  }
}
