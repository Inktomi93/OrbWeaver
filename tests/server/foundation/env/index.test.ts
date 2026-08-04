// biome-ignore-all lint/style/useNamingConvention: env var keys (AUTH_MODE, OIDC_*, SESSION_SECRET, …) are
// SCREAMING_SNAKE_CASE by external convention; the crafted process.env literals must match that shape.
// biome-ignore-all lint/style/noProcessEnv: this test DRIVES the sole env reader by crafting process.env.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { afterAll, afterEach, beforeEach, describe, vi } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

// Every re-import runs with the process CWD parked in a throwaway directory. foundation/env's `.env`
// loader is cwd-relative (as dotenv's was), so this is what keeps a developer's real repo-root `.env`
// (real OIDC_ISSUER etc.) from bleeding in and masking the refinement under test — and it exercises the
// REAL loader instead of mocking a module out of the way. It is also the seam the loader suite below
// uses to hand the production code a crafted `.env`.
const tempDirs: string[] = [];

function makeDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

/** A throwaway cwd holding a `.env` with exactly these bytes. */
function dirWithEnvFile(contents: string): string {
  const dir = makeDir("orb-env-w3-file-");
  writeFileSync(join(dir, ".env"), contents);
  return dir;
}

const EMPTY_DIR = makeDir("orb-env-w3-empty-");

