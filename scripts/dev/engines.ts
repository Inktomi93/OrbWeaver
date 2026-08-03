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
import { closeSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { engineDeploymentEnv, engineLaunchEnvFloor, env, processEnvSnapshot } from "@orb/server/foundation/env";
import type { EngineLaunchConfig, EngineSpawnSpec, EngineUtilFractions } from "@orb/server/infra/providers/vllm/engine";
import {
  buildEngineSpawnSpec,
  countGpus,
  decideWakeBudget,
  engineVramNeed,
  fleetRunDir,
  queryGpuVram,
  reapOrphanedFamily,
  resolveEngineLaunchConfig,
  VLLM_ENGINES,
} from "@orb/server/infra/providers/vllm/engine";

const REPO_ROOT = process.cwd();
const HEALTH_POLL_MAX = 180;
const HEALTH_POLL_INTERVAL_MS = 2000;
const HEALTH_TIMEOUT_MS = 2000;
const MS_PER_SECOND = 1000;
// `--detach`: boot the fleet, record engine pgids to the pidfile, then EXIT (no foreground hold, no
// kill-trap) — the detached fleet model (A.4). Each engine is its own setsid group leader, so they survive
// the launcher's death; the bit-us-twice class is unmakeable. Default (no flag) = the old foreground owner.
const DETACH = process.argv.includes("--detach");
const PIDFILE = path.join(fleetRunDir(REPO_ROOT), "engines.pgid");
const BOOT_LOCK = path.join(fleetRunDir(REPO_ROOT), "engines.boot.lock");
const PIDFILE_ROW_RE = /\s+/u;

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

/** One /health probe — also the pre-spawn adopt-in-place check (an answering port = an engine that is
 *  already serving; spawning another is the duplicate-fleet defect, 2026-08-03). */
async function portHealthy(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitHealthy(engine: string, port: number, child: ChildProcess): Promise<void> {
  for (let i = 0; i < HEALTH_POLL_MAX; i += 1) {
    // A dead child with a healthy port is NOT success — the port is someone else's engine and our
    // spawn crashed (the duplicate-fleet false-positive: the old poll validated the OTHER fleet).
    if (child.exitCode !== null) {
      log(`ERROR — ${engine} exited (code ${child.exitCode}) before becoming healthy; see vllm-${engine}.log.`);
      return;
    }
    // biome-ignore lint/performance/noAwaitInLoops: a sequential health poll is inherently serial.
    if (await portHealthy(port)) {
      log(`${engine} up (:${port})`);
      return;
    }
    await new Promise((r) => setTimeout(r, HEALTH_POLL_INTERVAL_MS));
  }
  log(`WARNING — ${engine} not healthy after ${(HEALTH_POLL_MAX * HEALTH_POLL_INTERVAL_MS) / MS_PER_SECOND}s; continuing.`);
}

function spawnEngine(engine: string, spec: EngineSpawnSpec): ChildProcess {
  // setsid: the engine leads its own process group so one group-kill takes the APIServer + EngineCore.
  const argv = ["setsid", spec.command, ...spec.args];
  // Each engine's stdout/stderr → its OWN vllm-<engine>.log (matching the supervisor's convention + what
  // `pnpm engines`'s log-follow tails). In DETACH mode the launcher exits, so "inherit" would break the
  // engine's stdout on launcher death — a dedicated file fd keeps the detached engine's logs flowing.
  const logPath = path.join(fleetRunDir(REPO_ROOT), `vllm-${engine}.log`);
  mkdirSync(fleetRunDir(REPO_ROOT), { recursive: true });
  const logFd = openSync(logPath, "a");
  const child = spawn(argv[0] as string, argv.slice(1), {
    cwd: REPO_ROOT,
    env: { ...processEnvSnapshot(), ...spec.env },
    stdio: ["ignore", logFd, logFd],
    detached: false,
  });
  // The child holds its own dups of logFd from spawn; the parent copy would otherwise leak one fd
  // per engine per adopt (2026-08-03 immortal-launcher audit).
  closeSync(logFd);
  return child;
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

/** Write the detached pidfile: one `engine pgid startTime` row per booted engine. The bash stop verb reads
 *  the pgids to group-kill the family; start-time makes the pid pgid-reuse-safe (bash re-reads /proc/stat).
 *  MERGE semantics (2026-08-03 duplicate-fleet audit): an adopt that booted only SOME engines (others
 *  already healthy and adopted in place) must not clobber the healthy engines' rows — read the existing
 *  file and overlay by engine name. A no-op adopt (zero booted) leaves the pidfile untouched: the old
 *  unconditional write let a second adopter blank the live fleet's pidfile, orphaning `engines:stop`. */
function writePidfile(rows: readonly (readonly [string, number])[]): void {
  if (rows.length === 0) {
    log("no engines booted by this adopt — pidfile untouched.");
    return;
  }
  mkdirSync(fleetRunDir(REPO_ROOT), { recursive: true });
  const merged = new Map<string, number>();
  try {
    for (const line of readFileSync(PIDFILE, "utf8").split("\n")) {
      const [engine, pgid] = line.trim().split(PIDFILE_ROW_RE);
      if (engine !== undefined && engine.length > 0 && pgid !== undefined) {
        merged.set(engine, Number(pgid));
      }
    }
  } catch {
    // no existing pidfile — fresh fleet
  }
  for (const [engine, pgid] of rows) {
    merged.set(engine, pgid);
  }
  const lines = [...merged.entries()].map(([engine, pgid]) => `${engine} ${pgid}`).join("\n");
  writeFileSync(PIDFILE, `${lines}\n`);
  log(`wrote pidfile ${PIDFILE} (${merged.size} engines, ${rows.length} booted by this adopt)`);
}

/** The adopt-window boot lock (2026-08-03 duplicate-fleet audit): two adopters racing the same boot
 *  window each passed the VRAM headroom gate (mid-boot VRAM is ambiguous — the first adopter's engines
 *  hadn't claimed their budgets yet) and spawned a SECOND fleet — two vllm processes per port, the losers
 *  holding ~17GiB of loaded models for hours while serving nothing. `wx` create is the atomic take; a
 *  holder whose pid is dead is a stale lock from a crashed adopter and is broken loudly. */
function acquireBootLock(): boolean {
  mkdirSync(fleetRunDir(REPO_ROOT), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      writeFileSync(BOOT_LOCK, `${process.pid}\n`, { flag: "wx" });
      return true;
    } catch {
      let holder = Number.NaN;
      try {
        holder = Number(readFileSync(BOOT_LOCK, "utf8").trim());
      } catch {
        continue; // vanished between wx-fail and read — retry the take
      }
      try {
        process.kill(holder, 0);
        log(`another adopter (pid ${holder}) is mid-boot — this adopt is a no-op; tail its logs or re-run when it finishes.`);
        return false;
      } catch {
        log(`breaking stale boot lock (holder pid ${holder} is dead).`);
        try {
          unlinkSync(BOOT_LOCK);
        } catch {
          // lost the break race to another adopter — the retry's wx decides
        }
      }
    }
  }
  log("could not take the boot lock after breaking a stale one — another adopter won the race; no-op.");
  return false;
}

function releaseBootLock(): void {
  try {
    unlinkSync(BOOT_LOCK);
  } catch {
    // already gone
  }
}

async function main(): Promise<void> {
  if (shouldSkip()) {
    return;
  }
  if (!acquireBootLock()) {
    return;
  }
  const floor = engineLaunchEnvFloor();
  const launch: EngineLaunchConfig = resolveEngineLaunchConfig(floor, undefined);
  const deployment = engineDeploymentEnv();
  const gpuCount = countGpus();
  const ports = launch.ports;
  const children: ChildProcess[] = [];
  const booted: [string, number][] = [];

  // Reconcile-before-spawn: reap any orphaned engine-family process (a dead APIServer's core still holding
  // VRAM) so the headroom pre-check names a REAL foreign tenant, never our own corpse.
  const reaped = await reapOrphanedFamily(REPO_ROOT);
  if (reaped.length > 0) {
    log(`reaped orphaned engine-family process(es) before boot: ${reaped.join(", ")}`);
  }

  // Foreground mode (default) owns the children + group-kills them on a signal (the pre-fleet behavior for
  // `pnpm dev` adoption). --detach records the pidfile and exits, leaving the engines warm (fleet model).
  if (!DETACH) {
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
  }

  const portOf: Record<string, number> = { embed: ports.embed, rerank: ports.rerank, gen: ports.gen };
  const baseEnv = processEnvSnapshot();
  for (const engine of VLLM_ENGINES) {
    const port = portOf[engine] as number;
    // Adopt-in-place: a port already answering /health is an ALREADY-SERVING engine (a prior adopt's
    // fleet). Spawning "our own" copy here is how the duplicate fleet happened — the dupe loads its
    // model into VRAM, loses the port bind, and idles forever. Its pidfile row survives via merge.
    // biome-ignore lint/performance/noAwaitInLoops: sequential boot — vLLM's memory profiler cannot run two at once.
    if (await portHealthy(port)) {
      log(`${engine} already serving (:${port}) — adopted in place, no spawn.`);
      continue;
    }
    if (!(await headroomOk(engine, gpuCount))) {
      continue; // no breaker charge for a held GPU — a foreign tenant is not a crash loop.
    }
    log(`starting ${engine} :${portOf[engine]}`);
    const spec = buildEngineSpawnSpec(engine, launch, { repoRoot: REPO_ROOT, gpuCount, deployment, baseEnv });
    const child = spawnEngine(engine, spec);
    children.push(child);
    if (child.pid !== undefined) {
      booted.push([engine, child.pid]); // setsid ⇒ pid == the engine's process-group leader (pgid)
    }
    await waitHealthy(engine, portOf[engine] as number, child);
  }
  log(`booted ${booted.length}/${VLLM_ENGINES.length} — embed:${ports.embed} rerank:${ports.rerank} gen:${ports.gen}`);

  if (DETACH) {
    writePidfile(booted);
    releaseBootLock();
    // Un-ref the child handles or the "exited" launcher lives exactly as long as the fleet: the
    // 2026-08-03 audit found two launcher+tsx+esbuild clusters idling for 8h, event-loops held by
    // these handles. The engines are setsid group leaders — they don't need us alive.
    for (const c of children) {
      c.unref();
    }
    log("detached — the fleet stays warm (each engine is its own setsid group). `pnpm engines:stop` kills it.");
    return; // exit WITHOUT the kill trap; the engines keep running, owned by nothing.
  }
  releaseBootLock();
  log("owning them in the foreground; `pnpm dev` will ADOPT. Ctrl-C to stop.");
  // Hold the process open owning the children until a signal tears it down.
  await new Promise<void>(() => undefined);
}

void main();
