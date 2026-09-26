// ── `pnpm start` — run the production app from a checkout, on ANY platform, with ONE command ─────────
//
//   pnpm start                boot production (building the client bundle first only if it needs it)
//   pnpm start --build        force the client build first
//   pnpm start --no-build     never build (refuses if there is no bundle — prod boot would throw)
//   pnpm start --setup        ask the setup questions again (ops/setup.ts); a first run in a terminal asks anyway
//   pnpm start --port <n>     bind <n> for this launch only; `.env` is not written
//   pnpm start --share        (alias `pnpm share`) this launch with a public relay, a single-user box in `local` mode;
//                             an oidc or forward-header box refuses; `.env` is not written
//
// A start in a terminal opens the app in the default browser once the server first answers `/healthz`, once per
// invocation; `OPEN_BROWSER=off` in `.env` turns that off, and a start with no terminal never opens one.
//
// A server that exits with `RESTART_EXIT_CODE` (@orb/kit/supervisor) is spawned again from a re-read `.env`
// (lib/supervisor.ts); the setup pass and the build run once per invocation, never per respawn.
//
// THE AUDIENCE IS A STRANGER on macOS, Windows or Linux with node 26, pnpm and a clone: it builds the
// client when needed, asks the setup questions once, and fills the single-user fallback so the banner can
// say who can log in (the schema resolves the same value; the fill only makes the posture legible).
//
// PORTABILITY IS THE CONTRACT, so nothing here may reach for a POSIX-ism:
//   • every spawn is `shell: false` with an argv array (no shell string, no quoting, no injection door);
//   • node is `process.execPath`, pnpm is resolved per platform (`_shared/platform.ts` `pnpmInvocation`);
//   • this launcher stays in the FOREGROUND, so the terminal IS the supervisor and there is no pidfile, no
//     port probe and no process table to read;
//   • paths are composed with node:path, and the server spawn is the SHARED `buildProdSpawnPlan`.
// What cannot be proven here is a macOS/Windows BOOT — this box is Linux. The substitutes are `shell:
// false` everywhere and platform-parameterised units for the win32 pnpm answer and the win32 stop signal.
//
// FULL PRIORITY, deliberately (policy `tooling-child-process-door`, reviewed grant
// `tooling-child-process-door:stack-start`): the child spawned here IS the application serving the
// operator's requests. The niced doors are also structurally unavailable — they exec the POSIX `nice`
// binary, which does not exist on Windows.
import { hostname, networkInterfaces } from "node:os";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { SETUP_COMMAND } from "@orb/contracts/identity";
import { print, REPO_ROOT } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import { httpOk } from "../../_shared/http-probe.ts";
import { warn } from "../../_shared/log.ts";
import { isWsl2, openUrl, pnpmInvocation } from "../../_shared/platform.ts";
import { spawnFullPriorityChild, spawnFullPrioritySync } from "../../_shared/proc.ts";
import type { SetupMachine, SetupResult, StartInvocation, StartSpawn } from "../contract/types.ts";
import { CLIENT_DIST_INDEX_REL } from "../lib/spawn-plan.ts";
import { healthzUrl } from "../lib/stack-plan.ts";
import { decideStartBuild, parseStartArgv, START_USAGE, shareLaunchRefusal, startBannerLines, startBrowser, startLaunch } from "../lib/start-plan.ts";
import { superviseStart } from "../lib/supervisor.ts";
import { AMBIENT, ENV_FILE_PATH, LOG_PATH, readEnvFile, resolvePort } from "./prod-state.ts";
import { distVerdict } from "./prod-support.ts";
import { runSetup } from "./setup.ts";

refuseDirectInvocation(import.meta.url, "pnpm start");

/** How often the browser open asks whether the server answers yet. */
const SERVED_POLL_MS = 500;

function log(message: string): void {
  print(`start: ${message}`);
}

/** A person at the terminal: setup may ask questions, and the app may open in their browser. */
function interactive(): boolean {
  return process.stdin.isTTY === true && process.stdout.isTTY === true;
}

/** Run the root `pnpm build` (the ui tokens build + the client's vite build). Returns an exit code when the
 *  caller must stop, `null` when the build succeeded. */
function runBuild(): number | null {
  const pnpm = pnpmInvocation({ ambient: AMBIENT, platform: process.platform, nodePath: process.execPath, args: ["build"] });
  if (pnpm.kind === "refused") {
    warn(`start: ${pnpm.reason}`);
    return EXIT.toolError;
  }
  const res = spawnFullPrioritySync(pnpm.command, [...pnpm.args], { cwd: REPO_ROOT, stdio: "inherit" });
  if (res.status !== 0) {
    warn("start: the build FAILED — nothing was started. Fix the build output above and re-run `pnpm start`.");
    return EXIT.violations;
  }
  return null;
}

function thisMachine(): SetupMachine {
  return { hostname: hostname(), interfaces: networkInterfaces(), wsl: isWsl2() };
}

