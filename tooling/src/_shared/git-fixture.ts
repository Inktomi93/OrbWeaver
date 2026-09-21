// The ONE Git environment and subprocess door for tooling-owned temporary repositories. Git hooks export
// local-repository variables such as GIT_DIR/GIT_WORK_TREE/GIT_INDEX_FILE into their children; passing those
// through to `git init` redirects the write into the checkout running the hook. Every fixture command drops
// that whole namespace, keeps ordinary process variables, and also refuses host/repository command hooks.

import { repoGitEnvironment } from "./authored-repository.ts";
import type { RunNicedSyncResult } from "./proc.ts";
import { runNicedSync } from "./proc.ts";
import { inheritedProcessEnv } from "./process-env.ts";

/** `core.hooksPath=/dev/null` disables repository hooks; `core.fsmonitor=false` beats any repository-level
 * command because command-line config outranks repository config. The verifier fixture grammar separately
 * refuses `.git` destinations. Both controls remain pinned by `verify/lib/repo-paths.test.ts`. */
export const FIXTURE_GIT_CONFIG_ARGS: readonly string[] = ["-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false"];

/** Drop every inherited Git redirect, then isolate global/system config: fixture repositories retain PATH,
 * HOME, and other process requirements without inheriting an operator command, filter, or repository. */
export function fixtureGitEnvironment(environment: NodeJS.ProcessEnv = inheritedProcessEnv()): NodeJS.ProcessEnv {
  return { ...repoGitEnvironment(environment), ["GIT_CONFIG_GLOBAL"]: "/dev/null", ["GIT_CONFIG_NOSYSTEM"]: "1" };
}

export function runFixtureGit(root: string, args: readonly string[], environment: NodeJS.ProcessEnv = inheritedProcessEnv()): RunNicedSyncResult {
  return runNicedSync("git", [...FIXTURE_GIT_CONFIG_ARGS, ...args], { cwd: root, env: fixtureGitEnvironment(environment) });
}

/** Throwing fixture command door for setup code whose repository is unusable after any Git failure. */
export function execFixtureGit(root: string, args: readonly string[], environment: NodeJS.ProcessEnv = inheritedProcessEnv()): string {
  const result = runFixtureGit(root, args, environment);
  if (result.status !== 0) {
    const stderr = result.stderr.trim();
    const detail = stderr !== "" ? stderr : (result.errorCode ?? `exit ${String(result.status)}`);
    throw new Error(`fixture Git ${args[0] ?? "command"} failed: ${detail}`);
  }
  return result.stdout;
}
