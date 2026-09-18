// Every DECISION `pnpm start` makes (tooling/src/stack/lib/start-plan.ts, through the tool front door):
// the build decision, the single-user AUTH_FALLBACK fill, the spawn-plan reuse, the banner and the
// platform-parameterised pnpm resolution.
//
// WHY THIS IS THE PROOF AND NOT A LIVE DRIVE: booting the real thing binds the operator's :8788 (the same
// refusal `tests/tooling/stack/index.test.ts` records for `stack up prod`), and the answers that matter
// most here are for macOS and WINDOWS — platforms this box does not have. Every platform-sensitive answer
// is therefore a value computed from `{platform, env}`, and the win32 arm is asserted from Linux with a
// `path.win32` execpath. A real Linux boot receipt (`pnpm start --no-build`, healthz, SIGINT → 130) is in
// the lane report; a macOS/Windows boot remains unverified by construction.
import { win32 } from "node:path";
import {
  childExitCode,
  decideStartBuild,
  effectiveAuthMode,
  PNPM_EXECPATH_ENV,
  parseStartArgv,
  resolvePnpmInvocation,
  SERVER_ENTRY_REL,
  singleUserFallbackEnv,
  startBannerLines,
  startSpawnPlan,
} from "../../../../tooling/src/stack/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

/** Env NAMES are SCREAMING_SNAKE, which is not a camelCase identifier — so every fixture env is built from
 *  key/value TUPLES rather than an object literal (the house idiom, lib/spawn-plan.ts's NODE_ENV). */
function env(...pairs: readonly (readonly [string, string])[]): Readonly<Record<string, string>> {
  return Object.fromEntries(pairs);
}

const FRESH = { state: "fresh", message: "client bundle is newer than client/ui source" } as const;
const STALE = { state: "stale", message: "client bundle is OLDER than client/ui source" } as const;
const MISSING = { state: "missing", message: "no packages/client/dist/index.html" } as const;

test("argv: no flags is auto, --build forces, --no-build skips, anything else is misuse", () => {
  expect(parseStartArgv([])).toEqual({ ok: true, invocation: { build: "auto" } });
  expect(parseStartArgv(["--build"])).toEqual({ ok: true, invocation: { build: "force" } });
  expect(parseStartArgv(["--no-build"])).toEqual({ ok: true, invocation: { build: "skip" } });
  const bad = parseStartArgv(["--prod"]);
  expect(bad.ok).toBe(false);
  expect(bad.ok ? "" : bad.error).toContain("--prod");
});

test("the build decision: a missing or stale bundle builds itself, a fresh one is skipped, and the flags win both ways", () => {
  expect(decideStartBuild(MISSING, "auto").run).toBe(true);
  expect(decideStartBuild(STALE, "auto").run).toBe(true);
  expect(decideStartBuild(FRESH, "auto").run).toBe(false);
  // --build forces even when nothing changed; --no-build skips even when the bundle is MISSING (the
  // caller then refuses at boot rather than building behind a flag that said not to).
  expect(decideStartBuild(FRESH, "force").run).toBe(true);
  expect(decideStartBuild(MISSING, "skip").run).toBe(false);
});

test("the build decision always says WHY, so the one printed line is never a bare verb", () => {
  expect(decideStartBuild(MISSING, "auto").reason).toContain("packages/client/dist/index.html");
  expect(decideStartBuild(FRESH, "auto").reason).toContain("up to date");
  expect(decideStartBuild(MISSING, "skip").reason).toContain("--no-build");
});

test("single-user with no AUTH_FALLBACK gets `owner` on the CHILD env — the value docker/entrypoint.sh job 2 also states", () => {
  // AUTH_MODE unset ⇒ the schema default is single-user, so the bare-metal default is filled too. Since
  // #2406 this RESTATES what the env schema resolves for the mode rather than rescuing a boot fatal; the
  // launcher keeps it so `startPostureLine` can name the posture from a value it can actually see.
  expect(singleUserFallbackEnv({}, {})).toEqual(env(["AUTH_FALLBACK", "owner"]));
  expect(singleUserFallbackEnv(env(["AUTH_MODE", "single-user"]), {})).toEqual(env(["AUTH_FALLBACK", "owner"]));
});

test("an EXPLICIT fallback is never overwritten — including `deny`, from either .env or the shell", () => {
  expect(singleUserFallbackEnv(env(["AUTH_FALLBACK", "deny"]), {})).toEqual({});
  expect(singleUserFallbackEnv({}, env(["AUTH_FALLBACK", "deny"]))).toEqual({});
  expect(singleUserFallbackEnv({}, env(["AUTH_FALLBACK", "owner"]))).toEqual({});
});

test("a non-single-user mode is left alone — local/oidc have their own credentials and the fallback is not theirs", () => {
  expect(singleUserFallbackEnv(env(["AUTH_MODE", "local"]), {})).toEqual({});
  expect(singleUserFallbackEnv({}, env(["AUTH_MODE", "oidc"]))).toEqual({});
  // `.env` wins over the shell — foundation/env loads the file with override:true.
  expect(effectiveAuthMode(env(["AUTH_MODE", "local"]), env(["AUTH_MODE", "single-user"]))).toBe("local");
  expect(singleUserFallbackEnv(env(["AUTH_MODE", "local"]), env(["AUTH_MODE", "single-user"]))).toEqual({});
});

