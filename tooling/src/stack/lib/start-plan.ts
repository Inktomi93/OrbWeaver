// Every DECISION `pnpm start` makes, pure and platform-parameterised — the portable one-command
// production launcher's half that can be proven without spawning anything (ops/start.ts performs them).
//
// WHY THE PLATFORM IS A PARAMETER: this is the one launcher a stranger on macOS or Windows runs, and
// nobody here has those boxes. Every platform-sensitive answer (which pnpm to exec, which node) is a
// value computed from `{ platform, ambient env }` rather than read from the ambient process, so the win32
// answer is unit-provable on Linux. `stack.sh` (the Linux dev supervisor: setsid, ss, /proc) is untouched;
// the cross-platform dev path is `pnpm dev` (tooling/src/dev/).

import { SETUP_COMMAND, SHARE_MODE_REFUSAL } from "@orb/contracts/identity";
import { START_SUPERVISOR, SUPERVISOR_ENV_KEY } from "@orb/kit/supervisor";
import { MAX_TCP_PORT } from "../../_shared/ports.ts";
import type {
  AnswerParse,
  DistVerdict,
  PnpmInvocation,
  ProdSpawnPlan,
  StartBuildDecision,
  StartBuildMode,
  StartInvocation,
  StartLaunch,
  StartParse,
} from "../contract/types.ts";
import {
  AUTH_MODE_KEY,
  BIND_HOST_KEY,
  currentAudience,
  currentAuthMode,
  effectiveAuthMode,
  PASSWORD_MODE,
  PORT_KEY,
  parsePortAnswer,
  SINGLE_USER_MODE,
} from "./setup-plan.ts";
import { buildProdSpawnPlan, CLIENT_DIST_INDEX_REL } from "./spawn-plan.ts";

const SETUP_FLAG = "--setup";
const PORT_FLAG = "--port";
const SHARE_FLAG = "--share";

export const START_USAGE = `usage: pnpm start [--build | --no-build] [${SETUP_FLAG}] [${PORT_FLAG} <n>] [${SHARE_FLAG}]`;

/** The server's switch that starts the zero-account relay at boot; the server owns the relay and its host. */
const SHARE_RELAY_KEY = "SHARE_RELAY";
const SHARE_RELAY_QUICK = "quick";
/** A just-me box shared in `local` binds loopback: production `local` otherwise listens on every interface, which
 *  would open the LAN over plain http beside the relay. */
const LOOPBACK_BIND = "127.0.0.1";

/** The server's switch that stops `.env` overriding the process env (foundation/env reads it at load). */
const ENV_NO_OVERRIDE = "ORB_ENV_NO_OVERRIDE";

/** pnpm's JS entry, however this process was launched. A `.cjs`/`.js`/`.mjs` tail is the whole test:
 *  `npm_execpath` is set by every package manager to the file IT was started from. */
const JS_ENTRY = /\.(?:c|m)?js$/u;

/** The env key pnpm (and npm/yarn) sets to the absolute path of its own JS entry when it runs a script. */
export const PNPM_EXECPATH_ENV = "npm_execpath";

const BUILD_FLAGS: ReadonlyMap<string, StartBuildMode> = new Map([
  ["--build", "force"],
  ["--no-build", "skip"],
]);

function parsePortFlag(raw: string | undefined): AnswerParse<number> {
  const parsed = raw === undefined || raw === "" ? null : parsePortAnswer(raw, MAX_TCP_PORT);
  return parsed?.ok === true ? parsed : { ok: false, error: `${PORT_FLAG} needs a port from 1 to ${MAX_TCP_PORT}` };
}

