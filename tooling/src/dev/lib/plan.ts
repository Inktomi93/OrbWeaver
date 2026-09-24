// Every decision `pnpm dev` makes, pure: argv, ports, watch roots, both spawn plans and the banner.
// Paths are composed with node:path and every spawn is node plus a JS file, so no plan needs a shell.
import { join } from "node:path";
import { DEV_PORTS, MAX_TCP_PORT } from "../../_shared/ports.ts";
import type { DevParse, DevSpawnPlan, PortParse, WorkspacePackage } from "../contract/types.ts";

export const DEV_USAGE = "usage: pnpm dev";

export const SERVER_PACKAGE = "@orb/server";
export const CLIENT_PACKAGE = "@orb/client";

/** The server entry inside its package. Node runs the `.ts` source directly; there is no server build. */
const SERVER_ENTRY_IN_PACKAGE = join("src", "entry", "index.ts");
const SOURCE_DIR = "src";

/** The env keys vite.config.ts reads for its port and its `/api` proxy target. */
export const VITE_PORT_ENV = "VITE_PORT";
export const VITE_API_TARGET_ENV = "VITE_API_TARGET";

export function parseDevArgv(argv: readonly string[]): DevParse {
  const [first] = argv;
  return first === undefined ? { ok: true } : { ok: false, error: `unknown argument ${JSON.stringify(first)}` };
}

/** The vite port: the env value when set, else the registry's dev default. vite.config.ts binds it with
 *  strictPort, so a malformed value is refused here instead of silently falling back. */
export function resolveVitePort(raw: string | undefined): PortParse {
  if (raw === undefined || raw === "") {
    return { ok: true, port: DEV_PORTS.vite };
  }
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > MAX_TCP_PORT) {
    return { ok: false, error: `${VITE_PORT_ENV}=${JSON.stringify(raw)} is not a TCP port (1-${MAX_TCP_PORT})` };
  }
  return { ok: true, port };
}

export function findPackage(packages: readonly WorkspacePackage[], name: string): WorkspacePackage {
  const found = packages.find((pkg) => pkg.name === name);
  if (found === undefined) {
    throw new Error(`dev: no workspace package named ${name} under packages/`);
  }
  return found;
}

/** The `src` directory of the server and of every workspace package it reaches through runtime
 *  dependencies. Watching these, and nothing under node_modules, restarts the server on any source edit
 *  it can load without restarting it when tooling touches installed files. */
export function serverWatchRoots(packages: readonly WorkspacePackage[]): readonly string[] {
  const byName = new Map(packages.map((pkg) => [pkg.name, pkg]));
  const seen = new Set<string>([SERVER_PACKAGE]);
  const queue = [findPackage(packages, SERVER_PACKAGE)];
  const roots: string[] = [];
  for (let pkg = queue.shift(); pkg !== undefined; pkg = queue.shift()) {
    roots.push(join(pkg.dir, SOURCE_DIR));
    for (const dep of pkg.workspaceDeps) {
      const next = byName.get(dep);
      if (next !== undefined && !seen.has(dep)) {
        seen.add(dep);
        queue.push(next);
      }
    }
  }
  return roots;
}

/** The env both children get: the launcher's own env (which already carries `.env`, loaded the way the
 *  server loads it) plus the vite port and a proxy target that follows the server's resolved port. */
export function devChildEnv(
  base: Readonly<Record<string, string | undefined>>,
  ports: { readonly server: number; readonly vite: number },
): Readonly<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(base)) {
    if (value !== undefined) {
      out[key] = value;
    }
  }
  out[VITE_PORT_ENV] = String(ports.vite);
  out[VITE_API_TARGET_ENV] = base[VITE_API_TARGET_ENV] ?? `http://127.0.0.1:${ports.server}`;
  return out;
}

/** The watched server: `node --watch` restarts it on a source change and keeps the log scrollback. */
export function serverSpawnPlan(opts: {
  readonly nodePath: string;
  readonly server: WorkspacePackage;
  readonly watchRoots: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
}): DevSpawnPlan {
  return {
    command: opts.nodePath,
    args: ["--watch", "--watch-preserve-output", ...opts.watchRoots.map((root) => `--watch-path=${root}`), join(opts.server.dir, SERVER_ENTRY_IN_PACKAGE)],
    cwd: opts.cwd,
    env: opts.env,
  };
}

/** The vite dev server, run as node plus vite's JS bin: a `.bin/vite` shim is a `.cmd` file on Windows,
 *  which node will not spawn without a shell. `--configLoader native` matches `@orb/client`'s own `dev`
 *  script; the loader is a CLI-only choice because it decides how vite.config.ts itself is loaded. */
export function viteSpawnPlan(opts: {
  readonly nodePath: string;
  readonly viteBin: string;
  readonly client: WorkspacePackage;
  readonly env: Readonly<Record<string, string>>;
}): DevSpawnPlan {
  return {
    command: opts.nodePath,
    args: [opts.viteBin, "--configLoader", "native"],
    cwd: opts.client.dir,
    env: opts.env,
  };
}

export function devBannerLines(opts: { readonly vitePort: number; readonly serverPort: number; readonly authMode: string }): readonly string[] {
  return [
    "",
    `  orbweaver dev:  http://localhost:${opts.vitePort}   (server :${opts.serverPort}, auth mode ${opts.authMode})`,
    "  Ctrl-C stops the server and the client.",
    "",
  ];
}
