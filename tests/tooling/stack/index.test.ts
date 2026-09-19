// Unit tests for the PURE half of mode-aware stack control (tooling/src/stack/lib/, through the tool front door) — argv
// parsing, the debug env overlay + its `.env` precedence conflict, the prod spawn plan (argv/env
// SNAPSHOTS), the pidfile codec, instance-identity classification, client-dist freshness, drain
// classification and the /proc + `ss` parsers.
//
// WHY THESE ARE UNIT TESTS AND NOT A LIVE DRIVE: a real `stack up prod` binds :8788 — the SAME port the
// operator's live dev stack holds — and killing/booting it from a test would take the box down mid-run.
// [[never-run-engine-launcher-live]] in spirit: the launcher is proven by argv/env snapshots + the pure
// decision logic; the first real production launch is the owner's. This file's home is tests/tooling/ per
// core/Spine-Testing.md §2 (a test of a scripts/ tool), same as snap-stage.test.ts / snap-flags.test.ts.
import { readFileSync } from "node:fs";
import type { DevStackIdentity, ObservedInstance, ProdRecord } from "../../../tooling/src/stack/index.ts";
import {
  adoptDevStackGroup,
  adoptionText,
  buildProdSpawnPlan,
  CLIENT_DIST_INDEX_REL,
  classifyDebugPosture,
  classifyDist,
  classifyDrainTail,
  classifyInstance,
  classifyServedTransform,
  DEBUG_ENV_KEYS,
  debugConflictMessage,
  debugPostureText,
  decideDown,
  decideSpawnLock,
  decideUp,
  devStackGroupHasMembers,
  formatDispatch,
  lockHolderText,
  mayRemovePidfile,
  parseDevStackIdentity,
  parseListenerPid,
  parseLockHolder,
  parseProcStartTicks,
  parseProdRecord,
  parseStackArgv,
  resolveDebugArming,
  SERVER_DRAIN_MS,
  SERVER_ENTRY_REL,
  STACK_SPAWNERS,
  serializeProdRecord,
  servedCarriesDiskBytes,
  signalAdoptedDevStackGroup,
  signalDevStackIdentity,
  spawnerForPort,
  valueExportNames,
  verifyDevStackIdentity,
} from "../../../tooling/src/stack/index.ts";
import { expect, test } from "../../support/tool-fixtures.ts";

// Hoisted: the rule against per-call regex literals applies to test bodies too.
const DRAIN_MS_RE = /const SHUTDOWN_DRAIN_MS = ([\d_]+);/u;
/** An un-credentialed 200 from /api/_debug must print as an ALARM post-AUTHFIX-2, not as a dev posture. */
const UNCREDENTIALED_ALARM = /NO credential|investigate/u;
const MANUAL_CLEANUP_RE = /manual cleanup|relaunch/u;

const DEV_IDENTITY: DevStackIdentity = {
  version: 1,
  repoRoot: "/repo",
  pid: 4242,
  pgid: 4242,
  startTicks: "123",
  executable: "/usr/bin/bash",
  cmdlineBase64: Buffer.from("bash\0/repo/tooling/src/stack/stack.sh\0_leader\0").toString("base64"),
  cwd: "/repo",
};

test("dev-stack identity rejects corrupt, <=1, and stale/reused records before any signal", () => {
  expect(parseDevStackIdentity("garbage")).toBeNull();
  expect(parseDevStackIdentity(JSON.stringify({ ...DEV_IDENTITY, pid: 1, pgid: 1 }))).toBeNull();
  expect(verifyDevStackIdentity(DEV_IDENTITY, { readProcess: () => ({ ...DEV_IDENTITY, startTicks: "999" }) }).verdict).toBe("refused");
  const calls: number[] = [];
  expect(
    signalDevStackIdentity(DEV_IDENTITY, "SIGKILL", { readProcess: () => ({ ...DEV_IDENTITY, startTicks: "999" }), kill: (target) => calls.push(target) })
      .verdict,
  ).toBe("refused");
  expect(calls).toEqual([]);
});

test("a valid owned dev-stack group is the only shape that reaches the negative-PGID signal", () => {
  const calls: Array<readonly [number, NodeJS.Signals]> = [];
  expect(signalDevStackIdentity(DEV_IDENTITY, "SIGTERM", { readProcess: () => DEV_IDENTITY, kill: (target, signal) => calls.push([target, signal]) })).toEqual({
    verdict: "signaled",
    pgid: DEV_IDENTITY.pgid,
  });
  expect(calls).toEqual([[-DEV_IDENTITY.pgid, "SIGTERM"]]);
});

test("a dead leader refuses a stable same-group survivor without signaling it", () => {
  const survivor = { ...DEV_IDENTITY, pid: 5000 };
  const processTable = new Map<number, DevStackIdentity>([[survivor.pid, survivor]]);
  const calls: Array<readonly [number, NodeJS.Signals]> = [];
  expect(
    signalDevStackIdentity(DEV_IDENTITY, "SIGTERM", {
      readProcess: (pid) => processTable.get(pid) ?? null,
      kill: (target, signal) => calls.push([target, signal]),
    }),
    // #1162 renamed this arm from `refused` to `departed` — a distinct verdict, because it is the ONLY
    // refusal with a remaining answerable question (does the GROUP still hold a member?). The RULING is
    // untouched: a dead leader still signals nothing, and the reason still demands manual cleanup.
  ).toEqual({ verdict: "departed", pgid: DEV_IDENTITY.pgid, reason: expect.stringMatching(MANUAL_CLEANUP_RE) });
  expect(calls).toEqual([]);
  expect(verifyDevStackIdentity(DEV_IDENTITY, { readProcess: () => ({ ...DEV_IDENTITY, startTicks: "reused" }) }).verdict).toBe("refused");
});

