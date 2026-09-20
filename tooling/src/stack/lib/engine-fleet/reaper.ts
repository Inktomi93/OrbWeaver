// A durable engine launch record proves only its recorded setsid leader. If that leader is absent, no
// descendant/survivor may inherit its authority from PGID, cwd, or argv. Recovery therefore reports the
// manual-cleanup requirement and never signals an orphaned group.

import { existsSync } from "node:fs";
import { warn as toolWarn } from "../../../_shared/log.ts";
import type { ObservedEngineProcess } from "./proc-observe.ts";
import { readObservedEngineProcess } from "./proc-observe.ts";
import { engineIdentityFilePath, readEngineIdentityFile, verifyEngineLaunchIdentity } from "./process-identity.ts";

/** Inspect only recorded leaders. Missing or changed leaders are operator-visible and never authorize survivor cleanup. */
export function reapOrphanedFamily(
  repoRoot: string,
  opts: {
    readonly readProcess?: (pid: number) => ObservedEngineProcess | null;
    readonly warn?: (fields: Record<string, unknown>, message: string) => void;
  } = {},
): Promise<number[]> {
  const warn = opts.warn ?? ((fields: Record<string, unknown>, message: string): void => toolWarn(`${message} ${JSON.stringify(fields)}`));
  const file = readEngineIdentityFile(repoRoot);
  if (file === null || file.repoRoot !== repoRoot) {
    const target = engineIdentityFilePath(repoRoot);
    if (existsSync(target)) {
      warn({ identityFile: target }, "vllm-engines: malformed launch identity; refusing orphan cleanup until engines are relaunched or cleaned manually");
    }
    return Promise.resolve([]);
  }
  const readProcess = opts.readProcess ?? readObservedEngineProcess;
  for (const identity of Object.values(file.engines)) {
    if (identity === undefined) {
      continue;
    }
    const leader = readProcess(identity.pid);
    if (leader === null) {
      warn(
        { engine: identity.engine, pgid: identity.pgid },
        "vllm-engines: recorded leader is absent; refusing survivor cleanup because PGID/cwd/argv do not prove ownership; relaunch or clean manually",
      );
      continue;
    }
    const verdict = verifyEngineLaunchIdentity(identity, leader, {
      engine: identity.engine,
      port: identity.port,
      repoRoot: identity.repoRoot,
      listenerPid: identity.pid,
    });
    if (verdict.verdict === "refused") {
      warn(
        { engine: identity.engine, pgid: identity.pgid, reason: verdict.reason },
        "vllm-engines: launch identity is stale or reused; refusing cleanup; relaunch or clean the process manually",
      );
    }
  }
  return Promise.resolve([]);
}