afterAll(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Re-import foundation/env under a controlled process.env + cwd so the module-level `envSchema.parse()`
// (and the `.env` load that precedes it) run against the crafted input. resetModules invalidates the
// cache; we wipe process.env first to strip the runner pins.
//
// `vitest: false` DROPS the VITEST pin — that is the only way to exercise the production override arm,
// since `skipOverride` is derived at module load from VITEST/ORB_ENV_NO_OVERRIDE.
async function reimportEnvIn(
  cwd: string,
  overrides: Record<string, string | undefined>,
  opts: { readonly vitest?: boolean } = {},
): Promise<typeof import("@orb/server/foundation/env")> {
  for (const k of Object.keys(process.env)) {
    delete process.env[k];
  }
  if (opts.vitest !== false) {
    process.env["VITEST"] = "1";
  }
  for (const [k, v] of Object.entries(overrides)) {
    if (v !== undefined) {
      process.env[k] = v;
    }
  }
  vi.resetModules();
  const previousCwd = process.cwd();
  process.chdir(cwd);
  try {
    return await import("@orb/server/foundation/env");
  } finally {
    process.chdir(previousCwd);
  }
}

function reimportEnvWith(overrides: Record<string, string | undefined>): Promise<typeof import("@orb/server/foundation/env")> {
  return reimportEnvIn(EMPTY_DIR, overrides);
}

const SESSION_SECRET_LEN = 32;
const VALID_SESSION_SECRET = "x".repeat(SESSION_SECRET_LEN);

describe("foundation/env — the AUTH_MODE superRefine boot-fatality", () => {
  let snapshot: Record<string, string | undefined>;

  beforeEach(() => {
    snapshot = { ...process.env };
  });
  afterEach(() => {
    for (const k of Object.keys(process.env)) {
      delete process.env[k];
    }
    Object.assign(process.env, snapshot);
    vi.resetModules();
  });

  test("AUTH_MODE=oidc WITHOUT OIDC_ISSUER → boot FAILS at parse", async () => {
    await expect(
      reimportEnvWith({
        AUTH_MODE: "oidc",
        OIDC_CLIENT_ID: "x",
        OIDC_CLIENT_SECRET: "x",
        OIDC_REDIRECT_URIS: "https://x/api/auth/oidc/callback",
        SESSION_SECRET: VALID_SESSION_SECRET,
      }),
    ).rejects.toThrow("OIDC_ISSUER is required when AUTH_MODE=oidc");
  });

  test("AUTH_MODE=oidc WITHOUT SESSION_SECRET → boot FAILS", async () => {
    await expect(
      reimportEnvWith({
        AUTH_MODE: "oidc",
        OIDC_ISSUER: "https://idp.example",
        OIDC_CLIENT_ID: "x",
        OIDC_CLIENT_SECRET: "x",
        OIDC_REDIRECT_URIS: "https://x/api/auth/oidc/callback",
      }),
    ).rejects.toThrow("SESSION_SECRET is required when AUTH_MODE=oidc");
  });

  test("AUTH_MODE=oidc WITH all required vars → boots clean", async () => {
    const { env } = await reimportEnvWith({
      AUTH_MODE: "oidc",
      OIDC_ISSUER: "https://idp.example",
      OIDC_CLIENT_ID: "client",
      OIDC_CLIENT_SECRET: "x",
      OIDC_REDIRECT_URIS: "https://app/api/auth/oidc/callback",
      SESSION_SECRET: VALID_SESSION_SECRET,
    });
    expect(env.AUTH_MODE).toBe("oidc");
    expect(env.OIDC_ISSUER).toBe("https://idp.example");
    // The callback allowlist is a raw CSV string here (parsed into the per-request derivation allowlist at
    // entry/lifecycle — env just carries the floor).
    expect(env.OIDC_REDIRECT_URIS).toBe("https://app/api/auth/oidc/callback");
    // provider-agnostic claim/scope mapping defaults to authentik's shape (non-breaking).
    expect(env.OIDC_SCOPES).toBe("openid profile email");
    expect(env.OIDC_USERNAME_CLAIM).toBe("preferred_username");
    expect(env.OIDC_UID_CLAIM).toBe("sub");
    expect(env.OIDC_GROUPS_CLAIM).toBe("groups");
  });

  test("AUTH_MODE=oidc WITHOUT OIDC_REDIRECT_URIS → boot FAILS", async () => {
    await expect(
      reimportEnvWith({
        AUTH_MODE: "oidc",
        OIDC_ISSUER: "https://idp.example",
        OIDC_CLIENT_ID: "x",
        OIDC_CLIENT_SECRET: "x",
        SESSION_SECRET: VALID_SESSION_SECRET,
      }),
    ).rejects.toThrow("OIDC_REDIRECT_URIS is required when AUTH_MODE=oidc");
  });

  test("OIDC claim overrides parse (provider-agnostic Okta/Azure shape)", async () => {
    const { env } = await reimportEnvWith({
      AUTH_MODE: "oidc",
      OIDC_ISSUER: "https://idp.example",
      OIDC_CLIENT_ID: "client",
      OIDC_CLIENT_SECRET: "x",
      OIDC_REDIRECT_URIS: "https://app/api/auth/oidc/callback",
      SESSION_SECRET: VALID_SESSION_SECRET,
      OIDC_SCOPES: "openid profile email groups",
      OIDC_USERNAME_CLAIM: "upn",
      OIDC_UID_CLAIM: "oid",
      OIDC_GROUPS_CLAIM: "roles",
    });
    expect(env.OIDC_SCOPES).toBe("openid profile email groups");
    expect(env.OIDC_USERNAME_CLAIM).toBe("upn");
    expect(env.OIDC_UID_CLAIM).toBe("oid");
    expect(env.OIDC_GROUPS_CLAIM).toBe("roles");
  });

  test("AUTH_MODE=local WITHOUT LOCAL_INITIAL_PASSWORD → boot FAILS", async () => {
    await expect(reimportEnvWith({ AUTH_MODE: "local", SESSION_SECRET: VALID_SESSION_SECRET })).rejects.toThrow(
      "LOCAL_INITIAL_PASSWORD is required when AUTH_MODE=local",
    );
  });

  test("AUTH_MODE=local WITHOUT SESSION_SECRET → boot FAILS", async () => {
    await expect(reimportEnvWith({ AUTH_MODE: "local", LOCAL_INITIAL_PASSWORD: "abcdefgh" })).rejects.toThrow(
      "SESSION_SECRET is required when AUTH_MODE=local",
    );
  });

  test("invalid AUTH_MODE enum → the Zod error names the AUTH_MODE field", async () => {
    await expect(reimportEnvWith({ AUTH_MODE: "bogus" })).rejects.toThrow("AUTH_MODE");
  });

  test("a multi-handle OWNER_HANDLES is boot-fatal (D17: exactly one owner)", async () => {
    await expect(reimportEnvWith({ OWNER_HANDLES: "alice,bob" })).rejects.toThrow("OWNER_HANDLES must name EXACTLY ONE owner");
  });

  test("a whitespace/empty-padded single handle still boots (only real duplicates fail)", async () => {
    const { env } = await reimportEnvWith({ OWNER_HANDLES: " alice , , " });
    expect(env.OWNER_HANDLES).toBe(" alice , , ");
  });

  test("SESSION_SECRET shorter than 32 chars is rejected", async () => {
    await expect(
      reimportEnvWith({
        AUTH_MODE: "oidc",
        OIDC_ISSUER: "https://idp.example",
        OIDC_CLIENT_ID: "x",
        OIDC_CLIENT_SECRET: "x",
        OIDC_REDIRECT_URIS: "https://x/api/auth/oidc/callback",
        SESSION_SECRET: "too-short",
      }),
    ).rejects.toThrow("SESSION_SECRET");
  });
});

describe("foundation/env — the floor parse (defaults + transforms)", () => {
  let snapshot: Record<string, string | undefined>;

  beforeEach(() => {
    snapshot = { ...process.env };
  });
  afterEach(() => {
    for (const k of Object.keys(process.env)) {
      delete process.env[k];
    }
    Object.assign(process.env, snapshot);
    vi.resetModules();
  });

  // The PROD-SAFETY defaults for the debug/observability gates. Pinned HERE — against an empty env in an
  // empty cwd — rather than in the wire-capture unit test, which reads the ambient `env` and therefore
  // inherits whatever the repo `.env` says: an operator debugging with `WIRE_CAPTURE=on` turned that test
  // red and it read as a code regression. A default flipped to "on" would ship capture into prod silently,
  // so the guarantee belongs somewhere no local file can mask it.
  test("the debug/observability gates default OFF (no local .env can mask this)", async () => {
    const { env } = await reimportEnvWith({});
    expect(env.WIRE_CAPTURE).toBe("off");
    expect(env.RPG_TRACE).toBe("off");
    expect(env.DEBUG_TOKEN).toBeUndefined();
  });

  test("the zero-infra single-user default needs no SSO/secret vars", async () => {
    const { env } = await reimportEnvWith({});
    expect(env.AUTH_MODE).toBe("single-user");
    expect(env.AUTH_FALLBACK).toBe("owner");
    expect(env.DEFAULT_USER_HANDLE).toBe("owner");
    expect(env.PORT).toBe(8788);
    expect(env.LOG_LEVEL).toBe("info");
    expect(env.NODE_ENV).toBe("development");
  });

  test("rate-limit budgets are boot-env with the documented floor", async () => {
    const { env } = await reimportEnvWith({});
    expect(env.RATE_LIMIT_AI_TURN).toBe(30);
    expect(env.RATE_LIMIT_PUBLIC_IP).toBe(60);
    expect(env.RATE_LIMIT_AUTHED).toBe(600);
    expect(env.RATE_LIMIT_LOGIN).toBe(10);
    expect(env.RATE_LIMIT_WINDOW_MS).toBe(60_000);
  });

  test("the boolean-string toggles transform to real booleans", async () => {
    const { env } = await reimportEnvWith({ CORPUS_AUTOINDEX: "false", EGRESS_FIREWALL: "true" });
    expect(env.CORPUS_AUTOINDEX).toBe(false);
    expect(env.EGRESS_FIREWALL).toBe(true);
    expect(env.VLLM_DISABLED).toBe(false);
    expect(env.CREDENTIALS_KEY_AUTO).toBe(false);
  });

  // `envBool` is `z.stringbool` with PINNED `{truthy:["true"], falsy:["false"], case:"sensitive"}`. Bare
  // `z.stringbool()` is case-INSENSITIVE and also accepts 1/0/yes/no/on/off — adopting it unpinned would
  // silently widen every boolean knob's vocabulary. These are the spellings that MUST stay boot-fatal, so a
  // future author who drops the params gets a RED here instead of a quiet posture drift.
  test.each(["TRUE", "True", "1", "yes", "on", "", " true"])("env boolean knobs REFUSE the widened spelling %j at boot", async (spelling) => {
    await expect(reimportEnvWith({ EGRESS_FIREWALL: spelling })).rejects.toThrow();
  });

  test("env boolean knobs still accept exactly lowercase true/false (and 0/off are NOT falsy)", async () => {
    expect((await reimportEnvWith({ EGRESS_FIREWALL: "false" })).env.EGRESS_FIREWALL).toBe(false);
    expect((await reimportEnvWith({ EGRESS_FIREWALL: "true" })).env.EGRESS_FIREWALL).toBe(true);
    await expect(reimportEnvWith({ EGRESS_FIREWALL: "0" })).rejects.toThrow();
    await expect(reimportEnvWith({ EGRESS_FIREWALL: "off" })).rejects.toThrow();
  });

  test("processEnvSnapshot returns a copy of the raw process.env (the agent-sdk baseline)", async () => {
    const { processEnvSnapshot } = await reimportEnvWith({ SOME_HOST_VAR: "present" });
    const snap = processEnvSnapshot();
    expect(snap["SOME_HOST_VAR"]).toBe("present");
    // A copy, not the live object — mutating the snapshot must not touch process.env.
    snap["SOME_HOST_VAR"] = "mutated";
    expect(process.env["SOME_HOST_VAR"]).toBe("present");
  });
});

// The `.env` loader (node:util parseEnv + our explicit merge; dotenv died 2026-08-03, node-26 program
// §3). The OVERRIDE DIRECTION is the load-bearing part and is asserted BOTH WAYS: a drop-in swap to
// `process.loadEnvFile()` — which can only ever fill unset keys — turns the first test here RED.
describe("foundation/env — the .env load (override semantics + parser tolerance)", () => {
  let snapshot: Record<string, string | undefined>;

  beforeEach(() => {
    snapshot = { ...process.env };
  });
  afterEach(() => {
    for (const k of Object.keys(process.env)) {
      delete process.env[k];
    }
    Object.assign(process.env, snapshot);
    vi.resetModules();
  });

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
        "IMPORT_SKIP_CHARACTERS='Ruby, Assistant'",
        'ST_PROFILE_DIR="/tmp/st profiles"',
        'TRUSTED_LOCAL_HOSTS="a\\nb"',
        "this line is junk with no separator",
        "OWNER_GROUP=admins # inline comment",
        "PORT=9001",
      ].join("\n")}\r\nLOG_LEVEL=debug\r\n`,
    );
    const { env } = await reimportEnvIn(dir, {}, { vitest: false });
    expect(env.DEFAULT_USER_HANDLE).toBe("exported");
    expect(env.IMPORT_SKIP_CHARACTERS).toBe("Ruby, Assistant");
    expect(env.ST_PROFILE_DIR).toBe("/tmp/st profiles");
    expect(env.TRUSTED_LOCAL_HOSTS).toBe("a\nb");
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
});
