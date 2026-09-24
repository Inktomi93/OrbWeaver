// Every DECISION `pnpm start` makes, pure and platform-parameterised — the portable one-command
// production launcher's half that can be proven without spawning anything (ops/start.ts performs them).
//
// WHY THE PLATFORM IS A PARAMETER: this is the one launcher a stranger on macOS or Windows runs, and
// nobody here has those boxes. Every platform-sensitive answer (which pnpm to exec, which node) is a
// value computed from `{ platform, ambient env }` rather than read from the ambient process, so the win32
// answer is unit-provable on Linux. `stack.sh` (the Linux dev supervisor: setsid, ss, /proc) is untouched;
// the cross-platform dev path is `pnpm dev` (tooling/src/dev/).
import type { DistVerdict, PnpmInvocation, ProdSpawnPlan, StartBuildDecision, StartBuildMode, StartParse } from "../contract/types.ts";
import { buildProdSpawnPlan, CLIENT_DIST_INDEX_REL } from "./spawn-plan.ts";

export const START_USAGE = "usage: pnpm start [--build | --no-build]";

/** pnpm's JS entry, however this process was launched. A `.cjs`/`.js`/`.mjs` tail is the whole test:
 *  `npm_execpath` is set by every package manager to the file IT was started from. */
const JS_ENTRY = /\.(?:c|m)?js$/u;

/** The env key pnpm (and npm/yarn) sets to the absolute path of its own JS entry when it runs a script. */
export const PNPM_EXECPATH_ENV = "npm_execpath";

/** The mode whose ONLY credential is the loopback owner fallback (foundation/env: AUTH_MODE's default). */
export const SINGLE_USER_MODE = "single-user";

export function parseStartArgv(argv: readonly string[]): StartParse {
  let build: StartBuildMode = "auto";
  for (const arg of argv) {
    if (arg === "--build") {
      build = "force";
    } else if (arg === "--no-build") {
      build = "skip";
    } else {
      return { ok: false, error: `unknown argument ${JSON.stringify(arg)}` };
    }
  }
  return { ok: true, invocation: { build } };
}

/** Should the client bundle be (re)built before the server boots?
 *
 *  The freshness evidence is `classifyDist`'s — the SAME mtime scan `stack up prod` warns on (dist
 *  index.html vs the newest file under packages/client/src, packages/ui/src, packages/client/public,
 *  packages/client/index.html and vite.config.ts). The DIFFERENCE is what a stranger needs: `stack`
 *  WARNS about a stale bundle and refuses a missing one with a build command to retype, while `start`
 *  just builds it. `--build` forces, `--no-build` skips — including skipping a MISSING bundle, which the
 *  caller then refuses at boot rather than silently building behind a flag that said not to. */
export function decideStartBuild(dist: DistVerdict, mode: StartBuildMode): StartBuildDecision {
  if (mode === "force") {
    return { run: true, reason: "building the client bundle (--build)" };
  }
  if (mode === "skip") {
    return { run: false, reason: `skipping the build (--no-build) — ${dist.message}` };
  }
  if (dist.state === "missing") {
    return { run: true, reason: `building the client bundle — there is no ${CLIENT_DIST_INDEX_REL} yet` };
  }
  if (dist.state === "stale") {
    return { run: true, reason: "building the client bundle — it is older than client/ui source" };
  }
  return { run: false, reason: "client bundle is up to date — skipping the build (--build forces one)" };
}

/** The effective AUTH_MODE, with `.env`'s precedence: foundation/env loads the file with `override:true`,
 *  so a value in `.env` beats a shell export, and an absent value is the schema's `single-user` default. */
export function effectiveAuthMode(fileEnv: Readonly<Record<string, string | undefined>>, ambient: Readonly<Record<string, string | undefined>>): string {
  const declared = fileEnv["AUTH_MODE"] ?? ambient["AUTH_MODE"];
  return declared === undefined || declared === "" ? SINGLE_USER_MODE : declared;
}

/** The single-user fallback the container entrypoint also states (docker/entrypoint.sh job 2), stated the
 *  same way for a bare-metal run.
 *
 *  IT IS NO LONGER LOAD-BEARING FOR BOOT, and that is deliberate (#2406): the env schema resolves an unset
 *  `AUTH_FALLBACK` per mode — `owner` under `single-user`, `deny` under every SSO mode — so this fill now
 *  RESTATES the value the server would reach anyway instead of being what keeps a bare-metal launch from
 *  the boot-fatal `single-user` + flat-`deny` pairing (#1864's cost, 2026-09-18). It is kept because it is
 *  what makes the launch's posture legible: `startPostureLine` below tells the operator, in one sentence,
 *  who can log in, and it can only say that honestly about a value this launcher can see.
 *
 *  IT GOES ON THE CHILD ENV, NEVER IN `.env` (#301): AUTH_FALLBACK is a LAUNCH-ONLY key, and `.env`'s
 *  `override:true` would carry it into every launch from this directory including dev. An explicit value
 *  from either source is left exactly as the operator set it — including `deny`. */
