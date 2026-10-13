import { execFile } from "node:child_process";
import { access, constants } from "node:fs/promises";
import path from "node:path";

/**
 * 외부 도구 실행. 셸을 거치지 않고(execFile) 인자 배열로만 넘긴다.
 * 시간 제한을 넘기면 프로세스를 죽이고 실패로 돌려준다.
 */
export interface ToolResult {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export function runTool(
  file: string,
  args: string[],
  opts: { timeoutMs: number; cwd?: string; env?: NodeJS.ProcessEnv; maxBuffer?: number },
): Promise<ToolResult> {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      {
        timeout: opts.timeoutMs,
        killSignal: "SIGKILL",
        cwd: opts.cwd,
        env: opts.env ?? process.env,
        maxBuffer: opts.maxBuffer ?? 20 * 1024 * 1024,
        windowsHide: true,
        encoding: "utf8",
      },
      (err, stdout, stderr) => {
        const e = err as (NodeJS.ErrnoException & { killed?: boolean; code?: number | string }) | null;
        resolve({
          ok: !e,
          code: e ? (typeof e.code === "number" ? e.code : null) : 0,
          stdout: String(stdout ?? ""),
          stderr: String(stderr ?? "") || (e ? e.message : ""),
          timedOut: !!e?.killed,
        });
      },
    );
  });
}

const cache = new Map<string, Promise<string | null>>();

/** PATH 에서 실행 파일 위치를 찾는다(셸 `command -v` 대신). 없으면 null */
export function findTool(name: string): Promise<string | null> {
  if (path.isAbsolute(name)) {
    return access(name, constants.X_OK).then(() => name, () => null);
  }
  let p = cache.get(name);
  if (!p) {
    p = (async () => {
      for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
        if (!dir) continue;
        const candidate = path.join(dir, name);
        try {
          await access(candidate, constants.X_OK);
          return candidate;
        } catch {
          /* 다음 경로 */
        }
      }
      return null;
    })();
    cache.set(name, p);
  }
  return p;
}

/** 동시 실행 수 제한(세마포어) */
export class Limiter {
  private active = 0;
  private queue: (() => void)[] = [];
  constructor(private readonly max: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) await new Promise<void>((r) => this.queue.push(r));
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}
