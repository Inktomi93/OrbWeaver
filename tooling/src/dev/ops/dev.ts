// `pnpm dev`: the watched server and the vite client from source, in the foreground, on any platform (D252).
// No shell, no bash and no POSIX binary: every spawn is node plus a JS file, and the terminal is the
// supervisor. The server boots first and vite only once `/healthz` answers, so a client that answers means
// the stack answers. The first child to exit, or any stop signal, stops both; the launcher exits after both.
import { closeSync, createWriteStream, fstatSync, openSync, readdirSync, readFileSync, readSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { EnvRefusedError } from "@orb/server/foundation/env/refusal";
import PinoPretty from "pino-pretty";
import { z } from "zod";
import { print, REPO_ROOT } from "../../floor/artifacts/artifacts.ts";
import { buildShowcaseArtifacts, showcaseArtifactsAreCurrent } from "../../floor/artifacts/showcase-artifacts.ts";
import { refuseDirectInvocation } from "../../floor/cli/entrypoint.ts";
import { EXIT } from "../../floor/cli/exit-contract.ts";
import { warn } from "../../floor/cli/log.ts";
import { budget, budgets } from "../../floor/host/load-budget.ts";
import { httpOk } from "../../floor/http/http-probe.ts";
import type { ChildExit, FullPriorityChild } from "../../floor/process/proc.ts";
import { spawnFullPriorityChild } from "../../floor/process/proc.ts";
import { childExitCode, forwardSignalsTo } from "../../floor/process/proc-signals.ts";
import { inheritedProcessEnv, processEnvValue } from "../../floor/process/process-env.ts";
import type { DevChildName, DevLeaderHooks, WorkspacePackage } from "../contract/types.ts";
import { awaitServerReady, SERVER_HEALTHZ_BASE_MS } from "../lib/boot.ts";
import prettyOptions from "../lib/pino-pretty.json" with { type: "json" };
import {
  builtClientLine,
  CLIENT_DIST_DIR_ENV,
  CLIENT_PACKAGE,
  childExitLine,
  DEV_USAGE,
  devBannerLines,
  devChildEnv,
  findPackage,
  parseDevArgv,
  resolveVitePort,
  SERVER_PACKAGE,
  serverSpawnPlan,
  serverWatchRoots,
  servesBuiltClient,
  tailLines,
  VITE_PORT_ENV,
  viteSpawnPlan,
} from "../lib/plan.ts";

refuseDirectInvocation(import.meta.url, "pnpm dev");

const PACKAGES_DIR = join(REPO_ROOT, "packages");
// How long a stopped child may drain before SIGKILL; a quiet-box base, stretched under load.
const CEILINGS_MS = budgets({ stopGrace: 10_000 });
const PACKAGE_JSON = "package.json";
const OTHER_CHILD = { server: "vite", vite: "server" } as const satisfies Record<DevChildName, DevChildName>;
// A child's last words are a stack trace's tail or a one-line refusal; this much of its log holds either.
const EXIT_REASON_LOG_BYTES = 16_384;
const EXIT_REASON_LINES = 4;

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
  readonly name: DevChildName;
  readonly exit: ChildExit;
}

/** The stop-signal wiring for both children, armed before the first spawn so a Ctrl-C during the server's
 *  boot still reaches it. A holder, not a `let`: the signal handler writes it, which control-flow narrowing
 *  cannot see. */
interface Supervision {
  readonly stop: { signal: NodeJS.Signals | null };
  readonly attach: (child: FullPriorityChild) => void;
  readonly stopAll: (signal: NodeJS.Signals) => void;
  readonly disarm: () => void;
}