// ── argv ─────────────────────────────────────────────────────────────────────────────────────────────

test("a bare invocation is `status dev` — the pre-mode default", () => {
  expect(parseStackArgv([])).toEqual({ ok: true, invocation: { verb: "status", mode: "dev", debug: false, build: false, force: false, rest: [] } });
});

test("every pre-mode call site parses to exactly what it did before modes existed", () => {
  // These three are spelled by NAME in playwright.config.ts, snap-stage.ts and multi-user-fixture.sh —
  // a regression here silently breaks the e2e battery and the visual-review stage.
  expect(parseStackArgv(["start"])).toEqual({ ok: true, invocation: { verb: "up", mode: "dev", debug: false, build: false, force: false, rest: [] } });
  expect(parseStackArgv(["stop"])).toEqual({ ok: true, invocation: { verb: "down", mode: "dev", debug: false, build: false, force: false, rest: [] } });
  expect(parseStackArgv(["restart", "--force"])).toEqual({
    ok: true,
    invocation: { verb: "restart", mode: "dev", debug: false, build: false, force: true, rest: [] },
  });
  expect(parseStackArgv(["force-restart"])).toEqual({
    ok: true,
    invocation: { verb: "restart", mode: "dev", debug: false, build: false, force: true, rest: [] },
  });
  expect(parseStackArgv(["logs", "server", "80"])).toEqual({
    ok: true,
    invocation: { verb: "logs", mode: "dev", debug: false, build: false, force: false, rest: ["server", "80"] },
  });
});

test("mode is positional and debug is orthogonal to it", () => {
  expect(parseStackArgv(["up", "prod"])).toMatchObject({ ok: true, invocation: { verb: "up", mode: "prod", debug: false } });
  expect(parseStackArgv(["up", "--debug"])).toMatchObject({ ok: true, invocation: { verb: "up", mode: "dev", debug: true } });
  expect(parseStackArgv(["up", "prod", "--debug"])).toMatchObject({ ok: true, invocation: { verb: "up", mode: "prod", debug: true } });
  expect(parseStackArgv(["restart", "prod", "--debug", "--build"])).toMatchObject({
    ok: true,
    invocation: { verb: "restart", mode: "prod", debug: true, build: true },
  });
});

test("--build is refused in dev — the vite dev server needs no bundle", () => {
  expect(parseStackArgv(["up", "--build"])).toEqual({ ok: false, error: expect.stringContaining("--build is prod-only") });
});

test("an unknown verb or flag is a parse ERROR, never a silently-ignored word", () => {
  expect(parseStackArgv(["frobnicate"])).toMatchObject({ ok: false });
  expect(parseStackArgv(["up", "prod", "--dbeug"])).toMatchObject({ ok: false });
});

// ── the debug overlay + `.env` precedence ────────────────────────────────────────────────────────────

test("--debug arms every declared debug knob when .env is silent", () => {
  const arming = resolveDebugArming({ fileEnv: {}, token: "tok-abc" });
  expect(arming).toEqual({ kind: "armed", token: "tok-abc", notes: [], overlay: { DEBUG_TOKEN: "tok-abc", WIRE_CAPTURE: "on", RPG_TRACE: "on" } });
});

test("a .env that already declares the SAME armed value is adopted, not re-armed", () => {
  // foundation/env loads .env with override:true, so the file wins — re-arming would be a no-op. Report
  // the arming SOURCE instead of pretending the overlay did it.
  const arming = resolveDebugArming({ fileEnv: { WIRE_CAPTURE: "on", DEBUG_TOKEN: "operator-token" }, token: "minted" });
  expect(arming.kind).toBe("armed");
  if (arming.kind !== "armed") {
    return;
  }
  expect(arming.token).toBe("operator-token");
  expect(arming.overlay).toEqual({ RPG_TRACE: "on" });
  expect(arming.notes.join(" ")).toContain("already");
});

test("a CONFLICTING .env value REFUSES — --debug must never be a silent placebo", () => {
  const arming = resolveDebugArming({ fileEnv: { WIRE_CAPTURE: "off" }, token: "tok" });
  expect(arming).toEqual({ kind: "refused", conflicts: [{ key: "WIRE_CAPTURE", fileValue: "off", wanted: "on" }] });
});

test("an EMPTY .env value is a conflict, not absence — the exact placebo the refusal exists for", () => {
  // A bare `DEBUG_TOKEN=` line parses to "", not undefined, and `loadEnvFileWithOverride` overrides on
  // `value !== undefined` — so the empty file value BEATS the overlay, and the schema's `.min(1)`
  // then leaves the surface off. Treating "" as absence reported "armed" over a dead surface.
  const arming = resolveDebugArming({ fileEnv: { DEBUG_TOKEN: "" }, token: "s3cr3t-token-value" });
  expect(arming.kind).toBe("refused");
  if (arming.kind !== "refused") {
    return;
  }
  expect(arming.conflicts).toHaveLength(1);
  expect(arming.conflicts[0]?.key).toBe("DEBUG_TOKEN");
  expect(arming.conflicts[0]?.fileValue).toBe("");
  // The message names the file value and the line to delete, and must NOT echo the minted token.
  const message = debugConflictMessage(arming.conflicts);
  expect(message).toContain("DEBUG_TOKEN");
  expect(message).not.toContain("s3cr3t-token-value");
});

