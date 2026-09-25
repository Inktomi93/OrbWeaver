// The git door for tooling-owned temporary repositories: the shared `_shared/git.ts` door (which drops the
// `GIT_*` namespace a hook exports) plus isolation from global and system config and from repository hooks,
// so a fixture command can never run an operator's hook, filter or command.
import type { RunGitOptions } from "./git.ts";
import { repoGitEnvironment, runGit } from "./git.ts";
import type { RunNicedSyncResult } from "./proc.ts";
import { inheritedProcessEnv } from "./process-env.ts";

/** `core.hooksPath=/dev/null` disables repository hooks; `core.fsmonitor=false` beats any repository-level
 * command because command-line config outranks repository config. The verifier fixture grammar separately
 * refuses `.git` destinations. Both controls remain pinned by `verify/lib/repo-paths.test.ts`. */
export const FIXTURE_GIT_CONFIG_ARGS: readonly string[] = ["-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false"];

/** The git variables a fixture ADDS after the door's drop: no global and no system config. */
const FIXTURE_GIT_EXTRA: Readonly<Record<string, string>> = { ["GIT_CONFIG_GLOBAL"]: "/dev/null", ["GIT_CONFIG_NOSYSTEM"]: "1" };

/** Drop every inherited Git redirect, then isolate global/system config: fixture repositories retain PATH,
 * HOME, and other process requirements without inheriting an operator command, filter, or repository. */
export function fixtureGitEnvironment(environment: NodeJS.ProcessEnv = inheritedProcessEnv()): NodeJS.ProcessEnv {
  return { ...repoGitEnvironment(environment), ...FIXTURE_GIT_EXTRA };
}

function fixtureOptions(environment: NodeJS.ProcessEnv): RunGitOptions {
  return { env: environment, extra: FIXTURE_GIT_EXTRA };
}

export function runFixtureGit(root: string, args: readonly string[], environment: NodeJS.ProcessEnv = inheritedProcessEnv()): RunNicedSyncResult {
  return runGit(root, [...FIXTURE_GIT_CONFIG_ARGS, ...args], fixtureOptions(environment));
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