function armSupervision(): Supervision {
  const stop: { signal: NodeJS.Signals | null } = { signal: null };
  const children: FullPriorityChild[] = [];
  let escalation: NodeJS.Timeout | undefined;
  // vite can hang in server.close() when stopped while its startup work is still running, so a child
  // that outlives the grace is killed rather than left holding its port.
  const armEscalation = (signal: NodeJS.Signals): void => {
    escalation ??= setTimeout(() => {
      warn(`dev: a child ignored ${signal}; sending SIGKILL.`);
      for (const child of children) {
        child.kill("SIGKILL");
      }
    }, CEILINGS_MS.stopGrace);
  };
  const signalAll = (signal: NodeJS.Signals): void => {
    for (const child of children) {
      child.kill(signal);
    }
  };
  forwardSignalsTo(
    {
      noteStop: (signal): void => {
        stop.signal ??= signal;
        armEscalation(signal);
      },
      kill: signalAll,
    },
    (signal, handler) => {
      process.on(signal, handler);
    },
    process.platform,
  );
  return {
    stop,
    attach: (child): void => {
      children.push(child);
    },
    stopAll: (signal): void => {
      armEscalation(signal);
      signalAll(signal);
    },
    disarm: (): void => {
      clearTimeout(escalation);
    },
  };
}

/** The end of a child's log file, when this launcher writes one: a launcher on a terminal has already shown the reason. */
function logReason(name: DevChildName, hooks: DevLeaderHooks): readonly string[] {
  if (hooks.logs === undefined) {
    return [];
  }
  const fd = openSync(name === "vite" ? hooks.logs.client : hooks.logs.server, "r");
  try {
    const size = fstatSync(fd).size;
    const length = Math.min(size, EXIT_REASON_LOG_BYTES);
    const tail = Buffer.alloc(length);
    readSync(fd, tail, 0, length, size - length);
    return tailLines(tail.toString("utf8"), EXIT_REASON_LINES);
  } finally {
    closeSync(fd);
  }
}

/** Run the children until one exits or a stop signal arrives, then stop the other and wait for both. `vite` is null
 *  when none was started. */
async function superviseDev(supervision: Supervision, serverExit: Promise<Exited>, vite: FullPriorityChild | null, hooks: DevLeaderHooks): Promise<number> {
  // One wait() per child: a second call after the exit event has fired would never resolve.
  const viteExit = vite === null ? null : vite.wait().then((exit): Exited => ({ name: "vite", exit }));
  const first = viteExit === null ? await serverExit : await Promise.race([serverExit, viteExit]);
  if (supervision.stop.signal === null) {
    const survivor = viteExit === null ? null : OTHER_CHILD[first.name];
    warn(childExitLine(first.name, first.exit.error?.message ?? `code ${childExitCode(first.exit)}`, logReason(first.name, hooks), survivor));
    // No console event reaches the survivor here, so on win32 this kill is TerminateProcess: the survivor gets no drain.
    supervision.stopAll("SIGTERM");
  }
  await Promise.all([serverExit, viteExit]);
  supervision.disarm();
  return exitCodeAfter(supervision, first.exit);
}

function exitCodeAfter(supervision: Supervision, exit: ChildExit): number {
  if (supervision.stop.signal !== null) {
    return childExitCode({ code: null, signal: supervision.stop.signal, error: undefined });
  }
  return exit.error === undefined ? childExitCode(exit) : EXIT.toolError;
}

/** The server's pretty log: this terminal, or the supervisor's log file. pino-pretty owns the destination,
 *  so the file is handed to it rather than piped through it. */
function prettyDestination(hooks: DevLeaderHooks): NodeJS.WritableStream {
  return hooks.logs === undefined ? process.stdout : createWriteStream(hooks.logs.server, { flags: "a" });
}

