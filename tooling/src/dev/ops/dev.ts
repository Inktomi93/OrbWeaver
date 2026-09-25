// `pnpm dev`: the watched server and the vite client from source, in the foreground, on any platform (D252).
// No shell, no bash and no POSIX binary: every spawn is node plus a JS file, and the terminal is the
// supervisor. The first child to exit, or any stop signal, stops both; the launcher exits only after both.
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import process from "node:process";
import { EnvRefusedError } from "@orb/server/foundation/env/refusal";
import PinoPretty from "pino-pretty";
import { z } from "zod";
import { print, REPO_ROOT } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import { budget } from "../../_shared/load-budget.ts";
import { warn } from "../../_shared/log.ts";
import type { ChildExit, FullPriorityChild } from "../../_shared/proc.ts";
import { spawnFullPriorityChild } from "../../_shared/proc.ts";
import { childExitCode, forwardSignalsTo } from "../../_shared/proc-signals.ts";
import { inheritedProcessEnv, processEnvValue } from "../../_shared/process-env.ts";
import type { WorkspacePackage } from "../contract/types.ts";
import prettyOptions from "../lib/pino-pretty.json" with { type: "json" };
import {
  CLIENT_PACKAGE,
  DEV_USAGE,
  devBannerLines,
  devChildEnv,
  findPackage,
  parseDevArgv,
  resolveVitePort,
  SERVER_PACKAGE,
  serverSpawnPlan,
  serverWatchRoots,
  VITE_PORT_ENV,
  viteSpawnPlan,
} from "../lib/plan.ts";

refuseDirectInvocation(import.meta.url, "pnpm dev");

const PACKAGES_DIR = join(REPO_ROOT, "packages");
// How long a stopped child may drain before SIGKILL; a quiet-box base, stretched under load.
const STOP_GRACE_MS_BASE = 10_000;
const STOP_GRACE_MS = budget(STOP_GRACE_MS_BASE);
const PACKAGE_JSON = "package.json";

const packageJsonSchema = z.object({
  name: z.string(),
  dependencies: z.record(z.string(), z.string()).optional(),
});
const viteManifestSchema = z.object({ bin: z.object({ vite: z.string() }) });

function readWorkspacePackages(): readonly WorkspacePackage[] {
  const manifests = readdirSync(PACKAGES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const dir = join(PACKAGES_DIR, entry.name);
      return { dir, manifest: packageJsonSchema.parse(JSON.parse(readFileSync(join(dir, PACKAGE_JSON), "utf8"))) };
    });
  const names = new Set(manifests.map(({ manifest }) => manifest.name));
  return manifests.map(({ dir, manifest }) => ({
    name: manifest.name,
    dir,
    workspaceDeps: Object.keys(manifest.dependencies ?? {}).filter((dep) => names.has(dep)),
  }));
}

/** vite's JS entry as the client package resolves it, read from vite's own `bin` field. */
function resolveViteBin(client: WorkspacePackage): string {
  const manifestPath = createRequire(join(client.dir, PACKAGE_JSON)).resolve(`vite/${PACKAGE_JSON}`);
  const manifest = viteManifestSchema.parse(JSON.parse(readFileSync(manifestPath, "utf8")));
  return join(dirname(manifestPath), manifest.bin.vite);
}

type ServerEnv = Awaited<typeof import("@orb/server/foundation/env")>["env"];

/** Parse the server's env with the server's own schema, before anything is spawned. Importing the module
 *  also loads `.env` from this cwd into `process.env` exactly as the server will, so both children inherit
 *  it. Under `node --watch` a boot-fatal env would leave the watcher waiting on a dead server, so a bad
 *  setting is refused here, by name, instead. */
async function preflightServerEnv(): Promise<ServerEnv | null> {
  try {
    return (await import("@orb/server/foundation/env")).env;
  } catch (error) {
    if (!(error instanceof EnvRefusedError)) {
      throw error;
    }
    warn(`dev: not starting; the server would refuse this environment (.env in ${process.cwd()}, then the shell).\n${error.message}`);
    return null;
  }
}

interface Exited {
  readonly name: string;
  readonly exit: ChildExit;
}