test("an empty WIRE_CAPTURE/RPG_TRACE value is a conflict too", () => {
  const arming = resolveDebugArming({ fileEnv: { WIRE_CAPTURE: "", RPG_TRACE: "" }, token: "tok" });
  expect(arming.kind).toBe("refused");
});

// ── the shell dispatch contract ──────────────────────────────────────────────────────────────────────

test("--force and the setsid leader are REFUSED in prod, but start-fg (FOREGROUND prod) is accepted", () => {
  // `--force` reaches stack.sh's do_force_restart, which SIGKILLs the port holders AND the detached vLLM
  // fleet ignoring ownership. Prod's whole safety story is that it only signals what it can prove is its
  // own, so there is no prod force. `_leader` is the dev-only setsid re-exec target (prod has no leader).
  // Dropping either quietly would be the same defect class as the shell falling through to dev.
  expect(parseStackArgv(["restart", "prod", "--force"])).toEqual({ ok: false, error: expect.stringContaining("--force is dev-only") });
  expect(parseStackArgv(["_leader", "prod"])).toEqual({ ok: false, error: expect.stringContaining("dev-only") });
  // …and both those stay legal in dev.
  expect(parseStackArgv(["restart", "--force"])).toMatchObject({ ok: true, invocation: { force: true, mode: "dev" } });
  expect(parseStackArgv(["start-fg"])).toMatchObject({ ok: true, invocation: { verb: "up-fg", mode: "dev" } });
  // start-fg IS valid in prod now — the FOREGROUND on-box run that replaced the removed `pnpm start`
  // (launch-centralize / #309). It is the same up-fg verb, this time carrying mode=prod.
  expect(parseStackArgv(["start-fg", "prod"])).toMatchObject({ ok: true, invocation: { verb: "up-fg", mode: "prod", debug: false } });
  expect(parseStackArgv(["start-fg", "prod", "--debug"])).toMatchObject({ ok: true, invocation: { verb: "up-fg", mode: "prod", debug: true } });
  // --build (client bundle) composes with foreground prod, exactly as with detached `up prod`.
  expect(parseStackArgv(["start-fg", "prod", "--build"])).toMatchObject({ ok: true, invocation: { verb: "up-fg", mode: "prod", build: true } });
});

test("formatDispatch emits the shell contract, one line per rest argument", () => {
  const parsed = parseStackArgv(["logs", "server", "80"]);
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) {
    return;
  }
  expect(formatDispatch(parsed.invocation)).toBe("verb=logs\nmode=dev\ndebug=\nbuild=\nforce=\nrest=server\nrest=80\n");
});

test("formatDispatch maps every verb back to a stack.sh case label", () => {
  const label = (argv: readonly string[]): string => {
    const parsed = parseStackArgv(argv);
    return parsed.ok ? (formatDispatch(parsed.invocation).split("\n")[0] ?? "") : "PARSE-FAILED";
  };
  expect(label(["up"])).toBe("verb=start");
  expect(label(["down"])).toBe("verb=stop");
  expect(label(["force-restart"])).toBe("verb=restart");
  expect(label(["start-fg"])).toBe("verb=start-fg");
  expect(label(["_leader"])).toBe("verb=_leader");
});

// ── pidfile ownership on a failed spawn ──────────────────────────────────────────────────────────────

test("the spawn lock refuses a LIVE holder, breaks a dead one, and retakes a vanished one", () => {
  // The window: adopt/refuse and spawn are separate syscalls, so two `up prod` can both read "port free"
  // and both spawn; the loser dies on EADDRINUSE after clobbering the winner's record.
  expect(decideSpawnLock({ kind: "pid", pid: 4242 }, true)).toBe("refuse");
  expect(decideSpawnLock({ kind: "pid", pid: 4242 }, false)).toBe("break-stale");
  expect(decideSpawnLock({ kind: "vanished" }, false)).toBe("retake");
});

test("an EMPTY lock file is stale, and 0 is never treated as a pid — the permanent-wedge shape", () => {
  // A crash or a short write between the `wx` create and the write leaves an empty lock file. The old
  // code did `Number("")` → 0 and probed it — but `process.kill(0, 0)` signals the caller's own process
  // GROUP and ALWAYS succeeds, so an empty file read as "a live launcher (pid 0) holds the lock" and
  // every later `up prod` no-opped forever until a human deleted the file.
  for (const raw of ["", "   ", "\n"]) {
    const holder = parseLockHolder(raw);
    expect(holder.kind).toBe("unparseable");
    // `holderAlive: true` on purpose — even a "live" verdict must not save an unparseable holder.
    expect(decideSpawnLock(holder, true)).toBe("break-stale");
  }
  expect(parseLockHolder("0").kind).toBe("unparseable");
  // Negative values are process GROUPS in kill(2), and a fraction is not a pid at all.
  expect(parseLockHolder("-1").kind).toBe("unparseable");
  expect(parseLockHolder("1.5").kind).toBe("unparseable");
});

test("a NON-NUMERIC lock file breaks stale rather than retaking a file that still exists", () => {
  // The second wedge: `retake` left the file in place, so the retry's `wx` failed again and the
  // two-attempt loop gave up with "another launcher won the race" — the lock was never removed.
  const holder = parseLockHolder("garbage");
  expect(holder).toEqual({ kind: "unparseable", raw: "garbage" });
  expect(decideSpawnLock(holder, false)).toBe("break-stale");
  expect(decideSpawnLock(holder, true)).toBe("break-stale");
});