test("the spawn is the SHARED prod plan — same argv and cwd, NODE_ENV=production, plus the fallback", () => {
  const plan = startSpawnPlan({
    repoRoot: "/repo",
    nodePath: "/usr/bin/node",
    baseEnv: env(["PATH", "/bin"]),
    fallbackEnv: env(["AUTH_FALLBACK", "owner"]),
    logPath: "/repo/.cache/stack/prod.log",
  });
  // Asserted against the SHARED constant, never a second literal: a fork of the prod spawn is the defect
  // this test exists to catch (`buildProdSpawnPlan` is the one home — there is no server build step).
  expect(plan.args).toEqual([`/repo/${SERVER_ENTRY_REL}`]);
  expect(plan.command).toBe("/usr/bin/node");
  expect(plan.cwd).toBe("/repo");
  expect(plan.env["NODE_ENV"]).toBe("production");
  expect(plan.env["AUTH_FALLBACK"]).toBe("owner");
});

test("with no fallback to fill, the child env carries no AUTH_FALLBACK at all", () => {
  const plan = startSpawnPlan({ repoRoot: "/repo", nodePath: "/usr/bin/node", baseEnv: {}, fallbackEnv: {}, logPath: "/l" });
  expect(plan.env["AUTH_FALLBACK"]).toBeUndefined();
});

test("pnpm resolves through npm_execpath — node runs pnpm's own JS entry, which is the ONLY win32-safe spelling", () => {
  // The win32 arm, asserted from Linux: PATH there holds `pnpm.cmd`, which node refuses to spawn without
  // `shell: true` — so the answer must be `<node> <pnpm.cjs>` and never the bare name.
  const windowsExecpath = win32.join("C:\\", "Users", "stranger", "AppData", "Local", "pnpm", "pnpm.cjs");
  const onWindows = resolvePnpmInvocation({
    ambient: Object.fromEntries([[PNPM_EXECPATH_ENV, windowsExecpath]]),
    platform: "win32",
    nodePath: "C:\\Program Files\\nodejs\\node.exe",
    args: ["build"],
  });
  expect(onWindows).toEqual({ kind: "node", command: "C:\\Program Files\\nodejs\\node.exe", args: [windowsExecpath, "build"] });

  const onLinux = resolvePnpmInvocation({
    ambient: Object.fromEntries([[PNPM_EXECPATH_ENV, "/home/u/.cache/node/corepack/v1/pnpm/11.15.1/bin/pnpm.cjs"]]),
    platform: "linux",
    nodePath: "/usr/bin/node",
    args: ["build"],
  });
  expect(onLinux.kind).toBe("node");
});

test("without npm_execpath: POSIX falls back to `pnpm` on PATH, win32 REFUSES and names the fix", () => {
  const posix = resolvePnpmInvocation({ ambient: {}, platform: "darwin", nodePath: "/usr/local/bin/node", args: ["build"] });
  expect(posix).toEqual({ kind: "path", command: "pnpm", args: ["build"] });

  const windows = resolvePnpmInvocation({ ambient: {}, platform: "win32", nodePath: "node.exe", args: ["build"] });
  expect(windows.kind).toBe("refused");
  // A refusal that does not tell a stranger what to type is the same dead end as a spawn failure.
  expect(windows.kind === "refused" ? windows.reason : "").toContain("pnpm start");
});

test("a non-JS npm_execpath is not treated as a JS entry (a `.cmd`/shim path takes the platform arm instead)", () => {
  const shimmed = resolvePnpmInvocation({
    ambient: Object.fromEntries([[PNPM_EXECPATH_ENV, win32.join("C:\\", "npm", "pnpm.cmd")]]),
    platform: "win32",
    nodePath: "node.exe",
    args: ["build"],
  });
  expect(shimmed.kind).toBe("refused");
});

test("the banner is five short lines: the URL, who can log in, how to let another device in, and Ctrl-C", () => {
  const lines = startBannerLines({ port: 8788, mode: "single-user", fallbackFilled: true }).filter((line) => line !== "");
  expect(lines).toHaveLength(4);
  expect(lines[0]).toContain("http://localhost:8788");
  expect(lines[1]).toContain("loopback only");
  expect(lines[2]).toContain("AUTH_MODE=local");
  expect(lines[3]).toContain("Ctrl-C");
});

test("the banner tells a local-mode operator to sign in, and never claims an AUTH_FALLBACK it did not set", () => {
  const local = startBannerLines({ port: 3000, mode: "local", fallbackFilled: false }).join("\n");
  expect(local).toContain("http://localhost:3000");
  expect(local).not.toContain("AUTH_FALLBACK=owner");
  const ownFallback = startBannerLines({ port: 8788, mode: "single-user", fallbackFilled: false }).join("\n");
  expect(ownFallback).toContain("your own AUTH_FALLBACK");
});

test("the exit status is the child's — and a signal is 128+N, so Ctrl-C is 130", () => {
  expect(childExitCode({ code: 0, signal: null, error: undefined })).toBe(0);
  expect(childExitCode({ code: 7, signal: null, error: undefined })).toBe(7);
  expect(childExitCode({ code: null, signal: "SIGINT", error: undefined })).toBe(130);
  expect(childExitCode({ code: null, signal: "SIGTERM", error: undefined })).toBe(143);
});
