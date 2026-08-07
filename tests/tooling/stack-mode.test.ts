// Unit tests for the PURE half of mode-aware stack control (scripts/dev/_kit/stack-mode.ts) — argv
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
import type { ObservedInstance, ProdRecord } from "../../scripts/dev/_kit/stack-mode.ts";
import {
  buildProdSpawnPlan,
  CLIENT_DIST_INDEX_REL,
  classifyDebugPosture,
  classifyDist,
  classifyDrainTail,
  classifyInstance,
  DEBUG_ENV_KEYS,
  debugConflictMessage,
  debugPostureText,
  decideDown,
  decideSpawnLock,
  decideUp,
  formatDispatch,
  lockHolderText,
  mayRemovePidfile,
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
  spawnerForPort,
} from "../../scripts/dev/_kit/stack-mode.ts";
import { expect, test } from "../support/fixtures.ts";

// Hoisted: the rule against per-call regex literals applies to test bodies too.
const DRAIN_MS_RE = /const SHUTDOWN_DRAIN_MS = ([\d_]+);/u;

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

test("--force and the dev-only verbs are REFUSED in prod, never silently dropped", () => {
  // `--force` reaches stack.sh's do_force_restart, which SIGKILLs the port holders AND the detached vLLM
  // fleet ignoring ownership. Prod's whole safety story is that it only signals what it can prove is its
  // own, so there is no prod force. Dropping the flag quietly would be the same defect class as the
  // shell falling through to dev.
  expect(parseStackArgv(["restart", "prod", "--force"])).toEqual({ ok: false, error: expect.stringContaining("--force is dev-only") });
  expect(parseStackArgv(["start-fg", "prod"])).toEqual({ ok: false, error: expect.stringContaining("dev-only") });
  // …and both stay legal in dev.
  expect(parseStackArgv(["restart", "--force"])).toMatchObject({ ok: true, invocation: { force: true, mode: "dev" } });
  expect(parseStackArgv(["start-fg"])).toMatchObject({ ok: true, invocation: { verb: "up-fg", mode: "dev" } });
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
  // because the gate's FIRST arm is an admin check and a single-user stack answers every caller as admin.
  // A probe that read "401 ⇒ armed, else off" therefore reported `off` on a stack whose debug surface was
  // wide open. Three distinct postures, no boolean.
  expect(classifyDebugPosture(404)).toBe("off");
  expect(classifyDebugPosture(401)).toBe("token");
  expect(classifyDebugPosture(200)).toBe("open");
  expect(classifyDebugPosture(null)).toBe("unknown");
  expect(debugPostureText("token", "/run/debug-token")).toContain("/run/debug-token");
  // The token PATH may be printed; the token VALUE never is.
  expect(debugPostureText("open", "/run/debug-token")).toContain("WITHOUT a token");
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

test("SERVER_DRAIN_MS still matches the server's own SHUTDOWN_DRAIN_MS", () => {
  // The constant is not exported from @orb/server, so it is restated in the kit. This two-sided pin is
  // what stops the restatement from silently rotting into a restart that gives up too early.
  const source = readFileSync(new URL("../../packages/server/src/entry/lifecycle.ts", import.meta.url), "utf8");
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