test("a real pid parses, and every holder shape has operator-facing text", () => {
  expect(parseLockHolder("4242")).toEqual({ kind: "pid", pid: 4242 });
  expect(parseLockHolder(" 4242\n")).toEqual({ kind: "pid", pid: 4242 });
  expect(parseLockHolder(null)).toEqual({ kind: "vanished" });
  expect(lockHolderText({ kind: "pid", pid: 7 })).toContain("pid 7");
  expect(lockHolderText({ kind: "unparseable", raw: "" })).toContain("unparseable");
  expect(lockHolderText({ kind: "vanished" })).toContain("vanished");
});

test("a failed spawn may only delete a pidfile that is still ITS OWN", () => {
  // Two overlapping `up prod`: the loser's child dies on EADDRINUSE. An unconditional unlink on that
  // path deleted the WINNER's record — after which `down prod` reads no record, classifies the live
  // server as foreign, and refuses to stop the instance this tool started.
  expect(mayRemovePidfile(RECORD, RECORD.pid)).toBe(true);
  expect(mayRemovePidfile(RECORD, 9999)).toBe(false);
  expect(mayRemovePidfile(null, 4242)).toBe(false);
});

test("the debug posture is read off the gate's STATUS CODE — a 200 is not proof of a token", () => {
  // MEASURED against the live stack 2026-08-06: an unauthenticated GET /api/_debug/info returned 200,
  // because the gate's FIRST arm is an admin check and a single-user stack answered every caller as admin.
  // A probe that read "401 ⇒ armed, else off" therefore reported `off` on a stack whose debug surface was
  // wide open. Three distinct postures, no boolean.
  //
  // POSTSCRIPT (AUTHFIX-2, 2026-08-07): that measured 200 was not merely a probe-design trap — it was an
  // un-credentialed read of the whole debug surface, and it is now closed at the seam
  // (`entry/auth/seam.ts::debugGateCredentialed`). The three postures stay: `classifyDebugPosture` maps
  // status codes and must keep an arm for a 200 precisely so the tooling can still SAY so if one ever comes
  // back. What changed is the meaning — a 200 to this un-credentialed probe is now an alarm, not dev comfort.
  // Still true after #1193: this probe's only callers are the `prod-*` ops, which observe a PRODUCTION
  // process (`NODE_ENV=production` in `buildProdSpawnPlan`), and the loopback-owner arm that #1193 opened is
  // production-EXCLUDING. A dev stack answering 200 to a loopback probe is not this instrument's subject.
  expect(classifyDebugPosture(404)).toBe("off");
  expect(classifyDebugPosture(401)).toBe("token");
  expect(classifyDebugPosture(200)).toBe("open");
  expect(classifyDebugPosture(null)).toBe("unknown");
  expect(debugPostureText("token", "/run/debug-token")).toContain("/run/debug-token");
  // An un-credentialed 200 must READ as a problem, not as a normal dev posture. (The token PATH is the only
  // thing any arm prints — `debugPostureText` is never handed the VALUE, so there is nothing to leak here.)
  expect(debugPostureText("open", "/run/debug-token")).toMatch(UNCREDENTIALED_ALARM);
});

// ── the prod spawn plan (argv + env SNAPSHOTS) ───────────────────────────────────────────────────────

const BASE_ENV = { PATH: "/usr/bin", HOME: "/home/op", WIRE_CAPTURE: "on", DEBUG_TOKEN: "stale-shell-export" } as const;

test("the prod argv is `node <entry>.ts` and NOTHING else — the no-server-build-step pin", () => {
  // node 26 runs the server's TypeScript source directly (tsx was shed). If a future change ever sneaks
  // a transpile/bundle/loader step in for SERVER code, this assertion is what goes red.
  const plan = buildProdSpawnPlan({ repoRoot: "/repo", nodePath: "/usr/bin/node", baseEnv: {}, logPath: "/repo/.cache/stack/prod.log" });
  expect(plan.command).toBe("/usr/bin/node");
  expect(plan.args).toEqual(["/repo/packages/server/src/entry/index.ts"]);
  expect(plan.args).toHaveLength(1);
  expect(SERVER_ENTRY_REL.endsWith(".ts")).toBe(true);
  expect(plan.args.join(" ")).not.toContain("dist");
  // cwd-independence: both `.env` loading and CLIENT_DIST_DIR are cwd-relative (the doc's two silent traps).
  expect(plan.cwd).toBe("/repo");
});

test("without --debug the spawned prod env carries NO debug key, even from the operator's shell", () => {
  const plan = buildProdSpawnPlan({ repoRoot: "/repo", nodePath: "/n", baseEnv: BASE_ENV, logPath: "/l" });
  expect(plan.env).toEqual({ PATH: "/usr/bin", HOME: "/home/op", NODE_ENV: "production" });
  for (const key of DEBUG_ENV_KEYS) {
    expect(plan.env[key]).toBeUndefined();
  }
});

test("with --debug the overlay rides the spawn env, and only the overlay", () => {
  const plan = buildProdSpawnPlan({
    repoRoot: "/repo",
    nodePath: "/n",
    baseEnv: { PATH: "/usr/bin" },
    debugOverlay: { DEBUG_TOKEN: "tok", WIRE_CAPTURE: "on", RPG_TRACE: "on" },
    logPath: "/l",
  });
  expect(plan.env).toEqual({ PATH: "/usr/bin", NODE_ENV: "production", DEBUG_TOKEN: "tok", WIRE_CAPTURE: "on", RPG_TRACE: "on" });
});

// ── the pidfile record ───────────────────────────────────────────────────────────────────────────────

const RECORD: ProdRecord = {
  mode: "prod",
  pid: 4242,
  pgid: 4242,
  port: 8788,
  startedAt: "2026-08-06T12:00:00.000Z",
  startTicks: "998877",
  debug: false,
  repoRoot: "/repo",
  logPath: "/repo/.cache/stack/prod.log",
};

