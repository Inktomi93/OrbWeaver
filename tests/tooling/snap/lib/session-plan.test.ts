// Fixture tests for the PURE core of the session substrate (tooling/src/snap/lib/session-plan.ts) — no
// socket, no daemon, no browser: the flag partition a scenario and a session share, the refusal rows, the
// registry paths, the limits rule, the access / sweep verdicts and every refusal text. Both sides of every
// verdict are pinned (a table with one side pinned is a table nobody can refactor). The wire readers are
// tests/tooling/snap/lib/session-wire.test.ts; the imperative halves are proven by
// tests/tooling/snap/ops/session-daemon.int.test.ts.
import type { SessionRow } from "../../../../tooling/src/snap/contract/session.ts";
import { SESSION_PROTOCOL_VERSION } from "../../../../tooling/src/snap/contract/session.ts";
import {
  cascadeNotBootedRefusal,
  checkpointArgErrors,
  DEFAULT_SESSION_CAP,
  DEFAULT_SESSION_TTL_MIN,
  foreignSessionRefusal,
  identicalSeedsError,
  inheritSessionArgs,
  inheritSessionBinding,
  livePageSlug,
  neverNavigatedRefusal,
  resolveSessionLimits,
  SESSION_ONLY_FLAGS,
  sessionAccess,
  sessionBusyRefusal,
  sessionCallTarget,
  sessionCapRefusal,
  sessionDeadText,
  sessionIdleMs,
  sessionLogPath,
  sessionModeValidationPairs,
  sessionNameErrors,
  sessionNameRefusal,
  sessionOnlyFlagsIn,
  sessionOnlyFlagsRefusal,
  sessionRowPath,
  sessionSocketPath,
  sessionSweepVerdict,
  stripSessionFlags,
} from "../../../../tooling/src/snap/lib/session-plan.ts";
import { parseSnapArgs } from "../../../../tooling/src/snap/ops/parse.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const MAIN = "/home/dev/orbweaver";
const LANE = "/home/dev/orbweaver/.claude/worktrees/agent-lane";
const HOME = "/home/dev/orbweaver/.cache/snap-session";
const NOW = Date.parse("2026-09-02T18:30:00.000Z");
const MINUTE = 60_000;

function row(over: Partial<SessionRow> = {}): SessionRow {
  return {
    v: SESSION_PROTOCOL_VERSION,
    name: "p-home-perf",
    ownerCheckout: LANE,
    daemonPid: 4242,
    pgid: 4242,
    socket: `${HOME}/p-home-perf.sock`,
    cdpEndpoint: "http://127.0.0.1:40001",
    slotDir: `${LANE}/reports/runs/snap-session/agent-lane-4242-2026-09-02T18-00-00-000Z`,
    binding: { kind: "base", url: "http://localhost:5173" },
    environment: { viewport: { width: 1280, height: 800 }, device: null, colorScheme: null, reducedMotion: false, deviceScaleFactor: null },
    bootArgv: ["--base", "http://localhost:5173", "/"],
    createdAt: "2026-09-02T18:00:00.000Z",
    lastUsedAt: "2026-09-02T18:20:00.000Z",
    inflightOp: null,
    lastOp: "--eval 1",
    ttlMs: 30 * MINUTE,
    headless: true,
    calls: 3,
    ...over,
  };
}

// ── names and paths ──────────────────────────────────────────────────────────────────────────────────

test("a session name is a lane's short handle — lowercase, digits, dashes, 32 chars — and nothing else", () => {
  expect(sessionNameRefusal("p-home-perf")).toBeNull();
  expect(sessionNameRefusal("a")).toBeNull();
  expect(sessionNameRefusal("x".repeat(32))).toBeNull();
  for (const bad of ["", "P-Home", "with space", "-lead", "x".repeat(33), "under_score"]) {
    expect(sessionNameRefusal(bad), bad).toContain("must match");
  }
});

test("the three registry files hang off the repo-keyed home by name", () => {
  expect(sessionSocketPath(HOME, "p-x")).toBe(`${HOME}/p-x.sock`);
  expect(sessionRowPath(HOME, "p-x")).toBe(`${HOME}/p-x.json`);
  expect(sessionLogPath(HOME, "p-x")).toBe(`${HOME}/p-x.log`);
});

// ── limits (F5) ──────────────────────────────────────────────────────────────────────────────────────

