import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const ID_PATTERN = /^[a-z0-9_]{2,60}$/;

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function assertValidId(id: string, label = "ID") {
  if (!ID_PATTERN.test(id)) throw new HttpError(400, `${label} không hợp lệ (chỉ chữ thường, số, gạch dưới): "${id}"`);
}

export interface WorkspacePaths {
  root: string;
  library: string;
  baked: string;
  projects: string;
  jobsFile: string;
  projectDir(id: string): string;
  episodeCast(id: string): string;
}

export function workspacePaths(root: string): WorkspacePaths {
  return {
    root,
    library: path.join(root, "channel_library"),
    baked: path.join(root, "channel_library", "baked"),
    projects: path.join(root, "projects"),
    jobsFile: path.join(root, "_jobs", "jobs.json"),
    projectDir: (id) => path.join(root, "projects", id),
    episodeCast: (id) => path.join(root, "projects", id, "assets", "cast"),
  };
}