async function runDevChildren(serverEnv: ServerEnv, vitePort: number, packages: readonly WorkspacePackage[], hooks: DevLeaderHooks): Promise<number> {
  const server = findPackage(packages, SERVER_PACKAGE);
  const client = findPackage(packages, CLIENT_PACKAGE);
  const env = devChildEnv(inheritedProcessEnv(), { server: serverEnv.PORT, vite: vitePort });

  const supervision = armSupervision();
  const serverPlan = serverSpawnPlan({
    platform: process.platform,
    nodePath: process.execPath,
    server,
    watchRoots: serverWatchRoots(packages),
    // A Playwright-owned stack is a throwaway the run drives: a source edit mid-run must not restart or stop it.
    watch: serverEnv.E2E_HARNESS !== "on",
    cwd: process.cwd(),
    env,
  });
  const serverChild = spawnFullPriorityChild(serverPlan.command, serverPlan.args, { cwd: serverPlan.cwd, env: { ...serverPlan.env }, stdio: "pipe-stdout" });
  supervision.attach(serverChild);
  // The server logs pino JSON on stdout; stderr (watch notices, stack traces) stays raw on the terminal.
  serverChild.stdout?.pipe(PinoPretty({ ...prettyOptions, destination: prettyDestination(hooks) }));
  const serverExit = serverChild.wait().then((exit): Exited => ({ name: "server", exit }));
  if (serverChild.pid !== undefined) {
    hooks.onChild?.("server", serverChild.pid);
  }
  print(`dev: booting the server on :${serverEnv.PORT}; vite starts once /healthz answers.`);
  const boot = await awaitServerReady({
    healthy: () => httpOk(`http://127.0.0.1:${serverEnv.PORT}/healthz`),
    exited: () => serverChild.hasExited(),
    ceilingMs: budget(SERVER_HEALTHZ_BASE_MS),
    sleep: async (ms) => {
      await sleep(ms);
    },
  });
  if (boot !== "ready") {
    if (boot === "timeout") {
      warn("dev: the server never answered /healthz inside its boot ceiling; stopping it.");
      supervision.stopAll("SIGTERM");
    } else if (supervision.stop.signal === null) {
      warn("dev: the server exited during boot; vite was never started.");
    }
    const { exit } = await serverExit;
    supervision.disarm();
    return boot === "timeout" ? EXIT.violations : exitCodeAfter(supervision, exit);
  }

  // A Playwright-owned stack serves its built client from the server and drives that origin, so no vite has a reader.
  const clientDistDir = processEnvValue(CLIENT_DIST_DIR_ENV);
  if (servesBuiltClient({ e2eHarness: serverEnv.E2E_HARNESS, clientDistDir })) {
    print(builtClientLine(clientDistDir ?? ""));
    return await superviseDev(supervision, serverExit, null, hooks);
  }

  const vitePlan = viteSpawnPlan({ nodePath: process.execPath, viteBin: resolveViteBin(client), client, env });
  const viteChild = spawnFullPriorityChild(vitePlan.command, vitePlan.args, {
    cwd: vitePlan.cwd,
    env: { ...vitePlan.env },
    ...(hooks.logs === undefined ? { stdio: "inherit" } : { logPath: hooks.logs.client }),
  });
  supervision.attach(viteChild);
  if (viteChild.pid !== undefined) {
    hooks.onChild?.("vite", viteChild.pid);
  }
  for (const line of devBannerLines({ vitePort, serverPort: serverEnv.PORT, authMode: serverEnv.AUTH_MODE })) {
    print(line);
  }
  return await superviseDev(supervision, serverExit, viteChild, hooks);
}

/** `pnpm dev`'s whole dispatch, and the leader body a detached supervisor runs. argv is without the
 *  node/script prefix. */
export async function runDev(argv: readonly string[], hooks: DevLeaderHooks = {}): Promise<number> {
  const parsed = parseDevArgv(argv);
  if (!parsed.ok) {
    warn(`dev: ${parsed.error}\n${DEV_USAGE}`);
    return EXIT.misuse;
  }
  if (!(showcaseArtifactsAreCurrent() || buildShowcaseArtifacts())) {
    warn("dev: showcase plugin artifact build failed; no server was started.");
    return EXIT.violations;
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
  return await runDevChildren(serverEnv, vitePort.port, readWorkspacePackages(), hooks);
}
