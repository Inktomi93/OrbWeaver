/**
 * engines — the long-lived vLLM engine OWNER (the dev adoption seam), TS half of the fleet front door.
 *
 *   pnpm engines            (or bash tooling/src/stack/engines.sh, which execs this)
 *
 * Dev tooling (throwaway launcher; global KISS applies — NOT the architecture). It boots the three loopback
 * engines SEQUENTIALLY and stays in the foreground OWNING them, OUTSIDE the node --watch server loop, so a
 * a dev-server restart (`pnpm stack up`) ADOPTS the already-warm ports instead of cold-respawning them (~1-2 min each save).
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
import { mkdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { engineDeploymentEnv, engineLaunchEnvFloor, env, processEnvSnapshot } from "@orb/server/foundation/env";
import type { EngineLaunchConfig, EngineLaunchIdentity, EngineSpawnSpec, EngineUtilFractions } from "@orb/server/infra/providers/vllm/engine";
import {
  buildEngineSpawnSpec,
  captureEngineLaunchIdentity,
  countGpus,
  decideWakeBudget,
  engineIdentityFilePath,
  engineVramNeed,
  fleetRunDir,
  queryGpuVram,
  reapOrphanedFamily,
  resolveEngineLaunchConfig,
  signalEngineLaunchIdentity,
  VLLM_ENGINES,
  writeEngineLaunchIdentities,
} from "@orb/server/infra/providers/vllm/engine";
import { print } from "../../_shared/artifacts.ts";
import type { ExitCode } from "../../_shared/exit-contract.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import type { FullPriorityChild } from "../../_shared/proc.ts";
import { spawnFullPriorityChild } from "../../_shared/proc.ts";
import { runTool } from "../../_shared/run-tool.ts";
import type { EngineRole } from "../contract/types.ts";
import { engineAdoptionMismatch } from "../lib/engine-adoption.ts";
import { probePortHealth } from "../lib/port-health.ts";
import { acquireSpawnLock, pidIsAlive, releaseSpawnLock } from "../lib/spawn-lock.ts";

const REPO_ROOT = process.cwd();
const HEALTH_POLL_MAX = 180;
const HEALTH_POLL_INTERVAL_MS = 2000;
const HEALTH_TIMEOUT_MS = 2000;
const MS_PER_SECOND = 1000;
// `--detach`: boot the fleet, record engine pgids to the pidfile, then EXIT (no foreground hold, no
// kill-trap) — the detached fleet model (A.4). Each engine is its own setsid group leader, so they survive
// the launcher's death; the bit-us-twice class is unmakeable. Default (no flag) = the old foreground owner.
const DETACH = process.argv.includes("--detach");
const PIDFILE = engineIdentityFilePath(REPO_ROOT);
const BOOT_LOCK = path.join(fleetRunDir(REPO_ROOT), "engines.boot.lock");

function log(msg: string): void {
  print(`engines: ${msg}`);
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

/** One /health probe — also the pre-spawn adopt-in-place check (an answering port = an engine that is
 *  already serving; spawning another is the duplicate-fleet defect, 2026-08-03). */
function expectedModels(engine: EngineRole, launch: EngineLaunchConfig): readonly string[] {
  if (engine === "embed") {
    return [launch.embedModel];
  }
  if (engine === "rerank") {
    return [launch.rerankModel];
  }
  return [launch.genModel.split("/").pop() ?? launch.genModel, launch.genModel];
}

async function adoptionMismatch(engine: EngineRole, port: number, launch: EngineLaunchConfig): Promise<string | null> {
  // @orb-gate-ignore caught-failure-ownership(empty:error): the returned identity-probe failure is printed as a tool error and refuses adoption/spawn. Ends if this string can be treated as a successful identity verdict.
  try {
    const [modelsResponse, openapiResponse] = await Promise.all([
      fetch(`http://127.0.0.1:${port}/v1/models`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) }),
      fetch(`http://127.0.0.1:${port}/openapi.json`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) }),
    ]);
    if (!(modelsResponse.ok && openapiResponse.ok)) {
      return `identity endpoints failed (/v1/models=${modelsResponse.status}, /openapi.json=${openapiResponse.status})`;
    }
    const models = (await modelsResponse.json()) as { data?: readonly { id?: string }[] };
    const openapi = (await openapiResponse.json()) as { paths?: Record<string, unknown> };
    return engineAdoptionMismatch(engine, expectedModels(engine, launch), {
      modelIds: (models.data ?? []).flatMap((model) => (typeof model.id === "string" ? [model.id] : [])),
      paths: Object.keys(openapi.paths ?? {}),
    });
  } catch (error) {
    return `identity probe failed (${error instanceof Error ? error.message : String(error)})`;
  }
}