test("limits: flag > env > default, fractional minutes are legal, and a bad value REFUSES instead of defaulting", () => {
  const defaults = resolveSessionLimits({ ttlMinEnv: undefined, capEnv: undefined, ttlMinFlag: null });
  expect(defaults).toEqual({ limits: { ttlMs: DEFAULT_SESSION_TTL_MIN * MINUTE, cap: DEFAULT_SESSION_CAP }, errors: [] });
  expect(resolveSessionLimits({ ttlMinEnv: "0.05", capEnv: "2", ttlMinFlag: null }).limits).toEqual({ ttlMs: 3000, cap: 2 });
  expect(resolveSessionLimits({ ttlMinEnv: "0.05", capEnv: undefined, ttlMinFlag: 10 }).limits.ttlMs).toBe(10 * MINUTE);
  const badTtl = resolveSessionLimits({ ttlMinEnv: "0", capEnv: undefined, ttlMinFlag: null });
  expect(badTtl.errors).toEqual([expect.stringContaining("positive number of minutes")]);
  expect(badTtl.limits.ttlMs).toBe(DEFAULT_SESSION_TTL_MIN * MINUTE);
  const badCap = resolveSessionLimits({ ttlMinEnv: undefined, capEnv: "many", ttlMinFlag: null });
  expect(badCap.errors).toEqual([expect.stringContaining("ORB_SESSION_CAP")]);
  expect(badCap.limits.cap).toBe(DEFAULT_SESSION_CAP);
  expect(resolveSessionLimits({ ttlMinEnv: undefined, capEnv: "0", ttlMinFlag: null }).errors).toHaveLength(1);
});

// ── the partition ────────────────────────────────────────────────────────────────────────────────────

test("a later call carrying a browser-lifetime flag is named, page suffix and all; a value token never is", () => {
  expect(sessionOnlyFlagsIn(["--viewport", "412x823", "--eval", "innerWidth"])).toEqual(["--viewport"]);
  // `--base` as the last token is a FLAG token (a value never starts with `--`), so it is named too.
  expect(sessionOnlyFlagsIn(["--cascade@1", "p=color", "--dark", "--click", "main", "--base"])).toEqual(["--cascade@1", "--dark", "--base"]);
  // A VALUE that mentions a flag is a value (`--fill input=--viewport`); a bare `--viewport` after `--eval`
  // is a flag token the parser refuses anyway (`--eval requires a value`), so the scan naming it is consistent.
  expect(sessionOnlyFlagsIn(["--fill", "input=--viewport", "--text"])).toEqual([]);
  expect(sessionOnlyFlagsIn(["--eval", "--viewport", "--text"])).toEqual(["--viewport"]);
  expect(sessionOnlyFlagsIn(["/chat", "--goto", "settings", "--map"])).toEqual([]);
  // Every stage flag is a WHERE and every load arm is a launch property — both halves are in the set.
  for (const flag of ["--isolated", "--ref", "--dirty", "--fresh", "--cpu-throttle", "--network", "--pages", "--ls", "--appearance-preset", "--theme"]) {
    expect(SESSION_ONLY_FLAGS.has(flag), flag).toBe(true);
  }
  // A per-capture flag is NOT: the call owns its evidence, its target and its manifest — and
  // `--no-failure-evidence` names nothing a session has (traces are off for its whole life).
  for (const flag of ["--eval", "--text", "--map", "--contrast", "--json", "--out", "--goto", "--click", "--checkpoint", "--file", "--no-failure-evidence"]) {
    expect(SESSION_ONLY_FLAGS.has(flag), flag).toBe(false);
  }
});

test("the client strips exactly its own two flags and their values, keeping everything else in order", () => {
  expect(stripSessionFlags(["--session", "p-x", "/chat", "--session-ttl", "5", "--eval", "1"])).toEqual(["/chat", "--eval", "1"]);
  expect(stripSessionFlags(["--eval", "1"])).toEqual(["--eval", "1"]);
  // A value that LOOKS like a session flag is a value: `--eval --session` is nonsense the daemon refuses, not a strip.
  expect(stripSessionFlags(["--session-status", "p-x"])).toEqual(["--session-status", "p-x"]);
});

test("inheritSessionArgs is the scenario's partition: lifetime flags from the boot, per-capture flags from the call", () => {
  const boot = parseSnapArgs(["--base", "http://localhost:5273", "--viewport", "412x823", "--dark", "--full-motion", "--ls", "a=1", "--strict-console", "/"]);
  const call = parseSnapArgs(["--eval", "innerWidth", "--ls", "b=2", "--json", "--checkpoint", "settings"]);
  const merged = inheritSessionArgs(boot, call, "fallback-out");
  expect(merged.base).toBe("http://localhost:5273");
  expect(merged.viewport).toEqual({ width: 412, height: 823 });
  expect(merged.colorScheme).toBe("dark");
  expect(boot.appearance).not.toBeNull();
  expect(merged.appearance).toEqual(boot.appearance);
  expect(merged.strictConsole).toBe(true);
  expect(merged.eval.map((entry) => entry.expr)).toEqual(["innerWidth"]);
  expect(merged.route).toBe("settings");
  expect(merged.localStorage).toEqual([
    { key: "a", value: "1" },
    { key: "b", value: "2" },
  ]);
  expect(merged.checkpoint).toBe(true);
  expect(merged.out).toBe("fallback-out");
  // The scenario's per-RUN facts: json rides the boot in this layer (the session's second layer flips it).
  expect(merged.json).toBe(false);
  expect(inheritSessionArgs(boot, parseSnapArgs(["--out", "named"]), "fallback").out).toBe("named");
});