test("the pidfile round-trips, and a truncated write reads as `no record` rather than throwing", () => {
  expect(parseProdRecord(serializeProdRecord(RECORD))).toEqual(RECORD);
  expect(parseProdRecord('{"mode":"pro')).toBeNull();
  expect(parseProdRecord("")).toBeNull();
  expect(parseProdRecord('{"mode":"dev","pid":1,"port":2}')).toBeNull();
});

// ── instance identity ────────────────────────────────────────────────────────────────────────────────

const OBSERVED: ObservedInstance = { healthy: true, harness: null, listenerPid: 4242, listenerStartTicks: "998877" };

test("a matching pid AND start-time AND a healthy port is the only route to `ours-healthy`", () => {
  expect(classifyInstance({ record: RECORD, observed: OBSERVED, recordProcessAlive: true }).verdict).toBe("ours-healthy");
});

test("a HARNESS stack is untouchable — checked before anything else", () => {
  // e2e boots three stacks with E2E_HARNESS=on, and e2e-smoke runs inside `verify --push`. Adopting or
  // stopping one mid-battery is the failure this ordering exists to make impossible.
  const verdict = classifyInstance({ record: RECORD, observed: { ...OBSERVED, harness: true }, recordProcessAlive: true });
  expect(verdict.verdict).toBe("harness");
  expect(decideUp(verdict).action).toBe("refuse");
  expect(decideDown(verdict).action).toBe("refuse");
});

test("a healthy port is NOT identity — a stale incumbent on our port classifies foreign", () => {
  // [[health-check-validates-the-port-not-your-process]]: /healthz answers 200 for whoever holds :8788.
  const verdict = classifyInstance({ record: RECORD, observed: { ...OBSERVED, listenerPid: 9999, listenerStartTicks: "111" }, recordProcessAlive: true });
  expect(verdict.verdict).toBe("foreign");
  expect(decideDown(verdict).action).toBe("refuse");
});

test("a RECYCLED pid does not pass identity — start-ticks are the tiebreak", () => {
  const verdict = classifyInstance({ record: RECORD, observed: { ...OBSERVED, listenerStartTicks: "555555" }, recordProcessAlive: true });
  expect(verdict.verdict).toBe("foreign");
});

test("`up` on a verified-healthy instance ADOPTS in place — never a second spawn", () => {
  expect(decideUp(classifyInstance({ record: RECORD, observed: OBSERVED, recordProcessAlive: true }))).toEqual({ action: "adopt", reason: expect.any(String) });
});

test("an empty port with a stale pidfile is `absent` — spawn, and stop is a no-op", () => {
  const verdict = classifyInstance({
    record: RECORD,
    observed: { healthy: false, harness: null, listenerPid: null, listenerStartTicks: null },
    recordProcessAlive: false,
  });
  expect(verdict.verdict).toBe("absent");
  expect(decideUp(verdict).action).toBe("spawn");
  expect(decideDown(verdict).action).toBe("noop");
});

test("a wedged instance of OURS can still be stopped — that is what an operator needs `down` for", () => {
  const verdict = classifyInstance({ record: RECORD, observed: { ...OBSERVED, healthy: false }, recordProcessAlive: true });
  expect(verdict.verdict).toBe("ours-unhealthy");
  expect(decideDown(verdict).action).toBe("stop");
  expect(decideUp(verdict).action).toBe("refuse");
});

test("a live port with NO pidfile is foreign — this tool did not start it", () => {
  expect(classifyInstance({ record: null, observed: OBSERVED, recordProcessAlive: false }).verdict).toBe("foreign");
});

// ── the spawner census ───────────────────────────────────────────────────────────────────────────────

test("the census names the dev stack on the port prod shares with it", () => {
  // prod and dev both serve on 8788 by design (two ways to serve one app on one box); the refusal path
  // needs to be able to NAME the other one instead of printing a bare pid.
  expect(spawnerForPort(8788)?.name).toContain("dev stack");
  expect(spawnerForPort(5181)?.name).toBe("e2e single-user");
  expect(spawnerForPort(3100)?.name).toBe("playwright-ct");
  expect(spawnerForPort(65_000)).toBeUndefined();
  // No two spawners may claim the same server port except the deliberate dev/prod pair.
  const serverPorts = STACK_SPAWNERS.map((s) => s.serverPort).filter((p): p is number => p !== null);
  expect(new Set(serverPorts).size).toBe(serverPorts.length - 1);
});

// ── drain ────────────────────────────────────────────────────────────────────────────────────────────

test("the drain watch reads the server's own shutdown lines", () => {
  expect(classifyDrainTail("boot: listening\nshutdown: complete\n")).toBe("complete");
  expect(classifyDrainTail('{"msg":"shutdown: drain deadline hit — force-closing"}')).toBe("deadline-hit");
  expect(classifyDrainTail("shutdown: draining")).toBe("pending");
});

// #1936 — THE STAGE BREADCRUMBS MUST STAY NON-TERMINAL. `shutdown()` now announces each stage it enters
// (`http drained` / `joining the workloads worker` / `db housekeeping`) so an escalation says WHICH stage
// was in flight; until then everything between `draining` and `complete` was silent, which is why the
// original report could not be diagnosed. They share this classifier's `shutdown: ` prefix, so a future
// breadcrumb worded "shutdown: complete db housekeeping" would make `down` declare a clean shutdown while
// the process was still checkpointing. This row is what makes that wording red.
test("the stage breadcrumbs are progress, never a terminal verdict", () => {
  for (const line of ['{"msg":"shutdown: http drained"}', '{"msg":"shutdown: joining the workloads worker"}', '{"msg":"shutdown: db housekeeping"}']) {
    expect(classifyDrainTail(`{"msg":"shutdown: draining"}\n${line}\n`), `${line} must not be read as a terminal outcome`).toBe("pending");
  }
  // …and a real sequence still terminates on the line that means it: the breadcrumbs do not mask `complete`.
  expect(classifyDrainTail('{"msg":"shutdown: http drained"}\n{"msg":"shutdown: db housekeeping"}\n{"msg":"shutdown: complete"}\n')).toBe("complete");
});

