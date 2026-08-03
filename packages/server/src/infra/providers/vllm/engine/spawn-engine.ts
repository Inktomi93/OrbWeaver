// The DEPLOYMENT-fact resolver + spawn-spec builder — the I/O half of what scripts/dev/vllm-engine.sh used
// to do in bash, now shared by BOTH engine owners (the in-server supervisor's spawnOwned + the standalone
// scripts/dev/engines.ts launcher) so they can never drift. Resolves: STORE_ROOT (git-common-dir worktree
// sharing), the vllm binary + its python interpreter, the in-repo HF/vLLM caches, the rerank model's
// snapshot path (a huggingface_hub call — the `hf` CLI's stdout format is version-unstable), and the
// per-engine CUDA_VISIBLE_DEVICES. Then defers the FLAG half to the pure buildEngineArgv.
//
// DEPLOYMENT vs LAUNCH: ports + store paths are env-only DEPLOYMENT facts (the `deployment` slice, resolved
// from foundation/env by the caller — infra never reads process.env); the serve flags
// (models/windows/utils/max_pixels/TP) are the LAUNCH config buildEngineArgv turns into argv. The deployment
// overrides (VLLM_BIN, VLLM_PY, HF_HOME, VLLM_CACHE_ROOT, VLLM_STORE_ROOT) still win, mirroring the old shell.

import { execFileSync } from "node:child_process";
import path from "node:path";
import type { EngineLaunchConfig } from "./build-argv.ts";
import { buildEngineArgv, engineCudaVisibleDevices } from "./build-argv.ts";
import type { VLLM_ENGINES } from "./engines.ts";

type VllmEngine = (typeof VLLM_ENGINES)[number];

/** The env-sourced DEPLOYMENT overrides (all optional — unset ⇒ the derived in-repo defaults). The caller
 *  projects these from foundation/env so this module never touches process.env. */
export interface EngineDeploymentEnv {
  readonly vllmBin?: string | undefined;
  readonly vllmPy?: string | undefined;
  readonly storeRoot?: string | undefined;
  readonly hfHome?: string | undefined;
  readonly vllmCacheRoot?: string | undefined;
}

/** A fully-resolved engine spawn: the exact command, args, subprocess env additions, and GPU pinning. The
 *  caller owns backgrounding + logging + kill semantics (the supervisor's pipe-watchdog / the launcher's
 *  setsid group). */
export interface EngineSpawnSpec {
  readonly command: string;
  readonly args: readonly string[];
  /** Env vars to MERGE onto the child's inherited env (caches + CUDA_VISIBLE_DEVICES). */
  readonly env: Readonly<Record<string, string>>;
}

/** The store root shared across git worktrees — the MAIN checkout's git-common-dir parent, so a linked
 *  worktree reuses the multi-GB model/venv caches. Falls back to the repo root outside a worktree; an
 *  explicit override still wins. Mirrors the shell `git rev-parse --git-common-dir` derivation. */
export function resolveStoreRoot(repoRoot: string, override?: string | undefined): string {
  if (override !== undefined && override.length > 0) {
    return override;
  }
  try {
    const commonDir = execFileSync("git", ["-C", repoRoot, "rev-parse", "--path-format=absolute", "--git-common-dir"], {
      encoding: "utf8",
    }).trim();
    return path.dirname(commonDir);
  } catch {
    return repoRoot;
  }
}

/** The vllm binary + its python interpreter. Bare-metal dev uses the repo venv; the Docker image sets
 *  vllmBin. The interpreter rides next to the binary (vllmPy wins), else `python3` on PATH. */
function resolveBinaries(storeRoot: string, deployment: EngineDeploymentEnv): { vllm: string; python: string } {
  const vllm = deployment.vllmBin ?? path.join(storeRoot, ".cache", "vllm", "venv", "bin", "vllm");
  const python = deployment.vllmPy ?? path.join(path.dirname(vllm), "python3");
  return { vllm, python };
}

/** The in-repo cache env the engine inherits (self-containment doctrine). hfHome / vllmCacheRoot default
 *  under the SHARED store root; XDG under THIS checkout. Explicit override still wins. */
function cacheEnv(repoRoot: string, storeRoot: string, deployment: EngineDeploymentEnv): Record<string, string> {
  return {
    HF_HOME: deployment.hfHome ?? path.join(storeRoot, ".models", "hf"),
    VLLM_CACHE_ROOT: deployment.vllmCacheRoot ?? path.join(storeRoot, ".cache", "vllm"),
    XDG_CACHE_HOME: path.join(repoRoot, ".cache", "xdg"),
  };
}