test("inheritSessionBinding is the session-only second layer: the WHERE, the load arm and the tab count from the boot, json from the call", () => {
  const boot = parseSnapArgs(["--isolated", "--ref", "abc123", "--cpu-throttle", "4", "--network", "slow-4g", "--pages", "2", "/"]);
  const call = parseSnapArgs(["--json", "--eval", "1"]);
  const merged = inheritSessionBinding(boot, inheritSessionArgs(boot, call, "x"), call);
  expect(merged.isolated).toBe(true);
  expect(merged.ref).toBe("abc123");
  expect(merged.cpuThrottle).toBe(4);
  expect(merged.network).toBe("slow-4g");
  expect(merged.pages).toBe(2);
  expect(merged.json).toBe(true);
});

test("the checkpoint refusal rows judge the modes on the inherited args and the shims on the raw parse", () => {
  const boot = parseSnapArgs(["/"]);
  const clean = parseSnapArgs(["--eval", "1"]);
  expect(checkpointArgErrors(inheritSessionArgs(boot, clean, "x"), clean, "cp")).toEqual([]);
  const modes = parseSnapArgs(["--pages", "2", "--watch", "1000", "--isolated", "--matrix", "--isolated"]);
  const errors = checkpointArgErrors(inheritSessionArgs(boot, modes, "x"), modes, "cp");
  expect(errors).toEqual([
    "cp: scenario checkpoints do not support --pages/--contexts/--as",
    "cp: scenario checkpoints do not support --watch/--baseline/--diff",
    "cp: scenario checkpoints cannot nest --scenario/--matrix",
    "cp: scenario checkpoint args cannot manage stages; put stage flags on the outer command",
  ]);
  // The shim rows read the RAW checkpoint — the inherited copy always carries the boot's shim.
  const shimmed = parseSnapArgs(["--full-motion", "--theme", "none"]);
  expect(shimmed.appearance).not.toBeNull();
  expect(checkpointArgErrors(inheritSessionArgs(boot, shimmed, "x"), shimmed, "cp")).toEqual([
    expect.stringContaining("appearance shim is session-level"),
    expect.stringContaining("theme shim is session-level"),
  ]);
});

test("identical seeds across one browser lifetime, or the one refusal", () => {
  const a = parseSnapArgs(["--ls", "k=1"]);
  const b = parseSnapArgs(["--ls", "k=1"]);
  const c = parseSnapArgs(["--ls", "k=2"]);
  expect(identicalSeedsError([a, b])).toBeNull();
  expect(identicalSeedsError([a, c])).toContain("identical --ls seeds");
  expect(identicalSeedsError([])).toBeNull();
});

test("a call targets a file, a route, or the LIVE page — the route's '/' default is not a route", () => {
  expect(sessionCallTarget(parseSnapArgs(["--file", "x.html"]))).toBe("file");
  expect(sessionCallTarget(parseSnapArgs(["/chat"]))).toBe("route");
  expect(sessionCallTarget(parseSnapArgs(["/"]))).toBe("route");
  expect(sessionCallTarget(parseSnapArgs(["--eval", "1"]))).toBe("live");
  expect(parseSnapArgs(["--eval", "1"]).route).toBe("/");
});

test("the parse-time session rows: every combination that cannot mean anything refuses by name, and only those", () => {
  const rows = (argv: readonly string[]): readonly string[] => {
    const args = parseSnapArgs([...argv]);
    return sessionModeValidationPairs(args, args.contexts > 1 || args.as !== null)
      .filter(([invalid]) => invalid)
      .map(([, message]) => message);
  };
  expect(rows(["--session", "p-x", "--eval", "1"])).toEqual([]);
  expect(rows(["--session-status"])).toEqual([]);
  expect(rows(["--session-close", "p-x", "--session-sweep"])).toEqual([expect.stringContaining("mutually exclusive")]);
  expect(rows(["--session", "p-x", "--session-export", "p-x"])).toEqual([expect.stringContaining("stand alone")]);
  expect(rows(["--session", "p-x", "--session-daemon", "p-x"])).toEqual([expect.stringContaining("--session-daemon is the daemon's own entry")]);
  expect(rows(["--session-ttl", "5"])).toEqual([expect.stringContaining("boot property")]);
  expect(rows(["--session", "p-x", "--matrix"])).toEqual([expect.stringContaining("phase 1")]);
  expect(rows(["--session-sweep", "--stage-sweep"])).toEqual([expect.stringContaining("do not combine with --stage-status")]);
  expect(sessionNameErrors(parseSnapArgs(["--session", "P-Bad", "--session-ttl", "1"]))).toEqual([expect.stringContaining("must match")]);
  expect(sessionNameErrors(parseSnapArgs(["--session", "p-good"]))).toEqual([]);
});