export function singleUserFallbackEnv(
  fileEnv: Readonly<Record<string, string | undefined>>,
  ambient: Readonly<Record<string, string | undefined>>,
): Readonly<Record<string, string>> {
  if (effectiveAuthMode(fileEnv, ambient) !== SINGLE_USER_MODE) {
    return {};
  }
  const declared = fileEnv["AUTH_FALLBACK"] ?? ambient["AUTH_FALLBACK"];
  // AUTH_FALLBACK is an ENV NAME (the platform's SCREAMING_SNAKE vocabulary), so it is set by key rather
  // than as an object-literal property — the same idiom NODE_ENV takes in ./spawn-plan.ts.
  return declared === undefined || declared === "" ? Object.fromEntries([["AUTH_FALLBACK", "owner"]]) : {};
}

/** Name the pnpm to run `pnpm build` with, for a `shell: false` spawn on any platform.
 *
 *  `npm_execpath` is the answer on all three OSes and is present for every `pnpm start`: pnpm exports the
 *  absolute path of its own `pnpm.cjs` into each script's environment, so `<this node> <pnpm.cjs> build`
 *  runs the EXACT package manager the operator invoked — no PATH lookup, no shell, no `.cmd`.
 *
 *  Only a DIRECT `node tooling/src/stack/ops/start-entry.ts` misses it. On POSIX the bare name then works
 *  (execvp finds `pnpm` on PATH). On win32 it cannot: PATH holds `pnpm.cmd`, and node refuses to spawn a
 *  `.cmd`/`.bat` without `shell: true` — which this launcher will not turn on to interpolate paths
 *  through cmd.exe. So win32 REFUSES and names the one-word fix instead of failing inside a spawn. */
export function resolvePnpmInvocation(opts: {
  readonly ambient: Readonly<Record<string, string | undefined>>;
  readonly platform: NodeJS.Platform;
  readonly nodePath: string;
  readonly args: readonly string[];
}): PnpmInvocation {
  const execPath = opts.ambient[PNPM_EXECPATH_ENV];
  if (execPath !== undefined && JS_ENTRY.test(execPath)) {
    return { kind: "node", command: opts.nodePath, args: [execPath, ...opts.args] };
  }
  if (opts.platform === "win32") {
    return {
      kind: "refused",
      reason: `cannot find pnpm to build with: ${PNPM_EXECPATH_ENV} is unset, and on Windows pnpm on PATH is a .cmd file node will not run without a shell. Run \`pnpm start\` (not \`node …/start-entry.ts\`), or build first with \`pnpm build\` and re-run with --no-build.`,
    };
  }
  return { kind: "path", command: "pnpm", args: [...opts.args] };
}

/** The production spawn, from the ONE prod spawn plan (lib/spawn-plan.ts) — identical argv, cwd and
 *  NODE_ENV to what `stack up prod` and the container run, so the no-server-build-step pin covers this
 *  launcher too. The single-user fallback rides in as part of the BASE env rather than as a second
 *  overlay: `buildProdSpawnPlan`'s overlay slot belongs to `--debug`, and there is exactly one env here. */
export function startSpawnPlan(opts: {
  readonly repoRoot: string;
  readonly nodePath: string;
  readonly baseEnv: Readonly<Record<string, string | undefined>>;
  readonly fallbackEnv: Readonly<Record<string, string>>;
  readonly logPath: string;
}): ProdSpawnPlan {
  return buildProdSpawnPlan({
    repoRoot: opts.repoRoot,
    nodePath: opts.nodePath,
    baseEnv: { ...opts.baseEnv, ...opts.fallbackEnv },
    logPath: opts.logPath,
  });
}

/** WHO CAN LOG IN, in one line. `single-user` is the default mode and the one whose reach surprises
 *  people: it has no login, so the server listens on loopback only and another device cannot connect at all
 *  (foundation/env/bind.ts). */
function startPostureLine(mode: string, fallbackFilled: boolean): string {
  if (mode !== SINGLE_USER_MODE) {
    return `mode: ${mode} — sign in as that mode configures.`;
  }
  if (fallbackFilled) {
    return "mode: single-user — you are the owner FROM THIS MACHINE (AUTH_FALLBACK=owner, loopback only); another device on your network cannot connect.";
  }
  return "mode: single-user with your own AUTH_FALLBACK — left exactly as you set it.";
}

/** The ONE banner — the URL, the login posture, and how to let another device in. Deliberately five lines:
 *  a stranger reads a wall of text as noise, and the reach rule (loopback-only) is the one fact that will
 *  otherwise surprise them from their phone. */
export function startBannerLines(opts: { readonly port: number; readonly mode: string; readonly fallbackFilled: boolean }): readonly string[] {
  const posture = startPostureLine(opts.mode, opts.fallbackFilled);
  return [
    "",
    `  orbweaver is running:  http://localhost:${opts.port}`,
    `  ${posture}`,
    "  other devices need a login: set AUTH_MODE=local in .env; put HTTPS in front, or the login travels in clear.",
    "  Ctrl-C stops the server.",
    "",
  ];
}