async function waitHealthy(engine: string, port: number, child: FullPriorityChild): Promise<void> {
  for (let i = 0; i < HEALTH_POLL_MAX; i += 1) {
    // A dead child with a healthy port is NOT success — the port is someone else's engine and our
    // spawn crashed (the duplicate-fleet false-positive: the old poll validated the OTHER fleet).
    if (child.hasExited()) {
      log(`ERROR — ${engine} exited before becoming healthy; see vllm-${engine}.log.`);
      return;
    }
    if ((await probePortHealth(port)).kind === "healthy") {
      log(`${engine} up (:${port})`);
      return;
    }
    await sleep(HEALTH_POLL_INTERVAL_MS);
  }
  log(`WARNING — ${engine} not healthy after ${(HEALTH_POLL_MAX * HEALTH_POLL_INTERVAL_MS) / MS_PER_SECOND}s; continuing.`);
}

/** FULL PRIORITY, deliberately (gate: tooling-shared-plumbing FULL_PRIORITY_CALLERS): these engines ARE
 *  the inference workload the operator waits on — a `nice -19` vLLM degrades the interactive token
 *  latency the fleet exists to provide. */
function spawnEngine(engine: string, spec: EngineSpawnSpec): FullPriorityChild {
  // setsid: the engine leads its own process group so one group-kill takes the APIServer + EngineCore.
  // Each engine's stdout/stderr → its OWN vllm-<engine>.log (matching the supervisor's convention + what
  // `pnpm engines`'s log-follow tails). In DETACH mode the launcher exits, so "inherit" would break the
  // engine's stdout on launcher death — a dedicated file fd keeps the detached engine's logs flowing.
  mkdirSync(fleetRunDir(REPO_ROOT), { recursive: true });
  return spawnFullPriorityChild("setsid", [spec.command, ...spec.args], {
    cwd: REPO_ROOT,
    env: { ...processEnvSnapshot(), ...spec.env },
    logPath: path.join(fleetRunDir(REPO_ROOT), `vllm-${engine}.log`),
  });
}

/** The launch-floor util fractions the cold-start VRAM pre-check reads (SAME source as the serve argv). */
function utilFractions(): EngineUtilFractions {
  const f = engineLaunchEnvFloor();
  return {
    embedGpuUtil: f.VLLM_EMBED_GPU_UTIL,
    rerankGpuUtilMulti: f.VLLM_RERANK_GPU_UTIL_MULTI,
    rerankGpuUtilSingle: f.VLLM_RERANK_GPU_UTIL_SINGLE,
    genGpuUtilMulti: f.VLLM_GEN_GPU_UTIL_MULTI,
    genGpuUtilSingle: f.VLLM_GEN_GPU_UTIL_SINGLE,
  };
}

/** The cold-start headroom gate (B.6): vLLM's memory profiler OOMs mid-boot into insufficient free VRAM
 *  (the 0.28-era coexistence pain). The SAME budget check the wake gate runs — refuse loudly, name the
 *  holders, and skip the boot rather than OOM. Returns false to skip this engine's boot. Reconcile has
 *  already run, so a held GPU is a REAL foreign tenant, never our own corpse. */
async function headroomOk(engine: (typeof VLLM_ENGINES)[number], gpuCount: number): Promise<boolean> {
  const verdict = decideWakeBudget(engine, engineVramNeed(engine, gpuCount, utilFractions()), await queryGpuVram());
  if (!verdict.ok) {
    log(`${engine}: BOOT REFUSED — ${verdict.message}`);
    return false;
  }
  return true;
}

