// The stage and the keys: boot or reuse snap's isolated stage (orb's real turn path on a private port pair at
// a pinned commit) and read probe keys from the main checkout's `.env` in process. Nothing here prints a key.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { parseEnv } from "node:util";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { execGit } from "../../_shared/git.ts";
import { processEnvValue, withProcessEnv } from "../../_shared/process-env.ts";
import { UsageError } from "../../_shared/run-tool.ts";
import type { CacheCheckOptions, EnvFile } from "../contract/types.ts";

refuseDirectInvocation(import.meta.url, "pnpm cache:check");

const CREDENTIALS_KEY_ENV = "CREDENTIALS_KEY";
const ENV_FILE = ".env";
const LOOPBACK = "127.0.0.1";

/** The main checkout: the parent of the git common dir, which every linked worktree shares. */
function mainCheckoutRoot(): string {
  return dirname(execGit(process.cwd(), ["rev-parse", "--path-format=absolute", "--git-common-dir"]).trim());
}

/** The main checkout's `.env`, parsed. Empty when the file is absent. */
export function readMainEnv(): EnvFile {
  const path = join(mainCheckoutRoot(), ENV_FILE);
  return existsSync(path) ? parseEnv(readFileSync(path, "utf8")) : {};
}

/** One probe credential: the process env wins over the main `.env`; an empty value counts as absent. */
export function probeKey(name: string, mainEnv: EnvFile): string | null {
  const value = processEnvValue(name) ?? mainEnv[name];
  return value === undefined || value === "" ? null : value;
}

/** Boot or reuse the isolated stage for `options` and return its server base URL. A ref git cannot resolve is
 *  misuse, refused before any worktree work; a stage that fails to boot throws (a tool error). */
export async function bootStage(options: CacheCheckOptions, mainEnv: EnvFile): Promise<string> {
  // Loaded here, not at module scope: snap's front door pulls in its whole browser graph, and the pure half of
  // this tool (the verdict, the argv, the fixture) must stay importable by its tests without it.
  const snap = await import("#snap");
  if (!options.dirty && snap.tryResolveRef(options.ref) === null) {
    throw new UsageError(`--ref: git cannot resolve "${options.ref}" to a commit in this checkout`);
  }
  const credentialsKey = probeKey(CREDENTIALS_KEY_ENV, mainEnv);
  if (credentialsKey === null) {
    throw new Error(`${CREDENTIALS_KEY_ENV} is absent from the main checkout's ${ENV_FILE}; the stage could not store a probe credential`);
  }
  // A linked worktree has no `.env` for the stage to inherit this from, and without it credential storage is off.
  const row = await withProcessEnv(CREDENTIALS_KEY_ENV, credentialsKey, () =>
    Promise.resolve(snap.ensureStage({ ref: options.ref, fresh: false, dirty: options.dirty })),
  );
  return `http://${LOOPBACK}:${row.serverPort}`;
}
