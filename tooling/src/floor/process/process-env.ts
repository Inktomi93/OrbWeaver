// Ambient launcher environment and tooling/test protocols are separate from subprocess creation in proc.ts.
// Product configuration belongs to the server's environment boundary, never this launcher adapter.
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

const TEST_NODE_WEB_STORAGE_OPTION = "--no-webstorage";
// Child launch plumbing and the runners' explicit cross-process protocols, never deployment configuration.
const TEST_INHERITED_ENV_KEYS = [
  "PATH",
  "Path",
  "PATHEXT",
  "SystemRoot",
  "SYSTEMROOT",
  "ComSpec",
  "COMSPEC",
  "HOME",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
  "TMPDIR",
  "TMP",
  "TEMP",
  "XDG_RUNTIME_DIR",
  "XDG_CACHE_HOME",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TZ",
  "TERM",
  "COLORTERM",
  "FORCE_COLOR",
  "NO_COLOR",
  "NODE_OPTIONS",
  "NODE_COMPILE_CACHE",
  "NODE_V8_COVERAGE",
  "NODE_ENV",
  "PNPM_HOME",
  "npm_execpath",
  "npm_node_execpath",
  "npm_config_user_agent",
  "CI",
  "GITHUB_ACTIONS",
  "RUNNER_ENVIRONMENT",
  "PLAYWRIGHT_BROWSERS_PATH",
  "DISPLAY",
  "WAYLAND_DISPLAY",
  "VITEST",
  "ORB_RUN_MARKER",
  "ORB_RUN_LEASE",
  "ORB_BOX_LOAD",
  "ORB_BUDGET_CEILING_MS",
  "ORB_DEDICATED_BOX",
  "ORB_TIMING_HARDWARE_CLASS",
  "ORB_TEST_CAPABILITIES",
  "ORB_TEST_HANG_TIMEOUT_MS",
  "ORB_TEST_HANG_MAX_MS",
  "ORB_VITEST_BIN",
  "ORB_NATIVE_OCCURRENCE_PACKAGES",
  "ORB_LOCAL_LIGHT_E2E",
  "PLUGIN_BROKER_PROOF_RECEIPT",
  "PERSONA_MATRIX_LABEL",
  "CT_NO_FLAKES",
  "CT_CORPUS_FIXTURE",
  "CT_PORT",
  "E2E_LIVE",
  "E2E_ALLOW_DEV_TARGET",
  "E2E_CORPUS_FIXTURE",
  "E2E_CORPUS_LOCAL_FIXTURE",
  "E2E_CORPUS_OWNER_PASSWORD",
  "E2E_CORPUS_MEMBER_PASSWORD",
  "E2E_CORPUS_REPORT_PREFIX",
  "E2E_ST_FOLDER",
  "CORPUS_PUBLICATION_FIXTURE",
  "CORPUS_PRIVATE_RUN_ROOT",
  "CORPUS_PRIVATE_EXECUTION_EXPIRES_AT_MS",
] as const;

/** Node's lazy storage getter warns on browser-code imports even when no storage file exists. Test
 * runners need absent Node storage globals, not a shared persistence file; Chromium storage is separate.
 * Only declared runner protocols inherit; explicit overrides authorize fixture-specific inputs. */
export function testProcessEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const ambient = ambientProcessEnv();
  const inherited: NodeJS.ProcessEnv = {};
  for (const key of TEST_INHERITED_ENV_KEYS) {
    const value = ambient[key];
    if (value !== undefined) {
      inherited[key] = value;
    }
  }
  const environment: NodeJS.ProcessEnv = { ...inherited, ["ORB_ENV_NO_FILE"]: "1", ...overrides };
  const nodeOptions = environment["NODE_OPTIONS"];
  if (nodeOptions?.trimEnd().split(/\s+/u).at(-1) !== TEST_NODE_WEB_STORAGE_OPTION) {
    environment["NODE_OPTIONS"] = [nodeOptions, TEST_NODE_WEB_STORAGE_OPTION].filter(Boolean).join(" ");
  }
  return environment;
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