// The breadcrumbs are emitted by the server, read by this tool, and coupled by their exact TEXT — the same
// two-sided pin `SERVER_DRAIN_MS` gets below, for the same reason: a silent rename on the server side would
// leave the classifier's sibling row above green while the operator's log lost the stage it names.
test("the server still emits the stage breadcrumbs this classifier is written against", () => {
  const source = readFileSync(new URL("../../../packages/server/src/entry/lifecycle.ts", import.meta.url), "utf8");
  for (const breadcrumb of ["shutdown: http drained", "shutdown: joining the workloads worker", "shutdown: db housekeeping"]) {
    expect(source, `entry/lifecycle.ts no longer logs "${breadcrumb}"`).toContain(`log.info("${breadcrumb}")`);
  }
});

test("SERVER_DRAIN_MS still matches the server's own SHUTDOWN_DRAIN_MS", () => {
  // The constant is not exported from @orb/server, so it is restated in the kit. This two-sided pin is
  // what stops the restatement from silently rotting into a restart that gives up too early.
  const source = readFileSync(new URL("../../../packages/server/src/entry/lifecycle.ts", import.meta.url), "utf8");
  const match = DRAIN_MS_RE.exec(source);
  expect(match?.[1]).toBeDefined();
  expect(Number((match?.[1] ?? "").replaceAll("_", ""))).toBe(SERVER_DRAIN_MS);
});

// ── client bundle freshness ──────────────────────────────────────────────────────────────────────────

test("a MISSING bundle is refused with the build command — prod boot throws without index.html", () => {
  const verdict = classifyDist({ distIndexMtimeMs: null, newestSourceMtimeMs: 100 });
  expect(verdict.state).toBe("missing");
  expect(verdict.message).toContain("pnpm --filter @orb/client build");
  expect(verdict.message).toContain(CLIENT_DIST_INDEX_REL);
});

test("a bundle older than client source is a WARN, not a refusal — server-only restarts need no build", () => {
  expect(classifyDist({ distIndexMtimeMs: 100, newestSourceMtimeMs: 500 }).state).toBe("stale");
  expect(classifyDist({ distIndexMtimeMs: 500, newestSourceMtimeMs: 100 }).state).toBe("fresh");
  expect(classifyDist({ distIndexMtimeMs: 500, newestSourceMtimeMs: null }).state).toBe("fresh");
});

// ── served-transform freshness (#524) ────────────────────────────────────────────────────────────────
//
// THE LIE THIS DETECTOR EXISTS FOR: vite's file watcher died, the process stayed up, the port stayed bound,
// healthz stayed green, and `stack status` printed `status=up` for 24 minutes while every page load got a
// pre-merge transform missing a landed export. These are the permanent controls — both directions, so the
// detector can be proven to fail as well as to pass.

/** A module the transform must still spell every value export of — and three type-only exports it may not. */
const CANARY_SOURCE = [
  "export type Erased = string;",
  "export interface AlsoErased { a: string }",
  "export type { Erased as Reexported };",
  "export const landedConst = 1;",
  "export async function landedFn() {}",
  "export class LandedClass {}",
  "const inner = 2;",
  "export { inner as landedAlias };",
].join("\n");

test("valueExportNames takes every value export and NO type export (a type's absence proves nothing)", () => {
  expect(valueExportNames(CANARY_SOURCE).toSorted((a, b) => a.localeCompare(b))).toEqual(["landedAlias", "LandedClass", "landedConst", "landedFn"]);
});

test("a served body MISSING a landed export is STALE — the dead-watcher wedge, with the fix in the message", () => {
  // The measured shape: a byte-identical PREVIOUS transform, which simply does not contain the new export.
  const wedged = CANARY_SOURCE.replace("export const landedConst = 1;", "");
  const verdict = classifyServedTransform({ file: "packages/ui/src/canary.ts", diskSource: CANARY_SOURCE, servedBody: wedged });
  expect(verdict.state).toBe("stale");
  expect(verdict.message).toContain("landedConst");
  expect(verdict.message).toContain("pnpm stack restart");
});

test("a served body carrying every value export is FRESH (the negative control)", () => {
  expect(classifyServedTransform({ file: "packages/ui/src/canary.ts", diskSource: CANARY_SOURCE, servedBody: CANARY_SOURCE }).state).toBe("fresh");
});

// ── the BYTE arm (#2461) ─────────────────────────────────────────────────────────────────────────────
//
// THE SECOND LIE, from the same instrument: on 2026-09-19 `stack status` printed
// `fresh · carries all 6 of its value export(s)` over a served `@orb/ui` token map that was missing
// `text.code-field` and `leading.code-field` outright. Export NAMES are a count of declarations and cannot
// see a change INSIDE one. What can: the served transform's own inline sourcemap, whose `sourcesContent`
// is the source file byte for byte (measured against the live client config over four modules, the
// React-Compiler babel pass included). These controls drive that arm in both directions AND pin that the
// old name arm still answers for a module served without a map.

/** A served dev transform the way vite emits one: the (irrelevant here) body plus the inline map that
 *  carries the bytes the transform was BUILT FROM. `builtFrom` is what makes it a stale or a fresh body. */