/** Resolve the rerank model's local snapshot path via huggingface_hub (a no-op when cached; returns exactly
 *  the snapshot dir). The `hf` CLI stdout format is version-unstable — snapshot_download() is stable. Throws
 *  if the path can't be resolved (an unlaunchable rerank engine must fail loud, not serve a bad path). */
function resolveRerankSnapshotPath(python: string, rerankModel: string, cacheEnvVars: Record<string, string>, baseEnv: NodeJS.ProcessEnv): string {
  const out = execFileSync(python, ["-c", `from huggingface_hub import snapshot_download; print(snapshot_download('${rerankModel}'))`], {
    encoding: "utf8",
    env: { ...baseEnv, ...cacheEnvVars },
  })
    .trim()
    .split("\n")
    .pop();
  if (out === undefined || out.length === 0) {
    throw new Error(`vllm spawn: could not resolve rerank model snapshot path for '${rerankModel}'`);
  }
  return out;
}

/** The env-only DEPLOYMENT facts shown read-only in the admin Engines panel (never edited there — the #14
 *  ruling: ports + store paths stay env-only, DISPLAYED). `port` is the engine's loopback serve port;
 *  `storePath` is the resolved shared store root (the multi-GB model/cache home a linked worktree reuses). */
export interface EngineDeploymentFacts {
  readonly port: number;
  readonly storePath: string;
}

/** Resolve each engine's DEPLOYMENT facts from the same env projections the spawn spec reads (ports from the
 *  launch floor, store root from the deployment overrides ⊕ git-common-dir derivation) — ONE home so the
 *  displayed facts can't drift from the spawned ones. */
export function resolveEngineDeploymentFacts(opts: {
  readonly repoRoot: string;
  readonly deployment: EngineDeploymentEnv;
  readonly ports: { readonly embed: number; readonly rerank: number; readonly gen: number };
}): Record<VllmEngine, EngineDeploymentFacts> {
  const storePath = resolveStoreRoot(opts.repoRoot, opts.deployment.storeRoot);
  return {
    embed: { port: opts.ports.embed, storePath },
    rerank: { port: opts.ports.rerank, storePath },
    gen: { port: opts.ports.gen, storePath },
  };
}

/** Build the full spawn spec for one engine: resolve DEPLOYMENT facts (binary, caches, rerank snapshot) then
 *  defer the flags to buildEngineArgv. `gpuCount` is the detected NVIDIA card count (topology-invariant —
 *  only flags change). Only the rerank arm makes the huggingface_hub call. `baseEnv` (the current process
 *  env) is passed in so this module never reads process.env directly. */
export function buildEngineSpawnSpec(
  engine: VllmEngine,
  config: EngineLaunchConfig,
  opts: { repoRoot: string; gpuCount: number; deployment: EngineDeploymentEnv; baseEnv: NodeJS.ProcessEnv },
): EngineSpawnSpec {
  const storeRoot = resolveStoreRoot(opts.repoRoot, opts.deployment.storeRoot);
  const { vllm, python } = resolveBinaries(storeRoot, opts.deployment);
  const caches = cacheEnv(opts.repoRoot, storeRoot, opts.deployment);
  const rerankModelPath = engine === "rerank" ? resolveRerankSnapshotPath(python, config.rerankModel, caches, opts.baseEnv) : "";
  const args = buildEngineArgv(engine, config, { repoRoot: opts.repoRoot, gpuCount: opts.gpuCount, rerankModelPath });
  const cuda = engineCudaVisibleDevices(engine, opts.gpuCount);
  return {
    command: vllm,
    args,
    // VLLM_SERVER_DEV_MODE=1 (vLLM's own env, child-scoped only — never app env) registers the loopback
    // /sleep, /wake_up, /is_sleeping endpoints; gated on the SAME sleepMode as the `--enable-sleep-mode`
    // argv flag so both halves land together. Loopback bind is already enforced by the `--host 127.0.0.1`
    // argv, satisfying vLLM's SECURITY-warning precondition for registering these endpoints.
    env: {
      ...caches,
      ...(cuda !== null ? { CUDA_VISIBLE_DEVICES: cuda } : {}),
      ...(config.sleepMode ? { VLLM_SERVER_DEV_MODE: "1" } : {}),
    },
  };
}
