// Fixture tests for the PURE target resolution behind `snap --contexts`/`--as`
// (scripts/probes/_kit/fixture.ts) — no curl, no stack: the flag > env > offset-pair-default precedence,
// the derived server PORT the `/proc` env-pin check needs, and the roster/handle refusals. The live
// detection (`fixtureStatus`) and the login door talk to a running fixture and are proven against it, not
// here (this file's home is tests/tooling/ per core/Spine-Testing.md §2 — a test of a scripts/ tool).
//
// WHY the precedence is worth pinning: the bug this module was fixed for was an override
// (SNAP_FIXTURE_SERVER_URL) that existed but reached NEITHER the health probe nor the browser's base URL.
// One resolve feeding both halves is the fix; these cases are its lens.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  defaultFixtureUsers,
  FIXTURE_BASE_URL_DEFAULT,
  FIXTURE_CREDENTIALS,
  FIXTURE_SERVER_PORT,
  FIXTURE_SERVER_URL_DEFAULT,
  FIXTURE_VITE_PORT,
  resolveFixtureTarget,
  resolveFixtureUsers,
} from "../../scripts/probes/_kit/fixture.ts";
import { expect, test } from "../support/fixtures.ts";

const REPO_ROOT = join(import.meta.dirname, "..", "..");

// ── resolveFixtureTarget ────────────────────────────────────────────────────────────────────────────────

test("resolveFixtureTarget defaults to the fixture's OFFSET pair, not the dev stack's ports", () => {
  const target = resolveFixtureTarget({}, {});
  expect(target.serverUrl).toBe(FIXTURE_SERVER_URL_DEFAULT);
  expect(target.baseUrl).toBe(FIXTURE_BASE_URL_DEFAULT);
  expect(target.serverPort).toBe(FIXTURE_SERVER_PORT);
  // The whole point of the offset pair: coexistence with the dev stack (8788/5173).
  expect(FIXTURE_SERVER_PORT).not.toBe(8788);
  expect(FIXTURE_VITE_PORT).not.toBe(5173);
});

/** The two env knobs as a plain record — built from entries so the SCREAMING_CASE keys don't read as
 *  object properties to the naming-convention lint (they are environment variable names, not fields). */
function fixtureEnv(serverUrl: string, baseUrl: string): Record<string, string> {
  return Object.fromEntries([
    ["SNAP_FIXTURE_SERVER_URL", serverUrl],
    ["SNAP_FIXTURE_BASE_URL", baseUrl],
  ]);
}

test("resolveFixtureTarget reads both env overrides — the pair the old code ignored", () => {
  const target = resolveFixtureTarget({}, fixtureEnv("http://127.0.0.1:9001", "http://localhost:9002"));
  expect(target.serverUrl).toBe("http://127.0.0.1:9001");
  expect(target.baseUrl).toBe("http://localhost:9002");
  // The /proc env-pin check keys off the port, so it must follow the override too.
  expect(target.serverPort).toBe(9001);
});

test("resolveFixtureTarget lets an explicit flag beat env, per-half", () => {
  const target = resolveFixtureTarget({ serverUrl: "http://127.0.0.1:8790" }, fixtureEnv("http://127.0.0.1:9001", "http://localhost:9002"));
  expect(target.serverUrl).toBe("http://127.0.0.1:8790");
  expect(target.serverPort).toBe(8790);
  // The un-overridden half still falls through to env (not back to the default).
  expect(target.baseUrl).toBe("http://localhost:9002");
});

test("resolveFixtureTarget strips a trailing slash so URL joins never double up", () => {
  const target = resolveFixtureTarget({ serverUrl: "http://127.0.0.1:8790/", baseUrl: "http://localhost:5175/" }, {});
  expect(target.serverUrl).toBe("http://127.0.0.1:8790");
  expect(target.baseUrl).toBe("http://localhost:5175");
});

test("resolveFixtureTarget keeps the default port when the override URL is unparseable (the probe refuses loudly instead)", () => {
  const target = resolveFixtureTarget({ serverUrl: "not-a-url" }, {});
  expect(target.serverUrl).toBe("not-a-url");
  expect(target.serverPort).toBe(FIXTURE_SERVER_PORT);
});

// ── the shell/TS hand-lockstep (the ports live in two files by necessity) ────────────────────────────────

test("the fixture launcher script binds the SAME offset pair these constants mirror", () => {
  const script = readFileSync(join(REPO_ROOT, "scripts", "dev", "multi-user-fixture.sh"), "utf8");
  expect(script).toContain(`export PORT="\${FIXTURE_PORT:-${FIXTURE_SERVER_PORT}}"`);
  expect(script).toContain(`export VITE_PORT="\${FIXTURE_VITE_PORT:-${FIXTURE_VITE_PORT}}"`);
  // Its own pidfile dir — without it a second stack from this tree clobbers the dev stack's pgid.
  expect(script).toContain("export STACK_RUN_DIR=");
});

// ── roster resolution (the refusals snap turns into FIXTURE REFUSED lines) ──────────────────────────────

test("defaultFixtureUsers hands out the roster in order and refuses past its end", () => {
  const two = defaultFixtureUsers(2);
  expect("users" in two && two.users.map((u) => u.handle)).toEqual(["owner", "member"]);
  const tooMany = defaultFixtureUsers(FIXTURE_CREDENTIALS.length + 1);
  expect("error" in tooMany && tooMany.error).toContain("exceeds the fixture's seeded roster");
});

test("resolveFixtureUsers refuses an unknown handle instead of guessing a password", () => {
  const bad = resolveFixtureUsers(["stranger"]);
  expect("error" in bad && bad.error).toContain('unknown fixture handle "stranger"');
});