function servedWithMap(body: string, builtFrom: string): string {
  const map = JSON.stringify({ version: 3, sources: ["canary.ts"], sourcesContent: [builtFrom], mappings: "" });
  return `${body}\n//# sourceMappingURL=data:application/json;base64,${Buffer.from(map, "utf8").toString("base64")}`;
}

test("a served transform built from the bytes on disk is FRESH, and one byte of drift is STALE", () => {
  expect(servedCarriesDiskBytes(servedWithMap(CANARY_SOURCE, CANARY_SOURCE), CANARY_SOURCE)).toBe(true);
  expect(servedCarriesDiskBytes(servedWithMap(CANARY_SOURCE, `${CANARY_SOURCE}\n`), CANARY_SOURCE)).toBe(false);
  // `null`, NOT false: no map is "this arm could not measure", which must fall through rather than accuse.
  expect(servedCarriesDiskBytes(CANARY_SOURCE, CANARY_SOURCE)).toBe(null);
});

test("THE #2461 LIE: a body with every value export but the WRONG bytes is STALE, not fresh", () => {
  // The shape that shipped: a generated map whose KEYS changed while its exports did not. The name arm
  // calls this fresh — that is the defect — so this control fails the moment the byte arm is removed.
  const landed = `${CANARY_SOURCE}\nexport const tokens = { "text.code-field": 1 };`;
  const previous = `${CANARY_SOURCE}\nexport const tokens = {};`;
  expect(valueExportNames(previous)).toEqual(valueExportNames(landed));
  const verdict = classifyServedTransform({ file: "packages/ui/src/tokens/index.ts", diskSource: landed, servedBody: servedWithMap(previous, previous) });
  expect(verdict.state).toBe("stale");
  expect(verdict.message).toContain("pnpm stack restart");
  expect(classifyServedTransform({ file: "packages/ui/src/tokens/index.ts", diskSource: landed, servedBody: servedWithMap(landed, landed) }).state).toBe(
    "fresh",
  );
});

test("a TYPES-ONLY module is verifiable through the byte arm — `unverifiable` is now only for a map-less one", () => {
  const typesOnly = "export type A = 1;\n";
  expect(classifyServedTransform({ file: "packages/ui/src/t.ts", diskSource: typesOnly, servedBody: servedWithMap("", typesOnly) }).state).toBe("fresh");
  expect(classifyServedTransform({ file: "packages/ui/src/t.ts", diskSource: typesOnly, servedBody: servedWithMap("", "export type A = 2;\n") }).state).toBe(
    "stale",
  );
});

test("no answer is UNREACHABLE and a type-only module is UNVERIFIABLE — neither may read as fresh", () => {
  // "I could not measure" is the third answer this instrument owes; folding either into `fresh` would
  // reproduce the exact lie (a clean-looking verdict from a probe that never ran).
  expect(classifyServedTransform({ file: "packages/ui/src/canary.ts", diskSource: CANARY_SOURCE, servedBody: null }).state).toBe("unreachable");
  expect(classifyServedTransform({ file: "packages/ui/src/t.ts", diskSource: "export type A = 1;\n", servedBody: "" }).state).toBe("unverifiable");
  expect(classifyServedTransform({ file: null, diskSource: null, servedBody: null }).state).toBe("unverifiable");
});

// ── the system-probe parsers ─────────────────────────────────────────────────────────────────────────

const SS_OUTPUT = [
  "State  Recv-Q Send-Q Local Address:Port  Peer Address:Port Process",
  'LISTEN 0      511          0.0.0.0:8788       0.0.0.0:*     users:(("node",pid=4242,fd=23))',
  'LISTEN 0      511             [::1]:5173          [::]:*     users:(("node",pid=5150,fd=31))',
  "LISTEN 0      511          0.0.0.0:8796       0.0.0.0:*",
].join("\n");

test("the listener pid is read off the LOCAL address column, not any `:port` on the line", () => {
  expect(parseListenerPid(SS_OUTPUT, 8788)).toBe(4242);
  expect(parseListenerPid(SS_OUTPUT, 5173)).toBe(5150);
  // Bound but owned by another user (no `pid=` without privileges) — a null owner, not a wrong one.
  expect(parseListenerPid(SS_OUTPUT, 8796)).toBeNull();
  expect(parseListenerPid(SS_OUTPUT, 9999)).toBeNull();
});

test("/proc start-ticks parse past a comm field containing spaces and parens", () => {
  const fields = Array.from({ length: 30 }, (_, i) => String(i + 100));
  // pid (comm) state ppid … — starttime is field 22, i.e. index 19 of the post-comm remainder.
  const stat = `4242 (node (weird) x) S ${fields.join(" ")}`;
  expect(parseProcStartTicks(stat)).toBe(String(100 + 18));
  expect(parseProcStartTicks("garbage with no paren")).toBeNull();
});

// ── #1162: the group probe the teardown warning never ran ──────────────────────────────────────────
// `do_stop`'s "still has verified survivors after KILL" asserted a fact about SURVIVORS from a verdict
// that only ever spoke about the LEADER. `devStackGroupHasMembers` is the missing question, and it is the
// same one `pgrep -g` answers: ESRCH = the group is empty, EPERM = a member exists that we may not signal.
test("the group residue probe reads kill(-pgid, 0) the way pgrep -g does (#1162)", () => {
  const asked: number[] = [];
  expect(devStackGroupHasMembers(4242, (target) => void asked.push(target))).toBe(true);
  // The NEGATIVE pgid is the whole mechanism — a positive one asks about the dead leader instead.
  expect(asked).toEqual([-4242]);
  expect(
    devStackGroupHasMembers(4242, () => {
      throw Object.assign(new Error("no such process group"), { code: "ESRCH" });
    }),
  ).toBe(false);
  expect(
    devStackGroupHasMembers(4242, () => {
      throw Object.assign(new Error("not permitted"), { code: "EPERM" });
    }),
  ).toBe(true);
});

