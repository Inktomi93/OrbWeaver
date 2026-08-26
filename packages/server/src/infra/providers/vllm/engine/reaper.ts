// Recovery for vLLM descendants left behind after a recorded setsid leader dies. Cmdline is only a cheap
// candidate filter. A durable launch record plus exact kernel process-group membership is the authority;
// missing, malformed, stale, or reused identity fails closed without a signal.

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { getLog } from "#foundation/observability";
import type { EngineLaunchIdentity } from "./process-identity.ts";
import { engineIdentityFilePath, readEngineIdentityFile, signalOrphanedEngineGroup } from "./process-identity.ts";

const FAMILY_MARKERS = ["EngineCore", "Worker_TP", "vllm serve"] as const;
const PS_ROW_RE = /^\s*(\d+)\s+(\d+)\s+(.*)$/;

export interface EngineFamilyProcessRow {
  readonly pid: number;
  readonly pgid: number;
  readonly args: string;
}

function presentIdentity(identity: EngineLaunchIdentity | undefined): identity is EngineLaunchIdentity {
  return identity !== undefined;
}

export function parseEngineFamilyProcessRows(psOutput: string): EngineFamilyProcessRow[] {
  const rows: EngineFamilyProcessRow[] = [];
  for (const line of psOutput.split("\n")) {
    const match = PS_ROW_RE.exec(line);
    if (match !== null) {
      rows.push({ pid: Number(match[1]), pgid: Number(match[2]), args: match[3] ?? "" });
    }
  }
  return rows;
}

/** Candidate survivors grouped only under a valid durable launch record. */
export function ownedOrphanCandidates(psOutput: string, repoRoot: string): Array<{ readonly pid: number; readonly pgid: number }> {
  const file = readEngineIdentityFile(repoRoot);
  if (file === null || file.repoRoot !== repoRoot) {
    return [];
  }
  const recordedGroups = new Set(
    Object.values(file.engines)
      .filter(presentIdentity)
      .map((identity) => identity.pgid),
  );
  return parseEngineFamilyProcessRows(psOutput)
    .filter((row) => recordedGroups.has(row.pgid) && row.pid !== row.pgid && FAMILY_MARKERS.some((marker) => row.args.includes(marker)))
    .map(({ pid, pgid }) => ({ pid, pgid }));
}

/** Signal each verified recorded orphan group at most once. Refusals are operator-visible and never kill. */
export async function reapOrphanedFamily(repoRoot: string): Promise<number[]> {
  const file = readEngineIdentityFile(repoRoot);
  if (file === null || file.repoRoot !== repoRoot) {
    const target = engineIdentityFilePath(repoRoot);
    if (existsSync(target)) {
      getLog().warn(
        { identityFile: target },
        "vllm-engines: malformed launch identity; refusing orphan cleanup until engines are relaunched or cleaned manually",
      );
    }
    return [];
  }
  const ps = await new Promise<string>((resolve) => {
    execFile("ps", ["-eo", "pid=,pgid=,args="], (error, stdout) => resolve(error ? "" : stdout));
  });
  const candidates = ownedOrphanCandidates(ps, repoRoot);
  const signaled: number[] = [];
  const attempted = new Set<number>();
  for (const candidate of candidates) {
    if (attempted.has(candidate.pgid)) {
      continue;
    }
    attempted.add(candidate.pgid);
    const identity = Object.values(file.engines)
      .filter(presentIdentity)
      .find((record) => record.pgid === candidate.pgid);
    if (identity === undefined) {
      continue;
    }
    const verdict = signalOrphanedEngineGroup(identity, candidate.pid, "SIGKILL");
    if (verdict.verdict === "signaled") {
      signaled.push(verdict.pgid);
    } else if (verdict.verdict === "refused") {
      getLog().warn(
        { engine: identity.engine, pgid: identity.pgid, reason: verdict.reason },
        "vllm-engines: refused ambiguous orphan cleanup; relaunch or clean the process manually",
      );
    }
  }
  return signaled;
}
