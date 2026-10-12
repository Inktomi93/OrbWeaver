// @module-tag requires-process-chdir
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import { dirWithEnvFile, makeDir, reimportEnvIn, reimportEnvWith, restoreProcessEnvAfterEach } from "./_support.ts";

// The `.env` loader (node:util parseEnv + our explicit merge; dotenv died 2026-08-03, node-26 program
// §3). The OVERRIDE DIRECTION is the load-bearing part and is asserted BOTH WAYS: a drop-in swap to
// `process.loadEnvFile()` — which can only ever fill unset keys — turns the first test here RED.

describe("foundation/env — the .env load (override semantics + parser tolerance)", () => {
  restoreProcessEnvAfterEach();

  test("override ON (the production default): a checked-in .env BEATS an already-set shell export", async () => {
    const dir = dirWithEnvFile("DEFAULT_USER_HANDLE=from-dotfile\nPORT=9001\n");
    const { env } = await reimportEnvIn(dir, { DEFAULT_USER_HANDLE: "from-stale-shell", PORT: "7777" }, { vitest: false });
    expect(env.DEFAULT_USER_HANDLE).toBe("from-dotfile");
    expect(env.PORT).toBe(9001);
  });

  test("override OFF under VITEST: the pre-existing shell value SURVIVES", async () => {
    const dir = dirWithEnvFile("DEFAULT_USER_HANDLE=from-dotfile\nPORT=9001\n");
    const { env } = await reimportEnvIn(dir, { DEFAULT_USER_HANDLE: "from-stale-shell", PORT: "7777" });
    expect(env.DEFAULT_USER_HANDLE).toBe("from-stale-shell");
    expect(env.PORT).toBe(7777);
  });

  test("override OFF under ORB_ENV_NO_OVERRIDE (the probe/stage hatch, VITEST absent)", async () => {
    const dir = dirWithEnvFile("DEFAULT_USER_HANDLE=from-dotfile\n");
    const { env } = await reimportEnvIn(dir, { ORB_ENV_NO_OVERRIDE: "1", DEFAULT_USER_HANDLE: "from-stale-shell" }, { vitest: false });
    expect(env.DEFAULT_USER_HANDLE).toBe("from-stale-shell");
  });

  test("with override OFF the .env still FILLS a key the shell never set", async () => {
    const dir = dirWithEnvFile("DEFAULT_USER_HANDLE=from-dotfile\nOWNER_GROUP=admins\n");
    const { env } = await reimportEnvIn(dir, { DEFAULT_USER_HANDLE: "from-stale-shell" });
    expect(env.DEFAULT_USER_HANDLE).toBe("from-stale-shell");
    expect(env.OWNER_GROUP).toBe("admins");
  });

  test("no .env file at all → silent no-op, the schema defaults stand (dotenv's quiet:true parity)", async () => {
    const { env } = await reimportEnvIn(makeDir("orb-env-w3-none-"), {}, { vitest: false });
    expect(env.DEFAULT_USER_HANDLE).toBe("owner");
    expect(env.PORT).toBe(8788);
  });

  test("an UNREADABLE .env (it is a directory) → silent no-op, not a boot crash", async () => {
    const dir = makeDir("orb-env-w3-dir-");
    mkdirSync(join(dir, ".env"));
    const { env } = await reimportEnvIn(dir, {}, { vitest: false });
    expect(env.DEFAULT_USER_HANDLE).toBe("owner");
  });

  // Byte-for-byte identical to dotenv@16.6.1's `parse` on this fixture (measured 2026-08-03): comments,
  // blank lines, an `export ` prefix, single + double quotes, a `\n` escape inside double quotes, a junk
  // line with no separator, an inline `#` comment, and a CRLF line ending.
  test("parser tolerance matches what dotenv accepted (comments, quotes, export, junk, CRLF)", async () => {
    const dir = dirWithEnvFile(
      `${[
        "# a leading comment",
        "",
        "export DEFAULT_USER_HANDLE=exported",
        "IMPORT_SKIP_CHARACTERS='Pell, Assistant'",
        'ST_PROFILE_DIR="/tmp/st profiles"',
        'EGRESS_ALLOWLIST="a\\nb"',
        "this line is junk with no separator",
        "OWNER_GROUP=admins # inline comment",
        "PORT=9001",
      ].join("\n")}\r\nLOG_LEVEL=debug\r\n`,
    );
    const { env } = await reimportEnvIn(dir, {}, { vitest: false });
    expect(env.DEFAULT_USER_HANDLE).toBe("exported");
    expect(env.IMPORT_SKIP_CHARACTERS).toBe("Pell, Assistant");
    expect(env.ST_PROFILE_DIR).toBe("/tmp/st profiles");
    expect(env.EGRESS_ALLOWLIST).toBe("a\nb");
    expect(env.OWNER_GROUP).toBe("admins");
    expect(env.PORT).toBe(9001);
    expect(env.LOG_LEVEL).toBe("debug");
  });

  // DELTA 1 (closed in the loader): `parseEnv` does NOT strip a UTF-8 BOM, so an un-stripped BOM'd file
  // would land the first key as "﻿DEFAULT_USER_HANDLE" and the real key would silently keep its
  // default. dotenv stripped it; so do we.
  test("a UTF-8 BOM is stripped — the first key still lands under its clean name", async () => {
    const dir = dirWithEnvFile("﻿DEFAULT_USER_HANDLE=bommed\nPORT=9100\n");
    const { env } = await reimportEnvIn(dir, {}, { vitest: false });
    expect(env.DEFAULT_USER_HANDLE).toBe("bommed");
    expect(env.PORT).toBe(9100);
    expect(process.env["﻿DEFAULT_USER_HANDLE"]).toBeUndefined();
  });

  // DELTA 2 (ACCEPTED, pinned here so it stays deliberate): dotenv also honored a non-standard
  // `KEY: value` separator. `parseEnv` — the platform parser — ignores that line. Nothing in this repo
  // or on this box writes a `.env` that way; re-implementing a vendor dialect would defeat the swap.
  test("the non-standard `KEY: value` dotenv dialect is IGNORED (documented, accepted delta)", async () => {
    const dir = dirWithEnvFile("DEFAULT_USER_HANDLE: colonized\nPORT=9200\n");
    const { env } = await reimportEnvIn(dir, {}, { vitest: false });
    expect(env.DEFAULT_USER_HANDLE).toBe("owner");
    expect(env.PORT).toBe(9200);
  });

  // ENV-BLEEDS-INTO-TESTS — the fix: `ORB_ENV_NO_FILE` skips the `.env` load ENTIRELY,
  // not merely the override direction (that's `ORB_ENV_NO_OVERRIDE`, tested above — it still FILLS unset
  // keys from the file). Before this, the test env didn't override an already-set var but DID fill an unset
  // one, so any test asserting a schema DEFAULT silently asserted the operator's local `.env` instead — three
  // false reds on a real dev machine, none of them regressions. `vitest.config.ts` sets this globally so the
  // divergence can't recur per-test-author; this pins the mechanism itself, directly, with a REAL file that
  // would otherwise fill several keys.
  test("ORB_ENV_NO_FILE skips the .env load ENTIRELY — a real file's values never reach env, even unset keys", async () => {
    const dir = dirWithEnvFile("DEFAULT_USER_HANDLE=from-dotfile\nOWNER_GROUP=admins\nPORT=9300\nAUTH_MODE=local\nSESSION_SECRET=x\n");
    const { env } = await reimportEnvIn(dir, { ORB_ENV_NO_FILE: "1" }, { vitest: false });
    // Every one of these would read the file's value without the gate (proven by the sibling override-OFF
    // "still FILLS" test above, same fixture shape) — with the gate, the schema defaults stand untouched.
    expect(env.DEFAULT_USER_HANDLE).toBe("owner");
    expect(env.OWNER_GROUP).toBeUndefined();
    expect(env.PORT).toBe(8788);
    expect(env.AUTH_MODE).toBe("single-user");
  });

  test("ORB_ENV_NO_FILE is what `pnpm test` actually runs under — VITEST's own reimport (no explicit override) already proves the battery is env-independent", async () => {
    // Every OTHER test in this file re-imports via `reimportEnvWith`/`reimportEnvIn` under `VITEST=1` with NO
    // explicit `ORB_ENV_NO_FILE` override — it rides the SAME global `vitest.config.ts` `env:` block the real
    // battery does. This is the honest arm for "the battery is env-independent": a mechanical "no test reads
    // an operator var" sweep isn't definable (any test can legally read `env.<X>` — that's what the module
    // is FOR); what IS definable and load-bearing is that the gate that makes it irrelevant is actually armed
    // for every test process, which this asserts directly against the real global config rather than a
    // per-file re-stub. A future test author who reverts `vitest.config.ts`'s `env:` block goes red HERE.
    const config = (await import("../../../../vitest.config.ts")).default;
    expect(config.test?.env?.["ORB_ENV_NO_FILE"]).toBe("1");
  });

  // ── #301 — AUTH_FALLBACK must NOT live in `.env` (owner ruling 2026-08-19: BOOT-FATAL) ───────────────────
  // The file loads with override:true, so a value there is forced into EVERY launch (a dev-lockout footgun +
  // a defeat of "prod exports deny, dev defaults to owner"). AUTH_FALLBACK is a LAUNCH-TIME decision; the env
  // superRefine makes a `.env` pin unrepresentable. `vitest:false` drops the VITEST pin so the real load runs.
  test("#301: AUTH_FALLBACK declared in .env → boot FAILS at parse (fatal, not a warning)", async () => {
    const dir = dirWithEnvFile(["AUTH_MODE=single-user", "AUTH_FALLBACK=owner"].join("\n"));
    await expect(reimportEnvIn(dir, {}, { vitest: false })).rejects.toThrow("AUTH_FALLBACK must not be set in .env");
  });

  test("#301: a .env WITHOUT AUTH_FALLBACK boots clean at the default (the convention — launch-time only)", async () => {
    const dir = dirWithEnvFile("AUTH_MODE=single-user");
    const mod = await reimportEnvIn(dir, {}, { vitest: false });
    expect(mod.env.AUTH_FALLBACK).toBe("owner"); // the default, not a .env pin
  });
});

// ── SESSION_COOKIE_INSECURE is gone: the cookie transport is decided per request (infra/auth/transport.ts) ──
// An old `.env` or container line must stay inert rather than fatal: zod strips the unknown key, so a box that
// set it boots and its plain-http sessions keep the same cookie name they had.
describe("SESSION_COOKIE_INSECURE — deleted, and an old line is inert", () => {
  test.each(["true", "false", "1", "TRUE"])("SESSION_COOKIE_INSECURE=%j boots and leaves no key on the frozen env", async (spelling) => {
    const { env } = await reimportEnvWith({ AUTH_MODE: "local", SESSION_COOKIE_INSECURE: spelling });
    expect(env).not.toHaveProperty("SESSION_COOKIE_INSECURE");
  });

  test("a `.env` line boots too", async () => {
    const dir = dirWithEnvFile(["AUTH_MODE=local", "SESSION_COOKIE_INSECURE=true"].join("\n"));
    const { env } = await reimportEnvIn(dir, {}, { vitest: false });
    expect(env).not.toHaveProperty("SESSION_COOKIE_INSECURE");
  });
});
