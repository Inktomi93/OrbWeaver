// ── `pnpm start` — run the production app from a checkout, on ANY platform, with ONE command ─────────
//
//   pnpm start                boot production (building the client bundle first only if it needs it)
//   pnpm start --build        force the client build first
//   pnpm start --no-build     never build (refuses if there is no bundle — prod boot would throw)
//
// THE AUDIENCE IS A STRANGER on macOS, Windows or Linux with node 26, pnpm and a clone. The other
// launcher, `pnpm stack` (stack.sh), is a bash supervisor built on setsid/ss//proc — Linux only — and
// even there it made a newcomer know two more things: to `pnpm build` first, and — while AUTH_FALLBACK's
// schema default was a flat `deny` (#1864..#2406) — to export AUTH_FALLBACK=owner, because that default
// paired boot-fatally with the default AUTH_MODE=single-user. This op closes all three; #2406 also closed
// the third at the schema (unset now resolves per mode), so the fill below is now a restatement of the
// resolved value rather than the thing that makes a bare boot possible. `pnpm stack` is unchanged as the
// Linux dev path.
//
// PORTABILITY IS THE CONTRACT, so nothing here may reach for a POSIX-ism:
//   • every spawn is `shell: false` with an argv array (no shell string, no quoting, no injection door);
//   • node is `process.execPath`, pnpm is resolved per platform (lib/start-plan.ts `resolvePnpmInvocation`);
//   • no setsid/`ss`//proc: this launcher stays in the FOREGROUND, so the terminal IS the supervisor and
//     there is no pidfile, no port probe and no process table to read;
//   • paths are composed with node:path, and the server spawn is the SHARED `buildProdSpawnPlan`.
// What cannot be proven here is a macOS/Windows BOOT — this box is Linux. The substitutes are `shell:
// false` everywhere and a platform-parameterised unit for the win32 pnpm answer (tests/tooling/stack/).
//
// FULL PRIORITY, deliberately (policy `tooling-child-process-door`, reviewed grant
// `tooling-child-process-door:stack-start`): the child spawned here IS the application serving the
// operator's requests. The niced doors are also structurally unavailable — they exec the POSIX `nice`
// binary, which does not exist on Windows.
import process from "node:process";
import { print, REPO_ROOT } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import { warn } from "../../_shared/log.ts";
import { spawnFullPriorityChild, spawnFullPrioritySync } from "../../_shared/proc.ts";
import type { FullPriorityChild } from "../../_shared/proc-contract.ts";
import type { ProdSpawnPlan } from "../contract/types.ts";
import { CLIENT_DIST_INDEX_REL } from "../lib/spawn-plan.ts";
import {
  childExitCode,
  decideStartBuild,
  effectiveAuthMode,
  parseStartArgv,
  resolvePnpmInvocation,
  START_USAGE,
  singleUserFallbackEnv,
  startBannerLines,
  startSpawnPlan,
} from "../lib/start-plan.ts";
import { AMBIENT, LOG_PATH, readEnvFile, resolvePort } from "./prod-state.ts";
import { distVerdict } from "./prod-support.ts";

refuseDirectInvocation(import.meta.url, "pnpm start");

/** The signals a foreground launcher owes its child. We register our OWN handlers so a Ctrl-C does not
 *  kill this process before the server finishes its bounded drain: forward, then resolve on the child's
 *  exit and mirror its status. */
export const FORWARDED_SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"] as const;

/** Wire each forwarded signal to the child, through an injected registrar so the wiring is provable
 *  without a real process (the registrar is `process.on` in the one live call below). */
export function forwardSignalsTo(child: Pick<FullPriorityChild, "kill">, register: (signal: NodeJS.Signals, handler: () => void) => void): void {
  for (const signal of FORWARDED_SIGNALS) {
    register(signal, () => child.kill(signal));
  }
}

function log(message: string): void {
  print(`start: ${message}`);
}

/** Run the root `pnpm build` (the ui tokens build + the client's vite build). Returns an exit code when the
 *  caller must stop, `null` when the build succeeded. */
function runBuild(): number | null {
  const pnpm = resolvePnpmInvocation({ ambient: AMBIENT, platform: process.platform, nodePath: process.execPath, args: ["build"] });
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

/** The foreground production server: inherited stdio, forwarded signals, the child's own exit status. */
async function runServer(plan: ProdSpawnPlan): Promise<number> {
  const child = spawnFullPriorityChild(plan.command, [...plan.args], { cwd: plan.cwd, env: { ...plan.env }, stdio: "inherit" });
  forwardSignalsTo(child, (signal, handler) => {
    process.on(signal, handler);
  });
  const exit = await child.wait();
  if (exit.error !== undefined) {
    warn(`start: could not run the server — ${exit.error.message}`);
    return EXIT.toolError;
  }
  return childExitCode(exit);
}

/** `pnpm start`'s whole dispatch. argv is WITHOUT the node/script prefix. */
export async function runStart(argv: readonly string[]): Promise<number> {
  const parsed = parseStartArgv(argv);
  if (!parsed.ok) {
    warn(`start: ${parsed.error}\n${START_USAGE}`);
    return EXIT.misuse;
  }
  const decision = decideStartBuild(distVerdict(), parsed.invocation.build);
  log(decision.reason);
  if (decision.run) {
    const stop = runBuild();
    if (stop !== null) {
      return stop;
    }
  }
  // Re-read after the build: production boot THROWS without dist/index.html (entry/http/spa.ts
  // `resolveSpaDistDir`), so an absent bundle is refused here with the command that fixes it rather than
  // as a stack trace 200ms into a boot the operator is watching.
  if (distVerdict().state === "missing") {
    warn(`start: there is no ${CLIENT_DIST_INDEX_REL} and --no-build was given — production boot would throw. Re-run \`pnpm start\` without --no-build.`);
    return EXIT.violations;
  }
  // `.env` is read the way the app reads it (parsed once, file wins over the shell) for exactly two
  // questions: which port to print, and which auth mode is in force. The app loads the file itself.
  const fileEnv = readEnvFile();
  const fallbackEnv = singleUserFallbackEnv(fileEnv, AMBIENT);
  const plan = startSpawnPlan({ repoRoot: REPO_ROOT, nodePath: process.execPath, baseEnv: AMBIENT, fallbackEnv, logPath: LOG_PATH() });
  for (const line of startBannerLines({
    port: resolvePort(fileEnv),
    mode: effectiveAuthMode(fileEnv, AMBIENT),
    fallbackFilled: Object.keys(fallbackEnv).length > 0,
  })) {
    print(line);
  }
  return await runServer(plan);
}