// ── #1013: adoption is a STRICTER door, never a relaxation of the standing rule ──────────────────────
//
// The rule above ("a dead leader refuses a stable same-group survivor without signaling it") is intact and
// its arm is untouched. What changed is the PREMISE it rested on — "a survivor carries no launch identity"
// — which was true only because nothing stamped one. `stack.sh` now mints a per-launch marker and exports
// it before the setsid spawn, so every member of the group inherits it and the record keeps the leader's
// copy. These pin that the new door needs MORE evidence than the pgid, not less: UNANIMITY among live
// members, because a pgid can be reused and an unrelated process can end up in a group we did not start.
const MARKER = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const MARKED: DevStackIdentity = { ...DEV_IDENTITY, launchId: MARKER };

test("a leaderless group whose every live member carries the launch marker is ADOPTABLE (#1013)", () => {
  const adoption = adoptDevStackGroup(MARKED, { members: () => [5000, 5001], launchIdOf: () => MARKER });
  expect(adoption).toEqual({ kind: "adoptable", pgid: MARKED.pgid, members: [5000, 5001] });
  expect(adoptionText(adoption)).toContain("ADOPTED by launch marker");
});

test("ONE unmarked member refuses the whole group — adoption is unanimous or nothing (#1013)", () => {
  // The reused-pgid / unrelated-joiner case. A majority is not evidence: the signal is a GROUP signal, so
  // anything short of unanimity would land it on a process this launch never started.
  const adoption = adoptDevStackGroup(MARKED, { members: () => [5000, 5001], launchIdOf: (pid) => (pid === 5001 ? null : MARKER) });
  expect(adoption).toEqual({ kind: "unmarked", pgid: MARKED.pgid, unmarked: [5001] });
  expect(adoptionText(adoption)).toContain("5001");
  expect(adoptionText(adoption)).toContain("manual cleanup required");
  // A member carrying a DIFFERENT launch's marker is just as foreign as one carrying none.
  expect(adoptDevStackGroup(MARKED, { members: () => [5000], launchIdOf: () => "00000000-0000-4000-8000-000000000000" }).kind).toBe("unmarked");
});

test("a record with NO marker is unadoptable — the pre-#1013 refusal, unchanged (#1013)", () => {
  // Every pidfile written before the marker existed lands here, and so does one written by a launcher that
  // exported none. The old refusal is the fallback, not an error path.
  const adoption = adoptDevStackGroup(DEV_IDENTITY, { members: () => [5000], launchIdOf: () => MARKER });
  expect(adoption.kind).toBe("no-marker");
  expect(adoptionText(adoption)).toContain("carries no launch marker");
});

test("an EMPTY group is neither adoptable nor an alarm (#1013)", () => {
  expect(adoptDevStackGroup(MARKED, { members: () => [], launchIdOf: () => MARKER })).toEqual({ kind: "empty", pgid: MARKED.pgid });
});

test("only an ADOPTABLE group reaches the negative-PGID signal (#1013)", () => {
  const calls: Array<readonly [number, NodeJS.Signals]> = [];
  const kill = (target: number, sig: NodeJS.Signals): number => calls.push([target, sig]);

  expect(signalAdoptedDevStackGroup(MARKED, "SIGTERM", { members: () => [5000], launchIdOf: () => MARKER, kill }).kind).toBe("adoptable");
  // The NEGATIVE pgid is the whole mechanism — a positive one would signal the dead leader instead.
  expect(calls).toEqual([[-MARKED.pgid, "SIGTERM"]]);

  // …and every refusing shape signals NOTHING, which is the standing rule this door had to preserve.
  calls.length = 0;
  signalAdoptedDevStackGroup(MARKED, "SIGKILL", { members: () => [5000, 5001], launchIdOf: (pid) => (pid === 5001 ? null : MARKER), kill });
  signalAdoptedDevStackGroup(DEV_IDENTITY, "SIGKILL", { members: () => [5000], launchIdOf: () => MARKER, kill });
  signalAdoptedDevStackGroup(MARKED, "SIGKILL", { members: () => [], launchIdOf: () => MARKER, kill });
  expect(calls, "an unmarked, unmarkable or empty group must never be signalled").toEqual([]);
});

test("a malformed marker makes the whole record CORRUPT, not merely unmarked (#1013)", () => {
  // Silently dropping a bad marker would turn a tampered pidfile into an ordinary pre-#1013 record and
  // re-open the door the marker closes, so the parse refuses the file outright.
  expect(parseDevStackIdentity(JSON.stringify(MARKED))).toEqual(MARKED);
  expect(parseDevStackIdentity(JSON.stringify({ ...DEV_IDENTITY, launchId: "short" }))).toBeNull();
  expect(parseDevStackIdentity(JSON.stringify({ ...DEV_IDENTITY, launchId: `${MARKER}; rm -rf /` }))).toBeNull();
  expect(parseDevStackIdentity(JSON.stringify({ ...DEV_IDENTITY, launchId: 42 }))).toBeNull();
  // …and a record with no marker at all still parses: an old pidfile must stay stoppable.
  expect(parseDevStackIdentity(JSON.stringify(DEV_IDENTITY))).toEqual(DEV_IDENTITY);
});