/** The adopt-window boot lock (2026-08-03 duplicate-fleet audit): two adopters racing the same boot
 *  window each passed the VRAM headroom gate (mid-boot VRAM is ambiguous — the first adopter's engines
 *  hadn't claimed their budgets yet) and spawned a SECOND fleet — two vllm processes per port, the losers
 *  holding ~17GiB of loaded models for hours while serving nothing. `wx` create is the atomic take.
 *
 *  Delegates to `./_kit/spawn-lock.ts` (`acquireSpawnLock`/`releaseSpawnLock`) rather than re-deriving the
 *  lock grammar here — this launcher's own hand-rolled version fed a raw `Number(readFileSync(...))`
 *  straight to `process.kill(holder, 0)`, and **`process.kill(0, 0)` signals the caller's own process
 *  GROUP, so it always succeeds** ([[kill-signal-zero-pid-zero-always-succeeds]]): an EMPTY or
 *  non-numeric lock file parsed to pid `0`/`NaN→0`, read as "a live adopter holds it", and wedged every
 *  future boot until a human deleted the file by hand. `spawn-lock.ts`'s `parseLockHolder` treats a
 *  non-positive/non-integer holder as `unparseable` (never probed) and breaks it as stale — the same fix
 *  `stack-prod.ts`'s prod spawn lock already carries; this launcher gets it by reuse, not a second copy. */
function acquireBootLock(): boolean {
  return acquireSpawnLock({
    lockPath: BOOT_LOCK,
    selfPid: process.pid,
    isAlive: pidIsAlive,
    log,
  });
}

function releaseBootLock(): void {
  releaseSpawnLock(BOOT_LOCK);
}

/** The foreground hold: own the verified launch identities until a signal, then group-kill them and RESOLVE (never
 *  `process.exit` — the exit-honesty runner owns termination, and a hard exit here would skip the
 *  teardown the operator's Ctrl-C is asking for). */
