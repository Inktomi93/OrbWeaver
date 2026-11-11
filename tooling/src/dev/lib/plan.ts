// Every decision `pnpm dev` makes, pure: argv, ports, watch roots, both spawn plans and the banner.
// Paths are composed with node:path and every spawn is node plus a JS file, so no plan needs a shell.
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import type { EnvKey } from "@orb/server/foundation/env/record";
import { DEV_PORTS, MAX_TCP_PORT } from "../../floor/host/ports.ts";
import { SERVER_ENTRY_IN_PACKAGE, SERVER_NODE_FLAGS } from "../../floor/process/server-entry.ts";
import type { DevChildName, DevParse, DevSpawnPlan, PortParse, WorkspacePackage } from "../contract/types.ts";

export const DEV_USAGE = "usage: pnpm dev";

export const SERVER_PACKAGE = "@orb/server";
export const CLIENT_PACKAGE = "@orb/client";

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

/** Windows uses Node's imported-file filter so directory notifications cannot restart the server.
 *  `watch: false` plans a server that runs the loaded source to its end, for a stack a test run owns: a source edit
 *  during the run must not restart or stop the server under it. */
export function serverSpawnPlan(opts: {
  readonly platform: NodeJS.Platform;
  readonly nodePath: string;
  readonly server: WorkspacePackage;
  readonly watchRoots: readonly string[];
  readonly watch: boolean;
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
}): DevSpawnPlan {
  const watchFlags = opts.watch
    ? ["--watch", "--watch-preserve-output", ...(opts.platform === "win32" ? [] : opts.watchRoots.map((root) => `--watch-path=${root}`))]
    : [];
  return {
    command: opts.nodePath,
    args: [...SERVER_NODE_FLAGS, ...watchFlags, join(opts.server.dir, SERVER_ENTRY_IN_PACKAGE)],
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

/** The env key naming the built client directory the server serves. The server defaults it to a path, so only the
 *  process env says a launcher was told where a built client is. */
export const CLIENT_DIST_DIR_ENV = "CLIENT_DIST_DIR" satisfies EnvKey;

/**
 * A Playwright-owned stack (`E2E_HARNESS=on`) that names its built client serves it from the server, and its
 * specs drive the server origin. A dev server for it has no reader, so it is never started. A harness stack that
 * names no built client drives the operator's vite and keeps one.
 */
export function servesBuiltClient(opts: { readonly e2eHarness: string; readonly clientDistDir: string | undefined }): boolean {
  return opts.e2eHarness === "on" && opts.clientDistDir !== undefined && opts.clientDistDir !== "";
}

export function builtClientLine(clientDistDir: string): string {
  return `dev: the server serves the client built into ${clientDistDir}; vite is not started.`;
}

/** The last `count` lines of a log that say anything, with terminal colour removed. */
export function tailLines(text: string, count: number): readonly string[] {
  return stripVTControlCharacters(text)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(-count);
}

/** The line that ends a launch when a child exits unasked; the tail of its log is the reason it gives.
 *  `survivor` is the child still running that the launcher now stops, or null when none was started. */
export function childExitLine(name: DevChildName, summary: string, logTail: readonly string[], survivor: DevChildName | null): string {
  const why = logTail.length === 0 ? "" : `: ${logTail.join(" | ")}`;
  return `dev: ${name} exited (${summary})${why}${survivor === null ? "." : `; stopping ${survivor}.`}`;
}

export function devBannerLines(opts: { readonly vitePort: number; readonly serverPort: number; readonly authMode: string }): readonly string[] {
  return [
    "",
    `  orbweaver dev:  http://localhost:${opts.vitePort}   (server :${opts.serverPort}, auth mode ${opts.authMode})`,
    "  Ctrl-C stops the server and the client.",
    "",
  ];
}

/** @public The contributor workflow preloads this source in pnpm so the marker owner outlives the readiness step. */
export function devMarkerPreload(markerFile: string, markerModule: string): string {
  return `import { writeFileSync } from "node:fs";
import { mintRunMarker, inheritedRunMarker, runMarkerEnv } from ${JSON.stringify(markerModule)};
if (inheritedRunMarker() === null) {
  const marker = mintRunMarker();
  Object.assign(process.env, runMarkerEnv(marker));
  writeFileSync(${JSON.stringify(markerFile)}, marker);
}
const nodeOptions = process.env.NODE_OPTIONS;
if (nodeOptions !== undefined) {
  process.env.NODE_OPTIONS = nodeOptions.replace("--import=" + import.meta.url, "").trim();
}
`;
}
