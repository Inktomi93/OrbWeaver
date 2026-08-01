// tests/e2e/support/target-guard — the e2e harness's refusal to seed a stack it does not own, plus the
// mode-project invariants that made the refusal necessary. Node-lane (vitest) because the guard is pure over
// a probe result: the arms that matter (refuse / allow) must be provable WITHOUT booting three stacks.
//
// The incident this pins: the single-user project sat on the dev ports with no isolated DATABASE_URL, so
// globalSetup's unconditional `pinRouting` rewrote the operator's REAL `routing.roleDefaults`.

import { describe, expect, test } from "vitest";
import { MODE_PROJECTS, SINGLE_USER } from "./modes";
import { ALLOW_DEV_TARGET_ENV, DEV_STACK_PORTS, devTargetAllowed, targetRefusal } from "./target-guard";

const HARNESS_TARGET = { name: "single-user", baseUrl: "http://localhost:5181", backendUrl: "http://127.0.0.1:8796" } as const;
const DEV_TARGET = { name: "single-user", baseUrl: "http://localhost:5173", backendUrl: "http://127.0.0.1:8788" } as const;
const STAMPED = { reachable: true, stamped: true } as const;
const UNSTAMPED = { reachable: true, stamped: false } as const;
// Every mode's DB must live under the throwaway .cache tree — never the dev `data/orbweaver.db` default.
const ISOLATED_DB_RE = /^file:\.\/\.cache\//u;

describe("targetRefusal", () => {
  test("a stamped, non-dev-port target is seedable", () => {
    expect(targetRefusal(HARNESS_TARGET, STAMPED, false)).toBeUndefined();
  });

  test("REFUSES a reachable stack that carries no harness stamp (someone else's server holds the port)", () => {
    const refusal = targetRefusal(HARNESS_TARGET, UNSTAMPED, false);
    expect(refusal).toContain("REFUSING to seed");
    expect(refusal).toContain("E2E_HARNESS");
    expect(refusal).toContain(ALLOW_DEV_TARGET_ENV);
  });

  test("REFUSES a dev-port target even when something there answers WITH the stamp", () => {
    const refusal = targetRefusal(DEV_TARGET, STAMPED, false);
    expect(refusal).toContain("DEV stack port");
    expect(refusal).toContain("8788");
  });

  test("REFUSES when only the vite side is a dev port (the guard checks both origins)", () => {
    expect(targetRefusal({ ...HARNESS_TARGET, baseUrl: "http://localhost:5173" }, STAMPED, false)).toContain("5173");
  });

  test("the override waives BOTH arms — a deliberate dev-stack drive is one decision", () => {
    expect(targetRefusal(DEV_TARGET, UNSTAMPED, true)).toBeUndefined();
  });
});

describe("devTargetAllowed", () => {
  test("only the literal 1 opts in", () => {
    expect(devTargetAllowed({ [ALLOW_DEV_TARGET_ENV]: "1" })).toBe(true);
    expect(devTargetAllowed({ [ALLOW_DEV_TARGET_ENV]: "true" })).toBe(false);
    expect(devTargetAllowed({ [ALLOW_DEV_TARGET_ENV]: "0" })).toBe(false);
    expect(devTargetAllowed({})).toBe(false);
  });
});

describe("mode projects (default, no override)", () => {
  test("every mode boots a STAMPED stack — else its own globalSetup would refuse it", () => {
    for (const mode of MODE_PROJECTS) {
      expect(mode.webServerEnv["E2E_HARNESS"], mode.name).toBe("on");
    }
  });

  test("no mode targets a dev-stack port, and each pins its own DATABASE_URL", () => {
    for (const mode of MODE_PROJECTS) {
      for (const url of [mode.baseUrl, mode.backendUrl]) {
        expect(DEV_STACK_PORTS, `${mode.name} ${url}`).not.toContain(new URL(url).port);
      }
      expect(mode.webServerEnv["DATABASE_URL"], mode.name).toMatch(ISOLATED_DB_RE);
    }
  });

  test("the single-user project is the one that regressed — it is isolated by default", () => {
    expect(SINGLE_USER.webServerEnv["DATABASE_URL"]).toBe("file:./.cache/e2e-single/orb.db");
    expect(targetRefusal(SINGLE_USER, STAMPED, false)).toBeUndefined();
  });
});