function holdUntilSignal(identities: readonly EngineLaunchIdentity[]): Promise<void> {
  return new Promise<void>((resolve) => {
    const stop = (): void => {
      log("stopping…");
      for (const identity of identities) {
        const result = signalEngineLaunchIdentity(identity, "SIGTERM", {
          engine: identity.engine,
          port: identity.port,
          repoRoot: REPO_ROOT,
          listenerPid: null,
        });
        log(`${identity.engine}: ${result.verdict}${"reason" in result ? ` — ${result.reason}` : ` pgid=${result.pgid}`}`);
      }
      resolve();
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  });
}

interface FleetLaunchResult {
  readonly children: FullPriorityChild[];
  readonly launched: EngineLaunchIdentity[];
  readonly identityFailures: number;
}

interface EngineLaunchResult {
  readonly child?: FullPriorityChild | undefined;
  readonly identity?: EngineLaunchIdentity | undefined;
  readonly identityFailed: boolean;
}

async function launchOneEngine(opts: {
  readonly engine: (typeof VLLM_ENGINES)[number];
  readonly port: number;
  readonly launch: EngineLaunchConfig;
  readonly deployment: ReturnType<typeof engineDeploymentEnv>;
  readonly gpuCount: number;
  readonly baseEnv: NodeJS.ProcessEnv;
}): Promise<EngineLaunchResult> {
  const { engine, port, launch, deployment, gpuCount, baseEnv } = opts;
  const health = await probePortHealth(port);
  if (health.kind === "healthy") {
    const mismatch = await adoptionMismatch(engine, port, launch);
    if (mismatch !== null) {
      log(`${engine}: ADOPTION REFUSED on :${port} — ${mismatch}; occupied listener left untouched.`);
      return { identityFailed: true };
    }
    log(`${engine} already serving (:${port}) — adopted in place, no spawn.`);
    return { identityFailed: false };
  }
  if (health.kind === "unproven") {
    log(`${engine}: ADOPTION REFUSED on :${port} — health probe failed (${health.reason}); occupied listener state is unproven and no duplicate will spawn.`);
    return { identityFailed: true };
  }
  if (!(await headroomOk(engine, gpuCount))) {
    return { identityFailed: false };
  }
  log(`starting ${engine} :${port}`);
  const spec = buildEngineSpawnSpec(engine, launch, { repoRoot: REPO_ROOT, gpuCount, deployment, baseEnv });
  const child = spawnEngine(engine, spec);
  await waitHealthy(engine, port, child);
  if (child.hasExited() || child.pid === undefined) {
    return { child, identityFailed: false };
  }
  const identity = captureEngineLaunchIdentity(engine, port, REPO_ROOT, child.pid);
  if (identity === null) {
    log(`ERROR — ${engine} pid ${child.pid} did not resolve to a safe setsid launch identity; refusing to record or signal it.`);
    return { child, identityFailed: true };
  }
  return { child, identity, identityFailed: false };
}

async function launchFleet(launch: EngineLaunchConfig, deployment: ReturnType<typeof engineDeploymentEnv>, gpuCount: number): Promise<FleetLaunchResult> {
  const children: FullPriorityChild[] = [];
  const launched: EngineLaunchIdentity[] = [];
  let identityFailures = 0;
  const portOf: Record<(typeof VLLM_ENGINES)[number], number> = {
    embed: launch.ports.embed,
    rerank: launch.ports.rerank,
    gen: launch.ports.gen,
  };
  const baseEnv = processEnvSnapshot();
  await VLLM_ENGINES.reduce<Promise<void>>(async (prior, engine) => {
    await prior;
    const result = await launchOneEngine({ engine, port: portOf[engine], launch, deployment, gpuCount, baseEnv });
    if (result.child !== undefined) {
      children.push(result.child);
    }
    if (result.identity !== undefined) {
      launched.push(result.identity);
    }
    if (result.identityFailed) {
      identityFailures += 1;
    }
  }, Promise.resolve());
  return { children, launched, identityFailures };
}

async function main(): Promise<ExitCode> {
  if (shouldSkip()) {
    return EXIT.clean;
  }
  if (!acquireBootLock()) {
    return EXIT.clean;
  }
  const floor = engineLaunchEnvFloor();
  const launch: EngineLaunchConfig = resolveEngineLaunchConfig(floor, undefined);
  const deployment = engineDeploymentEnv();
  const gpuCount = countGpus();
  const ports = launch.ports;

  // Reconcile-before-spawn: reap any orphaned engine-family process (a dead APIServer's core still holding
  // VRAM) so the headroom pre-check names a REAL foreign tenant, never our own corpse.
  const reaped = await reapOrphanedFamily(REPO_ROOT);
  if (reaped.length > 0) {
    log(`reaped orphaned engine-family process(es) before boot: ${reaped.join(", ")}`);
  }

  // Foreground mode owns the verified identities until a signal; --detach writes the same identities and
  // exits, leaving the engines warm. The launch loop remains sequential because vLLM profiles shared VRAM.
  const { children, launched, identityFailures } = await launchFleet(launch, deployment, gpuCount);
  log(`booted ${launched.length}/${VLLM_ENGINES.length} with verified launch identities — embed:${ports.embed} rerank:${ports.rerank} gen:${ports.gen}`);

  if (identityFailures > 0) {
    releaseBootLock();
    return EXIT.toolError;
  }
  writeEngineLaunchIdentities(REPO_ROOT, launched);
  if (launched.length > 0) {
    log(`wrote atomic launch identities to ${PIDFILE}`);
  } else {
    log("no engines booted by this adopt — launch identity file untouched.");
  }

  if (DETACH) {
    releaseBootLock();
    // Un-ref the child handles or the "exited" launcher lives exactly as long as the fleet: the
    // 2026-08-03 audit found two launcher+tsx+esbuild clusters idling for 8h, event-loops held by
    // these handles. The engines are setsid group leaders — they don't need us alive.
    for (const c of children) {
      c.unref();
    }
    log("detached — the fleet stays warm (each engine is its own setsid group). `pnpm engines:stop` kills it.");
    return EXIT.clean; // exit WITHOUT the kill trap; the engines keep running, owned by nothing.
  }
  releaseBootLock();
  log("owning them in the foreground; the dev server (`pnpm stack up`) will ADOPT. Ctrl-C to stop.");
  await holdUntilSignal(launched);
  return EXIT.clean;
}

await runTool(main);