/** Parse `pnpm start`'s flags. `--port` takes its value as the next word or after `=`. */
export function parseStartArgv(argv: readonly string[]): StartParse {
  const rest = argv.flatMap((arg) => (arg.startsWith(`${PORT_FLAG}=`) ? [PORT_FLAG, arg.slice(PORT_FLAG.length + 1)] : [arg]));
  let build: StartBuildMode = "auto";
  let setup = false;
  let port: number | null = null;
  let share = false;
  for (let arg = rest.shift(); arg !== undefined; arg = rest.shift()) {
    const buildMode = BUILD_FLAGS.get(arg);
    if (buildMode !== undefined) {
      build = buildMode;
    } else if (arg === SETUP_FLAG) {
      setup = true;
    } else if (arg === SHARE_FLAG) {
      share = true;
    } else if (arg === PORT_FLAG) {
      const parsed = parsePortFlag(rest.shift());
      if (!parsed.ok) {
        return { ok: false, error: parsed.error };
      }
      port = parsed.value;
    } else {
      return { ok: false, error: `unknown argument ${JSON.stringify(arg)}` };
    }
  }
  return { ok: true, invocation: { build, setup, port, share } };
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

/** The child env for a launch that overrides `.env` values (`--port <n>`, `--share`) without writing the file.
 *
 *  `.env` loads with override:true, so a value in the file would beat the same key on the child env. The overlay turns
 *  the override off for this launch and restates every `.env` value on the child env, so the file still wins over the
 *  shell for every key except the overridden ones. */
export function restateFileEnv(
  fileEnv: Readonly<Record<string, string | undefined>>,
  overrides: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  const restated = Object.entries(fileEnv).flatMap(([key, value]) => (value === undefined ? [] : [[key, value] as const]));
  return Object.fromEntries([...restated, ...Object.entries(overrides), [ENV_NO_OVERRIDE, "1"]]);
}

// The refusals `--share` answers with itself: the sign-in modes that already sign people in their own way, which a
// relay would break. Single-user is the one refused mode the launcher fixes instead (see `shareOverrides`).
type SsoShareRefusal = Exclude<(typeof SHARE_MODE_REFUSAL)[keyof typeof SHARE_MODE_REFUSAL], "share_single_user" | null>;

function ssoShareRefusal(code: SsoShareRefusal): string {
  switch (code) {
    case "share_oidc":
      return "--share refused: your identity provider sends people back only to the addresses in OIDC_REDIRECT_URIS, and a relay's random name is never one of them, so no one could sign in through it. Friends join at that address with an invite link; run pnpm start without --share.";
    case "share_forward_header":
      return "--share refused: a relay on this machine reaches the app from loopback, and forward-header mode trusts a loopback proxy to name the user, so a visitor could claim any account. Friends reach this server through your auth proxy; run pnpm start without --share.";
    default: {
      const exhaustive: never = code;
      return exhaustive;
    }
  }
}

/** Why `--share` cannot serve this box, or null. An oidc or forward-header box is refused and keeps its mode; a
 *  single-user box is not refused, because `--share` starts that run in the local sign-in mode. */
export function shareLaunchRefusal(
  fileEnv: Readonly<Record<string, string | undefined>>,
  ambient: Readonly<Record<string, string | undefined>>,
): string | null {
  const refusal = SHARE_MODE_REFUSAL[currentAuthMode(fileEnv, ambient)];
  return refusal === null || refusal === "share_single_user" ? null : ssoShareRefusal(refusal);
}

/** What `--share` overrides: the relay, and on a just-me box the login mode and a loopback bind. A single-user box
 *  runs this launch in the local sign-in mode, its documented path; any other box keeps its mode and bind (an SSO box
 *  never gets here: {@link shareLaunchRefusal}). `ALLOWED_HOSTS` is never touched: the relay host lives in the server's
 *  relay registry, so a relay restart under a new name cannot be refused. */
function shareOverrides(
  fileEnv: Readonly<Record<string, string | undefined>>,
  ambient: Readonly<Record<string, string | undefined>>,
): readonly (readonly [string, string])[] {
  // A relayed visitor is never the owner, so single-user would answer 401 to every friend: a share signs in.
  const justMe = currentAudience(fileEnv, ambient) === "just-me";
  const signIn = justMe ? [[AUTH_MODE_KEY, PASSWORD_MODE] as const, [BIND_HOST_KEY, LOOPBACK_BIND] as const] : [];
  return [[SHARE_RELAY_KEY, SHARE_RELAY_QUICK], ...signIn];
}

/** The `.env` values this invocation's flags override for the launch. */
function launchOverrides(
  invocation: StartInvocation,
  fileEnv: Readonly<Record<string, string | undefined>>,
  ambient: Readonly<Record<string, string | undefined>>,
): Readonly<Record<string, string>> {
  const port = invocation.port === null ? [] : [[PORT_KEY, String(invocation.port)] as const];
  const share = invocation.share ? shareOverrides(fileEnv, ambient) : [];
  return Object.fromEntries([...port, ...share]);
}

/** One launch from the `.env` read for it: the single-user fill, the flags' overrides and the supervisor marker on the
 *  child env. The supervisor calls this on every spawn, so a restart after a mode change drops a stale fill. */
export function startLaunch(opts: {
  readonly repoRoot: string;
  readonly nodePath: string;
  readonly fileEnv: Readonly<Record<string, string | undefined>>;
  readonly ambient: Readonly<Record<string, string | undefined>>;
  readonly invocation: StartInvocation;
  readonly logPath: string;
}): StartLaunch {
  const overrides = launchOverrides(opts.invocation, opts.fileEnv, opts.ambient);
  // The file as the server will read it: the overrides win over the file, so the mode is decided by both.
  const fileView = { ...opts.fileEnv, ...overrides };
  const fallbackEnv = singleUserFallbackEnv(fileView, opts.ambient);
  const restated = Object.keys(overrides).length === 0 ? {} : restateFileEnv(opts.fileEnv, overrides);
  const plan = startSpawnPlan({
    repoRoot: opts.repoRoot,
    nodePath: opts.nodePath,
    baseEnv: opts.ambient,
    launchEnv: { ...fallbackEnv, ...restated, ...Object.fromEntries([[SUPERVISOR_ENV_KEY, START_SUPERVISOR]]) },
    logPath: opts.logPath,
  });
  return { plan, mode: effectiveAuthMode(fileView, opts.ambient), fallbackFilled: Object.keys(fallbackEnv).length > 0 };
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
 *  launcher too. The launch env rides in as part of the BASE env rather than as a second
 *  overlay: `buildProdSpawnPlan`'s overlay slot belongs to `--debug`, and there is exactly one env here. */
export function startSpawnPlan(opts: {
  readonly repoRoot: string;
  readonly nodePath: string;
  readonly baseEnv: Readonly<Record<string, string | undefined>>;
  readonly launchEnv: Readonly<Record<string, string>>;
  readonly logPath: string;
}): ProdSpawnPlan {
  return buildProdSpawnPlan({
    repoRoot: opts.repoRoot,
    nodePath: opts.nodePath,
    baseEnv: { ...opts.baseEnv, ...opts.launchEnv },
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
export function startBannerLines(opts: {
  readonly port: number;
  readonly mode: string;
  readonly fallbackFilled: boolean;
  readonly share: boolean;
}): readonly string[] {
  const posture = startPostureLine(opts.mode, opts.fallbackFilled);
  return ["", `  orbweaver is running:  http://localhost:${opts.port}`, `  ${posture}`, reachLine(opts), "  Ctrl-C stops the server.", ""];
}

/** How another device gets in: the share link, this machine's address under a login mode, or the setup command
 *  that turns a login on. */
function reachLine(opts: { readonly port: number; readonly mode: string; readonly share: boolean }): string {
  if (opts.share) {
    return "  sharing: the server starts a public link and prints it; anyone with the link reaches the sign-in page.";
  }
  if (opts.mode !== SINGLE_USER_MODE) {
    return `  other devices: open this machine's address on port ${String(opts.port)}; put HTTPS in front, or the login travels in clear.`;
  }
  return `  other devices need a login: run \`${SETUP_COMMAND}\`; put HTTPS in front, or the login travels in clear.`;
}
