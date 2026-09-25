// Fixture tests for the PURE target resolution behind `snap --contexts`/`--as`
// (tooling/src/snap/ops/fixture.ts) — no curl, no stack: the flag > env > offset-pair-default precedence,
// the derived server PORT the `/proc` env-pin check needs, and the roster/handle refusals. The live
// detection (`fixtureStatus`) and the login door talk to a running fixture and are proven against it, not
// here (this file's home is tests/tooling/ per docs/law/Spine-Testing.md §2 — a test of a scripts/ tool).
//
// WHY the precedence is worth pinning: the bug this module was fixed for was an override
// (SNAP_FIXTURE_SERVER_URL) that existed but reached NEITHER the health probe nor the browser's base URL.
// One resolve feeding both halves is the fix; these cases are its lens.
import { DEV_PORTS, FIXTURE_PORTS } from "../../../../tooling/src/_shared/ports.ts";
import type { PortOwnerAuthProbe } from "../../../../tooling/src/snap/contract/fixture.ts";
import {
  defaultFixtureUsers,
  FIXTURE_BASE_URL_DEFAULT,
  FIXTURE_SERVER_URL_DEFAULT,
  fixtureVerdict,
  portOwnerFromConfig,
  resolveFixtureTarget,
  resolveFixtureUsers,
} from "../../../../tooling/src/snap/ops/fixture.ts";
import { FIXTURE_CREDENTIALS, fixtureEnv as fixtureRecipe } from "../../../../tooling/src/stack/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

// ── resolveFixtureTarget ────────────────────────────────────────────────────────────────────────────────

test("resolveFixtureTarget defaults to the fixture's OFFSET pair, not the dev stack's ports", () => {
  const target = resolveFixtureTarget({}, {});
  expect(target.serverUrl).toBe(FIXTURE_SERVER_URL_DEFAULT);
  expect(target.baseUrl).toBe(FIXTURE_BASE_URL_DEFAULT);
  expect(target.serverPort).toBe(FIXTURE_PORTS.server);
  // The whole point of the offset pair: coexistence with the dev stack. Both pairs come from the ONE port
  // registry now (#1271), so this asserts the registry rows are distinct rather than two local literals.
  expect(FIXTURE_PORTS.server).not.toBe(DEV_PORTS.server);
  expect(FIXTURE_PORTS.vite).not.toBe(DEV_PORTS.vite);
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
  expect(target.serverPort).toBe(FIXTURE_PORTS.server);
});

// ── the recipe this door probes is the stack tool's own ──────────────────────────────────────────────────

test("the fixture recipe binds the SAME offset pair the port registry declares, under its own run dir", () => {
  const env = fixtureRecipe("/repo", {});
  expect(env["PORT"]).toBe(String(FIXTURE_PORTS.server));
  expect(env["VITE_PORT"]).toBe(String(FIXTURE_PORTS.vite));
  // Its own run dir — without it a second stack from this tree clobbers the dev stack's record.
  expect(env["STACK_RUN_DIR"]).toContain("multi-user-fixture");
  expect(env["STACK_RUN_DIR"]).not.toBe("/repo/.cache/stack");
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

// ── the port-owner verdict (#1507): "could not ask" is not "yes" ─────────────────────────────────────
//
// `livePortOwnerIsLocalAuth` returned `boolean | null` and its OWN header said null meant "can't prove
// it's the fixture, same as a mismatch" — while `fixtureStatus` refused only on `false`. So every
// unprovable case (no `ss` on PATH, a port owned by another user, no `/proc`, a non-Linux host) returned
// `{ up: true }`: the check that exists to tell the fixture apart from the single-user dev stack answered
// "yes, that's the fixture" about a process nobody had identified. `fixtureVerdict` is the same decision
// with the probes injected, so all four arms are provable with no stack running.
const FIXTURE_TARGET = { serverUrl: "http://127.0.0.1:8790", baseUrl: "http://localhost:5175", serverPort: 8790 } as const;
const FIXTURE_CONFIG = { mode: "local", localEnabled: true, multiHumanCapable: true } as const;

test("an UNREADABLE port owner fails CLOSED and names what could not be read (#1507 red-first)", () => {
  const status = fixtureVerdict(FIXTURE_TARGET, {
    healthz: true,
    config: FIXTURE_CONFIG,
    owner: () => ({ kind: "unreadable", reason: "no process could be identified as the owner of :8790" }),
  });
  expect(status.up).toBe(false);
  expect(status.up === false && status.reason).toContain("could not prove :8790 is the fixture");
  expect(status.up === false && status.reason).toContain("no process could be identified");
});

test("a PROVEN local port owner is still up (#1507 positive control)", () => {
  expect(fixtureVerdict(FIXTURE_TARGET, { healthz: true, config: FIXTURE_CONFIG, owner: () => ({ kind: "local" }) })).toEqual({ up: true });
});

test("a port owner running another AUTH_MODE is refused, and the reason names the mode", () => {
  const status = fixtureVerdict(FIXTURE_TARGET, {
    healthz: true,
    config: FIXTURE_CONFIG,
    owner: () => ({ kind: "not-local", mode: "single-user" }),
  });
  expect(status.up === false && status.reason).toContain("AUTH_MODE=single-user");
});

test("the owner probe is only asked once the cheap HTTP evidence agrees", () => {
  let asked = 0;
  const owner = (): PortOwnerAuthProbe => {
    asked += 1;
    return { kind: "local" };
  };
  expect(fixtureVerdict(FIXTURE_TARGET, { healthz: false, config: FIXTURE_CONFIG, owner }).up).toBe(false);
  expect(fixtureVerdict(FIXTURE_TARGET, { healthz: true, config: null, owner }).up).toBe(false);
  expect(fixtureVerdict(FIXTURE_TARGET, { healthz: true, config: { mode: "single-user" }, owner }).up).toBe(false);
  expect(asked, "a run that already knows the origin is wrong must not ask the owner").toBe(0);
});

test("the port owner is the server's own word: its config's mode, and a config without one cannot be asked", () => {
  expect(portOwnerFromConfig({ mode: "local", localEnabled: true, multiHumanCapable: true }, "http://127.0.0.1:1")).toEqual({ kind: "local" });
  expect(portOwnerFromConfig({ mode: "single-user" }, "http://127.0.0.1:1")).toEqual({ kind: "not-local", mode: "single-user" });
  expect(portOwnerFromConfig({ localEnabled: true, multiHumanCapable: true }, "http://127.0.0.1:1")).toMatchObject({ kind: "unreadable" });
  expect(portOwnerFromConfig(null, "http://127.0.0.1:1")).toMatchObject({ kind: "unreadable" });
});
