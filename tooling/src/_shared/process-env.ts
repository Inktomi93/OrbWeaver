// THE ONE AMBIENT-ENVIRONMENT DOOR for @orb/tooling — read the process environment HERE, or grow another
// `noProcessEnv` suppression at your call site (which is the drawer this package exists to end).
//
// It lived inside proc.ts until #1848, and the split is the tooling law's own §4.3 trigger: proc.ts is the
// ONE `node:child_process` home (tooling-shared-plumbing arm F) and reached its 450-line cap when the
// run-marker sweep was wired into its timeout path. Reading the ambient environment is not a subprocess
// capability — it is what a launcher does BEFORE it spawns — so this is where the seam falls. The three
// exported doors keep their exact behaviour and their names; only their file changed.
//
// WHAT THIS IS NOT: an app-configuration reader. Server/app config has its own env door far above this
// package (`packages/server/src/foundation/env`). Everything read here is a TOOLING/TEST PROTOCOL value —
// PATH and HOME for a child, `ORB_*` switches a launcher exported for its own children — never product
// configuration.
import process from "node:process";

/** Ambient process environment plus explicit child overrides. Tool launchers use this instead of each
 *  growing its own process.env suppression; app configuration is not read here. */
function ambientProcessEnv(): NodeJS.ProcessEnv {
  // biome-ignore lint/style/noProcessEnv: the child inherits the AMBIENT env (PATH, HOME — how every spawn works); the rule guards app config reads, and no config is read here.
  return process.env;
}

export function inheritedProcessEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return { ...ambientProcessEnv(), ...overrides };
}

/** Read one ambient tooling/test protocol value without creating another process.env policy site. */
export function processEnvValue(key: string): string | undefined {
  return ambientProcessEnv()[key];
}

/** PUBLISH one tooling/test protocol value into THIS process's environment for good — the door for a value
 *  every later reader (a second module instance under a bundler's alias, a child process, a nested
 *  launcher) must agree on. The run marker is the case that forced it: memoizing it in a module variable
 *  made two module instances mint two markers, and a browser stamped with one was invisible to a sweep
 *  asking about the other. Not a config write; the caller owns the key's meaning. */
export function exportProcessEnv(key: string, value: string): void {
  ambientProcessEnv()[key] = value;
}

/** Temporarily expose one process-environment value to a worker/subprocess protocol, then restore it.
 * This is not an app-config reader; it centralizes the mutation beside the fleet's process doors. */
export async function withProcessEnv<T>(key: string, value: string, run: () => Promise<T>): Promise<T> {
  const environment = ambientProcessEnv();
  const wasPresent = Object.hasOwn(environment, key);
  const previous = environment[key];
  environment[key] = value;
  try {
    return await run();
  } finally {
    if (wasPresent) {
      environment[key] = previous;
    } else {
      delete environment[key];
    }
  }
}
