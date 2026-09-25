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
import { readFileSync, writeFileSync } from "node:fs";
import { join, win32 } from "node:path";
import { parseEnv } from "node:util";
import { SETUP_COMMAND } from "@orb/contracts/identity";
import { SERVER_ENTRY_REL } from "@orb/tooling/_shared/server-entry";
import {
  decideStartBuild,
  effectiveAuthMode,
  PNPM_EXECPATH_ENV,
  parseStartArgv,
  resolvePnpmInvocation,
  restateFileEnv,
  shareLaunchRefusal,
  singleUserFallbackEnv,
  startBannerLines,
  startLaunch,
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
  expect(parseStartArgv([])).toEqual({ ok: true, invocation: { build: "auto", setup: false, port: null, share: false } });
  expect(parseStartArgv(["--build"])).toEqual({ ok: true, invocation: { build: "force", setup: false, port: null, share: false } });
  expect(parseStartArgv(["--no-build"])).toEqual({ ok: true, invocation: { build: "skip", setup: false, port: null, share: false } });
  const bad = parseStartArgv(["--prod"]);
  expect(bad.ok).toBe(false);
  expect(bad.ok ? "" : bad.error).toContain("--prod");
});

test("argv: --setup asks again, and --port takes one TCP port as the next word or after =", () => {
  expect(parseStartArgv(["--setup"])).toEqual({ ok: true, invocation: { build: "auto", setup: true, port: null, share: false } });
  expect(parseStartArgv(["--port", "9000", "--no-build"])).toEqual({ ok: true, invocation: { build: "skip", setup: false, port: 9000, share: false } });
  expect(parseStartArgv(["--port=9001", "--setup"])).toEqual({ ok: true, invocation: { build: "auto", setup: true, port: 9001, share: false } });
  for (const bad of [["--port"], ["--port", "--setup"], ["--port=0"], ["--port", "65536"], ["--port=eighty"]]) {
    expect(parseStartArgv(bad).ok).toBe(false);
  }
});

test("a --port override wins over .env for this launch only, and every other .env value still wins over the shell", () => {
  const fileEnv = env(["PORT", "8788"], ["AUTH_MODE", "local"]);
  const ambient = env(["AUTH_MODE", "single-user"], ["PATH", "/bin"]);
  const overlay = restateFileEnv(fileEnv, env(["PORT", "9000"]));
  const plan = startSpawnPlan({ repoRoot: "/repo", nodePath: "/usr/bin/node", baseEnv: ambient, launchEnv: overlay, logPath: "/l" });
  // The server loads .env with override:true unless ORB_ENV_NO_OVERRIDE is set; the overlay turns that off
  // and restates the file's values on the child env, so the only value that changes is the port.
  expect(plan.env["PORT"]).toBe("9000");
  expect(plan.env["AUTH_MODE"]).toBe("local");
  expect(plan.env["ORB_ENV_NO_OVERRIDE"]).toBeDefined();
  expect(plan.env["PATH"]).toBe("/bin");
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
    launchEnv: env(["AUTH_FALLBACK", "owner"]),
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
  const plan = startSpawnPlan({ repoRoot: "/repo", nodePath: "/usr/bin/node", baseEnv: {}, launchEnv: {}, logPath: "/l" });
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
  const lines = startBannerLines({ port: 8788, mode: "single-user", fallbackFilled: true, share: false }).filter((line) => line !== "");
  expect(lines).toHaveLength(4);
  expect(lines[0]).toContain("http://localhost:8788");
  expect(lines[1]).toContain("loopback only");
  expect(lines[2]).toContain(SETUP_COMMAND);
  expect(lines[3]).toContain("Ctrl-C");
});

test("the banner tells a local-mode operator to sign in, and never claims an AUTH_FALLBACK it did not set", () => {
  const local = startBannerLines({ port: 3000, mode: "local", fallbackFilled: false, share: false }).join("\n");
  expect(local).toContain("http://localhost:3000");
  expect(local).not.toContain("AUTH_FALLBACK=owner");
  const ownFallback = startBannerLines({ port: 8788, mode: "single-user", fallbackFilled: false, share: false }).join("\n");
  expect(ownFallback).toContain("your own AUTH_FALLBACK");
});

test("a login mode already lets other devices in, so its banner never sends the operator back to setup", () => {
  for (const mode of ["local", "oidc", "forward-header"]) {
    const lines = startBannerLines({ port: 3000, mode, fallbackFilled: false, share: false }).filter((line) => line !== "");
    expect(lines.join("\n")).not.toContain(SETUP_COMMAND);
    expect(lines).toHaveLength(4);
  }
});

/** `pnpm start --share`'s launch from a `.env` text, the way ops/start.ts builds each spawn. */
function launchFrom(text: string, share: boolean, ambient = env(["PATH", "/bin"], ["AUTH_MODE", "oidc"])): ReturnType<typeof startLaunch> {
  return startLaunch({
    repoRoot: "/repo",
    nodePath: "/usr/bin/node",
    fileEnv: parseEnv(text),
    ambient,
    invocation: { build: "skip", setup: false, port: null, share },
    logPath: "/l",
  });
}

