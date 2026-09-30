// infra/plugin-host/process-permission — the Node permission-model flags the watchdog and the broker start under.
// A process that runs guest code must not read the data dir, the `.env` file or another process's /proc entries, so
// file reads stop at the code the two processes load plus the broker's private socket directory.

import { join, parse } from "node:path";
import { fileURLToPath } from "node:url";
import { CONTAINER_MARKER_FILES } from "../../foundation/env/container.ts";

// This file sits at `packages/server/src/infra/plugin-host/`. Its fifth parent holds `packages/` and `node_modules/`
// in the repository and in the image (`/app`), beside the data dir, which is never granted.
const WORKSPACE_ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));

/** Every directory the watchdog and broker load code from: the workspace packages, read as source, the installed
 *  dependencies, and the directory the image keeps its workspace-package links in.
 *
 *  @remarks
 *  Security: Node checks a read against the lexically normalized path, but the kernel follows a link before it
 *  applies `..`. A granted tree that holds a link pointing to a shallower directory therefore grants more than it
 *  names: under a pnpm install, `node_modules/@orb/server/../../data` passes as `node_modules/data` and opens the
 *  data dir. The image keeps those links at `/node_modules/@orb`, the same depth as their `/app/packages/<name>`
 *  targets, and its build refuses any other link that points up (`docker/assemble-runtime.sh`). A pnpm install on
 *  bare metal keeps them in `node_modules` and in every package; `docs/law/container-deployment-security.md` names
 *  that residual. */
export const PLUGIN_PROCESS_CODE_ROOTS: readonly string[] = [
  join(WORKSPACE_ROOT, "packages"),
  join(WORKSPACE_ROOT, "node_modules"),
  join(parse(WORKSPACE_ROOT).root, "node_modules", "@orb"),
];

const PERMISSION = "--permission";
// The permission model does not gate `node:sqlite`: a guest that reached it could open the app's database
// read-only, outside every `--allow-fs-read` grant. Neither process needs sqlite, so the builtin is removed. This
// disables the builtin for the isolate, and a guest Worker inherits it.
const DENY_SQLITE = "--no-experimental-sqlite";
// Each grant below prints a warning on every start. They are deliberate and the text names nothing to act on.
const QUIET_GRANT_WARNINGS = ["--disable-warning=SecurityWarning", "--disable-warning=ExperimentalWarning"];

function readGrants(paths: readonly string[]): string[] {
  return paths.map((path) => `--allow-fs-read=${path}`);
}

/** The watchdog reads its own code and spawns the broker, which starts under {@link pluginBrokerExecArgv}. */
export function pluginWatchdogExecArgv(): string[] {
  return [PERMISSION, DENY_SQLITE, ...readGrants(PLUGIN_PROCESS_CODE_ROOTS), "--allow-child-process", ...QUIET_GRANT_WARNINGS];
}

/** The broker reads its code and the token in `brokerDirectory`, binds its socket there, and starts guest Workers,
 *  which inherit these limits. `--allow-net` is all or nothing on Node 26 and the socket needs it. It spawns nothing.
 *  The guest Worker's logger loads `foundation/env`, whose container check calls `existsSync` on the marker files;
 *  under the permission model that call throws on an ungranted path instead of answering false.
 *  @param brokerDirectory - the private directory holding the token file and, on POSIX, the socket. */
export function pluginBrokerExecArgv(brokerDirectory: string): string[] {
  return [
    PERMISSION,
    DENY_SQLITE,
    ...readGrants([...PLUGIN_PROCESS_CODE_ROOTS, ...CONTAINER_MARKER_FILES, brokerDirectory]),
    `--allow-fs-write=${brokerDirectory}`,
    "--allow-worker",
    "--allow-net",
    ...QUIET_GRANT_WARNINGS,
  ];
}
