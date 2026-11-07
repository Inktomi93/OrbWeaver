// `pnpm test:mutation <file...>`: argument checks, the slot, the Stryker run and the summary. Nothing else.
import { rmSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { print } from "../../floor/artifacts/artifacts.ts";
import { refuseDirectInvocation } from "../../floor/cli/entrypoint.ts";
import { EXIT } from "../../floor/cli/exit-contract.ts";
import { readStageBudgets } from "../../floor/host/concurrency-profile.ts";
import type { HostSlotPool } from "../../floor/host/host-slots.ts";
import { acquireHostSlot } from "../../floor/host/host-slots.ts";
import type { ChildExit, FullPriorityChild } from "../../floor/process/proc.ts";
import { captureProcessGroup, spawnFullPriorityChild } from "../../floor/process/proc.ts";
import { inheritedProcessEnv } from "../../floor/process/process-env.ts";
import { escalateStop } from "../../floor/process/stop-escalation.ts";
import { MUTATION_REPORT_JSON, MUTATION_WORLD_ENV, STRYKER_TEMP_DIR } from "../../floor/testing/stryker-config.ts";
import { instrumentError, printVerdict } from "../../floor/verdict/evidence.ts";
import { aridCensus, readStrykerMutants } from "../../mutation-arid/index.ts";
import { homeFiles, NativeWorld, packageWorlds } from "../../unwired/index.ts";
import type { MutationPlan } from "../lib/named-files.ts";
import { planMutationRun } from "../lib/named-files.ts";
import { countStatuses, exitForCounts, NOT_MEASURED_NOTE, SURVIVOR_NOTE, testedCount, ZERO_KILLED_READINGS } from "../lib/summary.ts";
import { worldOf } from "../lib/world.ts";

refuseDirectInvocation(import.meta.url, "pnpm test:mutation <file...>");

const STOP_SIGNALS = ["SIGINT", "SIGTERM"] as const;

/** Box-wide, not per checkout: each run copies the dependency store, so sandboxes cost disk across lanes. */
function mutationSlotPool(): HostSlotPool {
  return { name: "mutation", label: "pnpm test:mutation", slots: 1, waitBaseMs: readStageBudgets().defaultMs };
}

// A signal stops the whole group before `runMutation`'s `finally` releases the slot and removes the sandbox: a worker
// still running would hold neither, and the next run would delete the sandbox under it. Repeat signals join the first stop.
async function stopOnSignal(child: FullPriorityChild, pid: number): Promise<ChildExit> {
  let stopping: Promise<boolean> | undefined;
  const stop = (): void => {
    if (stopping !== undefined) {
      return;
    }
    print("stopping the mutation run");
    const group = captureProcessGroup(pid);
    stopping = escalateStop({ signal: group.signal, gone: () => !group.alive() });
    // Observed here because `child.wait()` may still be pending when it rejects; the await below receives the rejection.
    stopping.catch(() => undefined);
  };
  for (const signal of STOP_SIGNALS) {
    process.on(signal, stop);
  }
  try {
    const exit = await child.wait();
    if (stopping !== undefined && !(await stopping)) {
      throw new Error(`the stryker process group ${String(pid)} outlived TERM and KILL`);
    }
    return exit;
  } finally {
    for (const signal of STOP_SIGNALS) {
      process.off(signal, stop);
    }
  }
}

// The package script's launcher lowered this process's priority, and this child inherits it.
async function runStryker({ files, tests }: MutationPlan, world: string): Promise<number | null> {
  const args = ["run", "stryker.config.ts", "--mutate", files.join(","), "--testFiles", tests.join(",")];
  const env = inheritedProcessEnv({ [MUTATION_WORLD_ENV]: world });
  const child = spawnFullPriorityChild("stryker", args, { stdio: "inherit", env, detached: true });
  const exit = child.pid === undefined ? await child.wait() : await stopOnSignal(child, child.pid);
  if (exit.error !== undefined) {
    throw exit.error;
  }
  return exit.code;
}

function summarize(root: string, files: readonly string[]): number {
  const reportPath = join(root, MUTATION_REPORT_JSON);
  const counts = countStatuses(readStrykerMutants(reportPath));
  const tested = testedCount(counts);
  if (tested > 0) {
    for (const { reason, count } of aridCensus(reportPath).byReason) {
      print(`ignored ${String(count)}: ${reason}`);
    }
  }
  if (counts.Survived + counts.NoCoverage > 0) {
    print(SURVIVOR_NOTE);
  }
  if (counts.NotMeasured > 0) {
    print(NOT_MEASURED_NOTE);
  }
  const verdict = exitForCounts(counts);
  if (verdict === EXIT.violations && tested > 0) {
    print(ZERO_KILLED_READINGS.join("\n"));
  }
  return printVerdict("mutation-run", {
    verdict,
    denominators: { tested: { value: tested, refuseWhen: "zero" } },
    pairs: [["files", files.length], ...Object.entries(counts), ["report", MUTATION_REPORT_JSON]],
  });
}

export async function runMutation(args: readonly string[]): Promise<number> {
  const root = process.cwd();
  const plan = planMutationRun(args, root);
  const worlds = packageWorlds(root);
  const world = worldOf(plan.files, homeFiles(worlds, NativeWorld.fileLists(root, worlds)));
  const lease = await acquireHostSlot(mutationSlotPool(), {
    onQueued: (holder) => print(`waiting for the mutation slot, held by pid ${String(holder.pid)}`),
  });
  const sandbox = join(root, STRYKER_TEMP_DIR);
  try {
    // A killed run leaves both behind, and a stale report must never be read as this run's result.
    rmSync(sandbox, { recursive: true, force: true });
    rmSync(join(root, MUTATION_REPORT_JSON), { force: true });
    const code = await runStryker(plan, world);
    if (code !== EXIT.clean) {
      return instrumentError({ evidence: "a finished Stryker run", detail: `stryker exited ${String(code)}; read its output above` });
    }
    return summarize(root, plan.files);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
    lease.release();
  }
}
