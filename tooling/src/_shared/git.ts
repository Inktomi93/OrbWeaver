// THE ONE GIT DOOR for tooling and test support: every git spawn names its repository root and drops the
// `GIT_*` namespace a git hook exports to its children (`GIT_DIR`, `GIT_INDEX_FILE`, `GIT_WORK_TREE`), so a
// command aimed at a planted repository never lands in the checkout running the hook. The
// `tooling-os-neutral` policy reports a git spawn that bypasses this module.
import type { RunNicedSyncOptions, RunNicedSyncResult } from "./proc.ts";
import { runNicedSync } from "./proc.ts";
import { inheritedProcessEnv } from "./process-env.ts";

/** Read-only git commands take `--no-optional-locks`, so a concurrent read never contends for the index lock. */
export const GIT_READ_PREFIX: readonly string[] = ["--no-optional-locks"];

/** The environment a git child starts from: everything but the `GIT_*` namespace. */
export function repoGitEnvironment(environment: NodeJS.ProcessEnv = inheritedProcessEnv()): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(environment).filter(([name]) => !name.startsWith("GIT_")));
}

export interface RunGitOptions extends Pick<RunNicedSyncOptions, "stdio" | "maxBuffer" | "timeout"> {
  /** The environment to start from before the `GIT_*` namespace is dropped; the process environment by default. */
  readonly env?: NodeJS.ProcessEnv;
  /** Keys added AFTER the drop: a temporary `GIT_INDEX_FILE`, a fixture's `GIT_CONFIG_GLOBAL`. Every git
   *  variable a caller wants is spelled here on purpose, never inherited by accident. */
  readonly extra?: Readonly<Record<string, string>>;
}

/** Run git on `root`; never throws on a non-zero status (the caller judges). */
export function runGit(root: string, args: readonly string[], opts: RunGitOptions = {}): RunNicedSyncResult {
  const env = { ...repoGitEnvironment(opts.env), ...opts.extra };
  return runNicedSync("git", args, {
    cwd: root,
    env,
    ...(opts.stdio === undefined ? {} : { stdio: opts.stdio }),
    ...(opts.maxBuffer === undefined ? {} : { maxBuffer: opts.maxBuffer }),
    ...(opts.timeout === undefined ? {} : { timeout: opts.timeout }),
  });
}

/** Run git on `root` and return its stdout; a non-zero status THROWS with the child's stderr folded in. */
export function execGit(root: string, args: readonly string[], opts: RunGitOptions = {}): string {
  const result = runGit(root, args, opts);
  if (result.status !== 0) {
    const said = result.stderr.trim();
    throw new Error(`git ${args[0] ?? ""} failed (${result.errorCode ?? `exit ${String(result.status)}`})${said === "" ? "" : `: ${said}`}`);
  }
  return result.stdout;
}
