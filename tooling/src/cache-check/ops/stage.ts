// The stage: boot or reuse snap's isolated stage (orb's real turn path on a private port pair at a pinned
// commit) with the main checkout's credentials key. Nothing here prints a key.
import { CREDENTIALS_KEY_ENV } from "@orb/server/foundation/data-layout";
import { refuseDirectInvocation } from "../../floor/cli/entrypoint.ts";
import { UsageError } from "../../floor/cli/run-tool.ts";
import type { EnvFile } from "../../floor/process/operator-keys.ts";
import { MAIN_ENV_FILE, operatorKey } from "../../floor/process/operator-keys.ts";
import { withProcessEnv } from "../../floor/process/process-env.ts";
import type { CacheCheckOptions } from "../contract/types.ts";

refuseDirectInvocation(import.meta.url, "pnpm cache:check");

const LOOPBACK = "127.0.0.1";

type StageOps = Parameters<typeof import("#snap")["ensureStage"]>[1];

/** Boot or reuse the isolated stage for `options` and return its server base URL. A ref git cannot resolve is
 *  misuse, refused before any worktree work; a stage that fails to boot throws (a tool error). `ops` is snap's
 *  injected box-facing half of `ensureStage`; every caller but a test takes the real one. */
export async function bootStage(options: CacheCheckOptions, mainEnv: EnvFile, ops?: StageOps): Promise<string> {
  // Loaded here, not at module scope: snap's front door pulls in its whole browser graph, and the pure half of
  // this tool (the verdict, the argv, the fixture) must stay importable by its tests without it.
  const snap = await import("#snap");
  if (!options.dirty && snap.tryResolveRef(options.ref) === null) {
    throw new UsageError(`--ref: git cannot resolve "${options.ref}" to a commit in this checkout`);
  }
  const credentialsKey = operatorKey(CREDENTIALS_KEY_ENV, mainEnv);
  if (credentialsKey === null) {
    throw new Error(`${CREDENTIALS_KEY_ENV} is absent from the main checkout's ${MAIN_ENV_FILE}; the stage could not store a probe credential`);
  }
  // A linked worktree has no `.env` for the stage to inherit this from, and without it credential storage is off.
  const row = await withProcessEnv(CREDENTIALS_KEY_ENV, credentialsKey, () =>
    Promise.resolve(snap.ensureStage({ ref: options.ref, fresh: false, dirty: options.dirty, seedsConnection: true }, ops)),
  );
  return `http://${LOOPBACK}:${row.serverPort}`;
}