/** Run the two children until one exits or a stop signal arrives, then stop the other and wait for both. */
async function superviseDev(server: FullPriorityChild, vite: FullPriorityChild): Promise<number> {
  // A holder, not a `let`: the signal handler writes it, which control-flow narrowing cannot see.
  const stop: { signal: NodeJS.Signals | null } = { signal: null };
  let escalation: NodeJS.Timeout | undefined;
  // vite can hang in server.close() when stopped while its startup work is still running, so a child
  // that outlives the grace is killed rather than left holding its port.
  const armEscalation = (signal: NodeJS.Signals): void => {
    escalation ??= setTimeout(() => {
      warn(`dev: a child ignored ${signal}; sending SIGKILL.`);
      server.kill("SIGKILL");
      vite.kill("SIGKILL");
    }, STOP_GRACE_MS);
  };
  const signalBoth = (signal: NodeJS.Signals): void => {
    server.kill(signal);
    vite.kill(signal);
  };
  forwardSignalsTo(
    {
      noteStop: (signal): void => {
        stop.signal ??= signal;
        armEscalation(signal);
      },
      kill: signalBoth,
    },
    (signal, handler) => {
      process.on(signal, handler);
    },
    process.platform,
  );
  // One wait() per child: a second call after the exit event has fired would never resolve.
  const serverExit = server.wait().then((exit): Exited => ({ name: "server", exit }));
  const viteExit = vite.wait().then((exit): Exited => ({ name: "vite", exit }));
  const first = await Promise.race([serverExit, viteExit]);
  if (stop.signal === null) {
    warn(`dev: ${first.name} exited (${first.exit.error?.message ?? `code ${childExitCode(first.exit)}`}); stopping the other child.`);
    // No console event reaches the survivor here, so on win32 this kill is TerminateProcess: the survivor gets no drain.
    armEscalation("SIGTERM");
    signalBoth("SIGTERM");
  }
  await Promise.all([serverExit, viteExit]);
  clearTimeout(escalation);
  if (stop.signal !== null) {
    return childExitCode({ code: null, signal: stop.signal, error: undefined });
  }
  return first.exit.error === undefined ? childExitCode(first.exit) : EXIT.toolError;
}

/** `pnpm dev`'s whole dispatch. argv is without the node/script prefix. */
export async function runDev(argv: readonly string[]): Promise<number> {
  const parsed = parseDevArgv(argv);
  if (!parsed.ok) {
    warn(`dev: ${parsed.error}\n${DEV_USAGE}`);
    return EXIT.misuse;
  }
  const serverEnv = await preflightServerEnv();
  if (serverEnv === null) {
    return EXIT.violations;
  }
  const vitePort = resolveVitePort(processEnvValue(VITE_PORT_ENV));
  if (!vitePort.ok) {
    warn(`dev: not starting; ${vitePort.error}`);
    return EXIT.violations;
  }
  const packages = readWorkspacePackages();
  const server = findPackage(packages, SERVER_PACKAGE);
  const client = findPackage(packages, CLIENT_PACKAGE);
  const env = devChildEnv(inheritedProcessEnv(), { server: serverEnv.PORT, vite: vitePort.port });

  const serverPlan = serverSpawnPlan({ nodePath: process.execPath, server, watchRoots: serverWatchRoots(packages), cwd: process.cwd(), env });
  const vitePlan = viteSpawnPlan({ nodePath: process.execPath, viteBin: resolveViteBin(client), client, env });
  const serverChild = spawnFullPriorityChild(serverPlan.command, serverPlan.args, { cwd: serverPlan.cwd, env: { ...serverPlan.env }, stdio: "pipe-stdout" });
  // The server logs pino JSON on stdout; stderr (watch notices, stack traces) stays raw on the terminal.
  serverChild.stdout?.pipe(PinoPretty({ ...prettyOptions }));
  const viteChild = spawnFullPriorityChild(vitePlan.command, vitePlan.args, { cwd: vitePlan.cwd, env: { ...vitePlan.env }, stdio: "inherit" });
  for (const line of devBannerLines({ vitePort: vitePort.port, serverPort: serverEnv.PORT, authMode: serverEnv.AUTH_MODE })) {
    print(line);
  }
  return await superviseDev(serverChild, viteChild);
}
