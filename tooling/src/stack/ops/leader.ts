// The dev leader body: publish the launch env, rotate the logs, keep the record beating, and run the one
// leader body `pnpm dev` runs (the dev tool). Detached under `up`, in this terminal under `up-fg`.
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import process from "node:process";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { processGroupId } from "../../_shared/platform.ts";
import { exportProcessEnv } from "../../_shared/process-env.ts";
import { runDev } from "../../dev/index.ts";
import type { LeaderRecord, StackContext } from "../contract/types.ts";
import { HEARTBEAT_MS, LAUNCH_ID_ENV, readLeaderRecord, removeLeaderRecord, writeLeaderRecord } from "../lib/leader-record.ts";
import { printablePins } from "../lib/stack-plan.ts";

refuseDirectInvocation(import.meta.url, "pnpm stack up");

/** Rotate, never truncate: the reason you restarted is always in the run you just ended, so one
 *  generation back survives. */
export function rotateLog(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path) && statSync(path).size > 0) {
    renameSync(path, `${path}.1`);
  }
  writeFileSync(path, "");
}

/** Publish the launch env into this process before the server env loads: the dev tool reads it there. */
function publishLaunchEnv(ctx: StackContext, overlay: Readonly<Record<string, string>>): void {
  for (const [key, value] of Object.entries({ ...ctx.launchEnv, ...overlay })) {
    exportProcessEnv(key, value);
  }
}

/** Run the leader body. With `record`, the record is written before the first spawn and rewritten on every
 *  heartbeat and every child spawn; it is removed on exit while it is still this leader's own. */
export async function runLeader(ctx: StackContext, opts: { readonly record: boolean; readonly overlay?: Readonly<Record<string, string>> }): Promise<number> {
  publishLaunchEnv(ctx, opts.overlay ?? {});
  mkdirSync(ctx.runDir, { recursive: true });
  rotateLog(ctx.logs.server);
  rotateLog(ctx.logs.client);
  const children: number[] = [];
  const startedAt = new Date().toISOString();
  const launchId = ctx.ambient[LAUNCH_ID_ENV] ?? randomUUID();
  const record = (): LeaderRecord => ({
    version: 2,
    pid: process.pid,
    pgid: processGroupId(process.pid),
    launchId,
    repoRoot: ctx.repoRoot,
    runDir: ctx.runDir,
    ports: ctx.ports,
    children: [...children],
    pins: { values: printablePins(ctx.pins), sources: ctx.pins.sources },
    startedAt,
    beatMs: Date.now(),
  });
  let beat: NodeJS.Timeout | undefined;
  if (opts.record) {
    writeLeaderRecord(ctx.runDir, record());
    beat = setInterval(() => writeLeaderRecord(ctx.runDir, record()), HEARTBEAT_MS);
    beat.unref();
  }
  try {
    return await runDev([], {
      logs: { server: ctx.logs.server, client: ctx.logs.client },
      onChild: (_name, pid): void => {
        children.push(pid);
        if (opts.record) {
          writeLeaderRecord(ctx.runDir, record());
        }
      },
    });
  } finally {
    clearInterval(beat);
    if (opts.record) {
      const onDisk = readLeaderRecord(ctx.runDir, ctx.repoRoot);
      // Only this leader's own record: a later launch's record under the same run dir is not ours to delete.
      if (onDisk.kind === "record" && onDisk.record.pid === process.pid) {
        removeLeaderRecord(ctx.runDir);
      }
    }
  }
}