/** What each setup outcome means for the launch: an exit code to stop with, or `null` to go on. */
const SETUP_OUTCOMES: Record<SetupResult["kind"], () => number | null> = {
  refuse: () => {
    warn(`start: --setup asks questions, and there is no terminal to ask in. Run \`${SETUP_COMMAND}\` in a terminal.`);
    return EXIT.misuse;
  },
  cancelled: () => {
    warn("start: setup stopped; nothing was written and nothing was started.");
    return EXIT.violations;
  },
  defaults: () => {
    log(
      `no .env and no terminal to ask in: nothing was written, and the banner below shows the settings in force. To change them, run \`${SETUP_COMMAND}\` in a terminal.`,
    );
    return null;
  },
  keep: () => null,
  written: () => null,
};

/** The setup pass before anything is built or started. Returns an exit code when the launch must stop. */
async function prepareEnvFile(setup: boolean): Promise<number | null> {
  const result = await runSetup({
    envPath: ENV_FILE_PATH(),
    setup,
    interactive: interactive(),
    input: process.stdin,
    output: process.stdout,
    ambient: AMBIENT,
    machine: thisMachine(),
  });
  return SETUP_OUTCOMES[result.kind]();
}

/** Everything before the first spawn, once per invocation: the setup pass, the build, the bundle check. Returns an
 *  exit code when the launch must stop. */
async function prepareLaunch(invocation: StartInvocation): Promise<number | null> {
  const stop = await prepareEnvFile(invocation.setup);
  if (stop !== null) {
    return stop;
  }
  // After the setup pass, so the mode is the one this launch would boot in.
  const shareRefused = invocation.share ? shareLaunchRefusal(readEnvFile(), AMBIENT) : null;
  if (shareRefused !== null) {
    warn(`start: ${shareRefused}`);
    return EXIT.misuse;
  }
  const decision = decideStartBuild(distVerdict(), invocation.build);
  log(decision.reason);
  if (decision.run) {
    const buildStop = runBuild();
    if (buildStop !== null) {
      return buildStop;
    }
  }
  // Re-read after the build: production boot THROWS without dist/index.html (entry/http/spa.ts
  // `resolveSpaDistDir`), so an absent bundle is refused here with the command that fixes it rather than
  // as a stack trace 200ms into a boot the operator is watching.
  if (distVerdict().state === "missing") {
    warn(`start: there is no ${CLIENT_DIST_INDEX_REL} and --no-build was given — production boot would throw. Re-run \`pnpm start\` without --no-build.`);
    return EXIT.violations;
  }
  return null;
}

/** One spawn's plan from `.env` as it is now, and the banner for it. The app loads the file itself; the launcher reads
 *  it for the child env overlays, the port to print and the auth mode in force. */
function launchFromFile(invocation: StartInvocation): StartSpawn {
  const fileEnv = readEnvFile();
  const launch = startLaunch({ repoRoot: REPO_ROOT, nodePath: process.execPath, fileEnv, ambient: AMBIENT, invocation, logPath: LOG_PATH() });
  const port = invocation.port ?? resolvePort(fileEnv);
  for (const line of startBannerLines({ port, mode: launch.mode, fallbackFilled: launch.fallbackFilled, share: invocation.share })) {
    print(line);
  }
  return { plan: launch.plan, port };
}

/** Poll `/healthz` until the server answers or the child it belongs to exits. The timer is unref'd, so a launcher
 *  whose server has exited never waits out a poll interval before it can exit too. */
async function served(port: number, alive: AbortSignal): Promise<boolean> {
  while (!alive.aborted) {
    if (await httpOk(healthzUrl(port))) {
      return true;
    }
    await sleep(SERVED_POLL_MS, undefined, { ref: false });
  }
  return false;
}

/** Open the app in the default browser; an opener that could not run is a notice, because the banner already printed
 *  the address. */
async function openApp(url: string): Promise<void> {
  const error = await openUrl(url);
  if (error !== undefined) {
    warn(`start: could not open a browser (${error.message}); open ${url} yourself.`);
  }
}

/** `pnpm start`'s whole dispatch. argv is WITHOUT the node/script prefix. */
export async function runStart(argv: readonly string[]): Promise<number> {
  const parsed = parseStartArgv(argv);
  if (!parsed.ok) {
    warn(`start: ${parsed.error}\n${START_USAGE}`);
    return EXIT.misuse;
  }
  const { invocation } = parsed;
  return await superviseStart({
    prepare: async () => await prepareLaunch(invocation),
    launch: () => launchFromFile(invocation),
    spawn: (plan) => spawnFullPriorityChild(plan.command, [...plan.args], { cwd: plan.cwd, env: { ...plan.env }, stdio: "inherit" }),
    register: (signal, handler) => {
      process.on(signal, handler);
    },
    notice: (message) => {
      warn(`start: ${message}`);
    },
    platform: process.platform,
    browser: () => startBrowser({ interactive: interactive(), fileEnv: readEnvFile(), ambient: AMBIENT }),
    served,
    openApp,
  });
}