test("argv: --share asks for a shared launch, alone or beside the other flags", () => {
  expect(parseStartArgv(["--share"])).toEqual({ ok: true, invocation: { build: "auto", setup: false, port: null, share: true } });
  expect(parseStartArgv(["--no-build", "--share", "--port=9001"])).toEqual({ ok: true, invocation: { build: "skip", setup: false, port: 9001, share: true } });
});

test("--share on a just-me file restates .env, switches to local with a quick relay, and pins the bind to loopback", () => {
  const file = "PORT=8788\nAUTH_MODE=single-user\nOPENROUTER_API_KEY=sk-or-abc\n";
  const launch = launchFrom(file, true);
  // Every .env value rides the child env with the file's override off, so the file still wins over the shell.
  expect(launch.plan.env["ORB_ENV_NO_OVERRIDE"]).toBe("1");
  expect(launch.plan.env["PORT"]).toBe("8788");
  expect(launch.plan.env["OPENROUTER_API_KEY"]).toBe("sk-or-abc");
  expect(launch.plan.env["AUTH_MODE"]).toBe("local");
  expect(launch.plan.env["SHARE_RELAY"]).toBe("quick");
  expect(launch.plan.env["BIND_HOST"]).toBe("127.0.0.1");
  // `local` refuses the single-user fill at boot, and a relay host never goes into ALLOWED_HOSTS.
  expect(launch.plan.env["AUTH_FALLBACK"]).toBeUndefined();
  expect(launch.plan.env["ALLOWED_HOSTS"]).toBeUndefined();
  expect(launch.mode).toBe("local");
  expect(launch.fallbackFilled).toBe(false);
  // An empty file under a bare shell is just-me too: the schema default mode is single-user. A shell export of a login
  // mode is the box's mode when the file names none, so that box is a network box and keeps its bind.
  expect(launchFrom("", true, env(["PATH", "/bin"])).plan.env["BIND_HOST"]).toBe("127.0.0.1");
  expect(launchFrom("", true).plan.env["BIND_HOST"]).toBeUndefined();
});

test("--share on a network file keeps its own BIND_HOST and ALLOWED_HOSTS exactly as the file says", () => {
  const pinned = launchFrom("AUTH_MODE=local\nBIND_HOST=192.168.1.5\nALLOWED_HOSTS=orb.lan\n", true);
  expect(pinned.plan.env["BIND_HOST"]).toBe("192.168.1.5");
  expect(pinned.plan.env["ALLOWED_HOSTS"]).toBe("orb.lan");
  expect(pinned.plan.env["AUTH_MODE"]).toBe("local");
  expect(pinned.plan.env["SHARE_RELAY"]).toBe("quick");
  // A network file with no BIND_HOST keeps the server's own default bind.
  expect(launchFrom("AUTH_MODE=local\n", true).plan.env["BIND_HOST"]).toBeUndefined();
});

// An SSO box already signs people in its own way, and a relay breaks that way: a random relay name is never an OIDC
// redirect address, and a same-host relay would reach a forward-header box as a trusted loopback peer.
test("--share refuses an oidc or forward-header box, from the file or the shell, and never overrides its mode", () => {
  const bareShell = env(["PATH", "/bin"]);
  for (const mode of ["oidc", "forward-header"] as const) {
    expect(shareLaunchRefusal(parseEnv(`AUTH_MODE=${mode}\n`), bareShell), mode).toEqual(expect.stringContaining("--share"));
    expect(shareLaunchRefusal(parseEnv(""), env(["PATH", "/bin"], ["AUTH_MODE", mode])), mode).not.toBeNull();
    expect(launchFrom(`AUTH_MODE=${mode}\n`, true, bareShell).plan.env["AUTH_MODE"], mode).toBe(mode);
  }
});

test("control: --share on a single-user or local box is not refused", () => {
  const bareShell = env(["PATH", "/bin"]);
  for (const text of ["", "AUTH_MODE=single-user\n", "AUTH_MODE=local\n"]) {
    expect(shareLaunchRefusal(parseEnv(text), bareShell), text).toBeNull();
  }
});

test("control: a plain start leaves the env to the file, and neither launch writes a byte to .env", ({ scratch }) => {
  const envPath = join(scratch, ".env");
  const file = "# mine\r\nPORT=8788\r\nAUTH_MODE=single-user\r\n";
  writeFileSync(envPath, file);
  const plain = launchFrom(readFileSync(envPath, "utf8"), false);
  for (const key of ["ORB_ENV_NO_OVERRIDE", "SHARE_RELAY", "BIND_HOST", "PORT"]) {
    expect(plain.plan.env[key], key).toBeUndefined();
  }
  expect(plain.plan.env["AUTH_MODE"]).toBe("oidc");
  expect(plain.mode).toBe("single-user");
  launchFrom(readFileSync(envPath, "utf8"), true);
  expect(readFileSync(envPath, "utf8")).toBe(file);
});