// ── access, liveness, sweep ──────────────────────────────────────────────────────────────────────────

test("sessionAccess: the four cells of the ownership table (design §3.5)", () => {
  expect(sessionAccess({ row: null, live: false, callerCheckout: LANE })).toBe("absent");
  expect(sessionAccess({ row: row(), live: true, callerCheckout: LANE })).toBe("ours");
  expect(sessionAccess({ row: row(), live: true, callerCheckout: MAIN })).toBe("refuse");
  expect(sessionAccess({ row: row(), live: false, callerCheckout: MAIN })).toBe("reclaim");
  expect(sessionAccess({ row: row(), live: false, callerCheckout: LANE })).toBe("reclaim");
});

test("idle age reads the last call boundary; an unparseable stamp is INFINITELY idle, never fresh", () => {
  expect(sessionIdleMs(row(), NOW)).toBe(10 * MINUTE);
  expect(sessionIdleMs(row({ lastUsedAt: "garbage" }), NOW)).toBe(Number.POSITIVE_INFINITY);
  expect(sessionIdleMs(row({ lastUsedAt: "2026-09-02T19:00:00.000Z" }), NOW)).toBe(0);
});

test("the sweep verdict: dead beats everything, idle past the TTL is reaped, under it is left alone", () => {
  expect(sessionSweepVerdict({ live: false, idleMs: 0, ttlMs: MINUTE })).toBe("dead");
  expect(sessionSweepVerdict({ live: true, idleMs: MINUTE + 1, ttlMs: MINUTE })).toBe("idle");
  expect(sessionSweepVerdict({ live: true, idleMs: MINUTE, ttlMs: MINUTE })).toBe("live");
  expect(sessionSweepVerdict({ live: true, idleMs: Number.POSITIVE_INFINITY, ttlMs: MINUTE })).toBe("idle");
});

// ── the texts (each names its remedy) ────────────────────────────────────────────────────────────────

test("every refusal names the fact and the remedy", () => {
  const foreign = foreignSessionRefusal(row(), NOW);
  expect(foreign).toContain("SESSION REFUSED");
  expect(foreign).toContain(LANE);
  expect(foreign).toContain("4242");
  expect(foreign).toContain("10m ago");
  expect(foreign).toContain("--session-close p-home-perf --force");

  const cap = sessionCapRefusal("p-new", [row(), row({ name: "p-other", daemonPid: 7 })], 2, NOW);
  expect(cap).toContain("cap is 2");
  expect(cap).toContain("p-home-perf");
  expect(cap).toContain("p-other");
  expect(cap).toContain("--session-sweep");

  expect(sessionBusyRefusal("p-x", "--eval slow", 12_000)).toContain("mid-`--eval slow` (12s in)");
  expect(sessionBusyRefusal("p-x", "--eval slow", 3 * MINUTE)).toContain("(3m in)");

  const deadMid = sessionDeadText(row({ inflightOp: "--goto settings --eval 1" }), "socket gone");
  expect(deadMid).toContain("SESSION DEAD");
  expect(deadMid).toContain("mid-`--goto settings --eval 1`");
  expect(deadMid).toContain("--session-sweep");
  const deadIdle = sessionDeadText(row(), "socket gone");
  expect(deadIdle).toContain("idle since 2026-09-02T18:20:00.000Z (last op --eval 1)");

  expect(neverNavigatedRefusal("p-x")).toContain("has never navigated");
  expect(cascadeNotBootedRefusal("p-x")).toContain("--cascade");
  expect(sessionOnlyFlagsRefusal("p-x", ["--viewport", "--dark"])).toContain("--viewport --dark");
  expect(sessionOnlyFlagsRefusal("p-x", ["--viewport"])).toContain("--session-close p-x");
});

test("a live page's default artifact base is the file's basename or the route's slug", () => {
  expect(livePageSlug("file:///tmp/orb-x/page.html")).toBe("page");
  expect(livePageSlug("http://localhost:5173/chats/abc?x=1")).toBe("chats_abc_x_1");
  expect(livePageSlug("http://localhost:5173/")).toBe("root");
  expect(livePageSlug("not a url")).toBe("live");
});
