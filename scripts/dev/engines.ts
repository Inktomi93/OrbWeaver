#!/usr/bin/env tsx
/**
 * engines — the long-lived vLLM engine OWNER (the dev adoption seam), TS half of what used to be
 * scripts/dev/engines.sh + scripts/dev/vllm-engine.sh.
 *
 *   pnpm engines            (or bash scripts/dev/engines.sh, which now execs this)
 *
 * Dev tooling (throwaway launcher; global KISS applies — NOT the architecture). It boots the three loopback
 * engines SEQUENTIALLY and stays in the foreground OWNING them, OUTSIDE the tsx-watch server loop, so a
 * `pnpm dev` restart ADOPTS the already-warm ports instead of cold-respawning them (~1-2 min each save).
 * The in-server adoptive supervisor adopts these; on an admin "restart to apply" it takes over the one
 * engine it bounces. This launcher NEVER owns the watched process's engines — the HMR-topology INVARIANT.
 *
 * THE SHARED BUILDER: the serve argv comes from the SAME buildEngineSpawnSpec the in-server supervisor uses
 * (imported, never duplicated) — the two owners can never drift. This launcher resolves launch config from
 * the ENV FLOOR (resolveEngineLaunchConfig with no override) — it deliberately does NOT read the DB (that
 * would race the first-boot DB wipe and reach across the package boundary). An admin's AppSettings launch
 * override applies through the "restart to apply" flow: the IN-SERVER supervisor owns the engine it bounces
 * and rebuilds its argv from the LIVE effective config (admin ⊕ env floor). STORE_ROOT worktree-derivation
 * rides through buildEngineSpawnSpec (git-common-dir).
 *
 * SEQUENTIAL BOOT: vLLM's memory profiler reads device-wide free-memory deltas, so two engines must never
 * profile at once (concurrent boots gave embed a NEGATIVE KV budget → death). Each finishes before the next;
 * a /health timeout is non-fatal (later engines still get their turn).
 */
import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import process from "node:process";
import { engineDeploymentEnv, engineLaunchEnvFloor, env, processEnvSnapshot } from "@orb/server/foundation/env";
import type { EngineLaunchConfig, EngineSpawnSpec } from "@orb/server/infra/providers/vllm/engine";
import { buildEngineSpawnSpec, countGpus, resolveEngineLaunchConfig, VLLM_ENGINES } from "@orb/server/infra/providers/vllm/engine";

const REPO_ROOT = process.cwd();
const HEALTH_POLL_MAX = 180;
const HEALTH_POLL_INTERVAL_MS = 2000;
const HEALTH_TIMEOUT_MS = 2000;
const MS_PER_SECOND = 1000;

function log(msg: string): void {
  process.stdout.write(`engines: ${msg}\n`);
}

/** VLLM_DISABLED / GPU-less → nothing to run (derive roles use jina local-light; summarize uses hosted). */
function shouldSkip(): boolean {
  if (env.VLLM_DISABLED) {
    log("VLLM_DISABLED — skipping the local model engines (light boot).");
    return true;
  }
  if (countGpus() === 0) {
    log("no NVIDIA GPU on this host — nothing to run.");
    return true;
  }
  return false;
}

async function waitHealthy(engine: string, port: number): Promise<void> {
  for (let i = 0; i < HEALTH_POLL_MAX; i += 1) {
    try {
      // biome-ignore lint/performance/noAwaitInLoops: a sequential health poll is inherently serial.
      const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
      if (res.ok) {
        log(`${engine} up (:${port})`);
        return;
      }
    } catch {
      // still warming — keep polling
    }
    await new Promise((r) => setTimeout(r, HEALTH_POLL_INTERVAL_MS));
  }
  log(`WARNING — ${engine} not healthy after ${(HEALTH_POLL_MAX * HEALTH_POLL_INTERVAL_MS) / MS_PER_SECOND}s; continuing.`);
}

function spawnEngine(spec: EngineSpawnSpec): ChildProcess {
  // setsid: the engine leads its own process group so one group-kill takes the APIServer + EngineCore.
  const argv = ["setsid", spec.command, ...spec.args];
  return spawn(argv[0] as string, argv.slice(1), {
    cwd: REPO_ROOT,
    env: { ...processEnvSnapshot(), ...spec.env },
    stdio: "inherit",
    detached: false,
  });
}

async function main(): Promise<void> {
  if (shouldSkip()) {
    return;
  }
  const floor = engineLaunchEnvFloor();
  const launch: EngineLaunchConfig = resolveEngineLaunchConfig(floor, undefined);
  const deployment = engineDeploymentEnv();
  const gpuCount = countGpus();
  const ports = launch.ports;
  const children: ChildProcess[] = [];

  const cleanup = (): void => {
    log("stopping…");
    for (const c of children) {
      if (c.pid !== undefined) {
        try {
          process.kill(-c.pid, "SIGTERM");
        } catch {
          // already gone
        }
      }
    }
  };
  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });

  const portOf: Record<string, number> = { embed: ports.embed, rerank: ports.rerank, gen: ports.gen };
  const baseEnv = processEnvSnapshot();
  for (const engine of VLLM_ENGINES) {
    log(`starting ${engine} :${portOf[engine]}`);
    const spec = buildEngineSpawnSpec(engine, launch, { repoRoot: REPO_ROOT, gpuCount, deployment, baseEnv });
    children.push(spawnEngine(spec));
    // biome-ignore lint/performance/noAwaitInLoops: sequential boot — vLLM's memory profiler cannot run two at once.
    await waitHealthy(engine, portOf[engine] as number);
  }
  log(`all booted — embed:${ports.embed} rerank:${ports.rerank} gen:${ports.gen}`);
  log("owning them in the foreground; `pnpm dev` will ADOPT. Ctrl-C to stop.");
  // Hold the process open owning the children until a signal tears it down.
  await new Promise<void>(() => undefined);
}

void main();
