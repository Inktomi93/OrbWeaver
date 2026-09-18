/**
 * @module-tag requires-process-chdir
 */
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
  // The schema default for AUTH_FALLBACK is "deny" (the secure SSO posture). single-user mode's only
  // credential IS the owner fallback, so a test env without an explicit AUTH_FALLBACK boots fatal under
  // single-user. Inject the bootable default here so every caller that doesn't explicitly test the deny
  // path gets a working env. The dev stack pins this via stack.sh; tests pin it here.
  const mode = overrides["AUTH_MODE"] ?? "single-user";
  const needsFallback = mode === "single-user" && !("AUTH_FALLBACK" in overrides);
  const effective = needsFallback ? { AUTH_FALLBACK: "owner", ...overrides } : overrides;
  for (const [k, v] of Object.entries(effective)) {
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

  test("AUTH_MODE=local WITHOUT LOCAL_INITIAL_PASSWORD → boots (B4: the in-app first-run setup claims the owner password)", async () => {
    // B4 made LOCAL_INITIAL_PASSWORD OPTIONAL: a fresh local box seeds the owner passwordless and the
    // origin-gated one-shot `POST /api/auth/first-run` sets it on first visit. SESSION_SECRET stays required.
    const { env } = await reimportEnvWith({ AUTH_MODE: "local", SESSION_SECRET: VALID_SESSION_SECRET });
    expect(env.AUTH_MODE).toBe("local");
    expect(env.LOCAL_INITIAL_PASSWORD).toBeUndefined();
  });

  test("AUTH_MODE=local WITHOUT SESSION_SECRET → boot FAILS", async () => {
    await expect(reimportEnvWith({ AUTH_MODE: "local", LOCAL_INITIAL_PASSWORD: "abcdefgh" })).rejects.toThrow(
      "SESSION_SECRET is required when AUTH_MODE=local",
    );
  });

  test("invalid AUTH_MODE enum → the Zod error names the AUTH_MODE field", async () => {
    await expect(reimportEnvWith({ AUTH_MODE: "bogus" })).rejects.toThrow("AUTH_MODE");
  });

  // The INCOHERENT pair, in the same class as the oidc/local refusals above: single-user has no credential
  // other than the owner fallback (`resolveSingleUser` always returns null) and `infra/auth/resolve` tests
  // `fallback === "owner"` BEFORE the mode's unconditional origin arm, so this combination authenticates
  // NOBODY and every request 401s. It shipped as the container image's default env
  // (docs/history/reviews/security/2026-08-08-containerize-surface-review.md F1) precisely because three docs
  // claimed single-user ignores the knob. A silently-inert box is the failure this refusal replaces.
  test("AUTH_MODE=single-user + AUTH_FALLBACK=deny → boot FAILS (the pair authenticates nobody)", async () => {
    await expect(reimportEnvWith({ AUTH_MODE: "single-user", AUTH_FALLBACK: "deny" })).rejects.toThrow(
      "AUTH_FALLBACK=deny with AUTH_MODE=single-user leaves NO way to authenticate",
    );
  });

  // Scope control #1: the fence refuses the incoherent PAIR, never the mode's working default.
  test("single-user + AUTH_FALLBACK=owner boots (the shipped container pair)", async () => {
    const { env } = await reimportEnvWith({ AUTH_MODE: "single-user", AUTH_FALLBACK: "owner" });
    expect(env.AUTH_MODE).toBe("single-user");
    expect(env.AUTH_FALLBACK).toBe("owner");
  });

  // Scope control #2: `deny` is the SSO modes' SECURE default and must stay freely selectable — a fence
  // that made `deny` feel banned would push a public deploy back onto the peer-gated owner fallback.
  test("AUTH_MODE=oidc + AUTH_FALLBACK=deny boots — deny is the SSO-mode secure default, not a banned value", async () => {
    const { env } = await reimportEnvWith({
      AUTH_MODE: "oidc",
      AUTH_FALLBACK: "deny",
      OIDC_ISSUER: "https://idp.example",
      OIDC_CLIENT_ID: "client",
      OIDC_CLIENT_SECRET: "x",
      OIDC_REDIRECT_URIS: "https://app/api/auth/oidc/callback",
      SESSION_SECRET: VALID_SESSION_SECRET,
    });
    expect(env.AUTH_FALLBACK).toBe("deny");
  });

  // ── THE SSO-FALLBACK LEAK fence (#298 f2, owner ruling 2026-08-19) ────────────────────────────────────
  // prod + an SSO mode + AUTH_FALLBACK=owner is a mass SSO bypass: behind a same-host reverse proxy every
  // request arrives on a loopback socket, which `ownerFallbackAllowed` mints owner for. Boot-fatal in prod
  // unless AUTH_BREAK_GLASS acknowledges the on-box-recovery exception. The signal is NODE_ENV=production
  // (a proxy can't be reliably detected at boot); dev is the legit AUTH_FALLBACK=owner home and stays green.
  const oidcRequired = {
    OIDC_ISSUER: "https://idp.example",
    OIDC_CLIENT_ID: "client",
    OIDC_CLIENT_SECRET: "x",
    OIDC_REDIRECT_URIS: "https://app/api/auth/oidc/callback",
    SESSION_SECRET: VALID_SESSION_SECRET,
  } as const;

  test("prod + oidc + AUTH_FALLBACK=owner → boot FAILS (the same-host-proxy SSO bypass)", async () => {
    await expect(reimportEnvWith({ NODE_ENV: "production", AUTH_MODE: "oidc", AUTH_FALLBACK: "owner", ...oidcRequired })).rejects.toThrow("SSO BYPASS");
  });

  test("prod + local + AUTH_FALLBACK=owner → boot FAILS (every SSO mode, not just oidc)", async () => {
    await expect(reimportEnvWith({ NODE_ENV: "production", AUTH_MODE: "local", AUTH_FALLBACK: "owner", SESSION_SECRET: VALID_SESSION_SECRET })).rejects.toThrow(
      "SSO BYPASS",
    );
  });

  test("prod + forward-header + AUTH_FALLBACK=owner → boot FAILS (the third SSO mode bites too)", async () => {
    await expect(reimportEnvWith({ NODE_ENV: "production", AUTH_MODE: "forward-header", AUTH_FALLBACK: "owner" })).rejects.toThrow("SSO BYPASS");
  });

  test("prod + oidc + AUTH_FALLBACK=deny boots (the secure prod default — the owner logs in via SSO)", async () => {
    const { env } = await reimportEnvWith({ NODE_ENV: "production", AUTH_MODE: "oidc", AUTH_FALLBACK: "deny", ...oidcRequired });
    expect(env.AUTH_FALLBACK).toBe("deny");
  });

  test("prod + oidc + owner + AUTH_BREAK_GLASS=on boots (the deliberate on-box recovery exception)", async () => {
    const { env } = await reimportEnvWith({ NODE_ENV: "production", AUTH_MODE: "oidc", AUTH_FALLBACK: "owner", AUTH_BREAK_GLASS: "true", ...oidcRequired });
    expect(env.AUTH_FALLBACK).toBe("owner");
    expect(env.AUTH_BREAK_GLASS).toBe(true);
  });

  test("DEV + oidc + AUTH_FALLBACK=owner boots (the dev-tooling default — the fence is prod-only)", async () => {
    const { env } = await reimportEnvWith({ AUTH_MODE: "oidc", AUTH_FALLBACK: "owner", ...oidcRequired });
    expect(env.AUTH_FALLBACK).toBe("owner");
    expect(env.AUTH_BREAK_GLASS).toBe(false);
  });

  test("prod + single-user + AUTH_FALLBACK=owner boots (single-user is not an SSO mode — its only credential IS the fallback)", async () => {
    const { env } = await reimportEnvWith({ NODE_ENV: "production", AUTH_MODE: "single-user", AUTH_FALLBACK: "owner" });
    expect(env.AUTH_MODE).toBe("single-user");
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
    expect(mod.authFallbackDeclaredInEnvFile()).toBe(false);
    expect(mod.env.AUTH_FALLBACK).toBe("owner"); // the default, not a .env pin
  });

  // THE DEPLOY-MODE INVARIANT (PROD-LEAK, 2026-08-09). The rule + its arms are unit-tested in bind.test.ts;
  // what is pinned HERE is that the refusal is wired into the PARSE — i.e. an `env` that says
  // "non-production + a public interface" cannot come into existence, so no bind-site code path has to
  // remember to check. The live incident's env is the first case: a dev process reachable behind the proxy.
  test("NODE_ENV=development + an explicit public BIND_HOST → boot FAILS at parse (the 08-09 leak shape)", async () => {
    await expect(reimportEnvWith({ NODE_ENV: "development", BIND_HOST: "0.0.0.0" })).rejects.toThrow(
      "a NON-PRODUCTION process must not listen where an untrusted",
    );
  });

  test("the same pair with ALLOW_DEV_PUBLIC_BIND=true boots (deliberate LAN dev use is opt-in, not banned)", async () => {
    const { env } = await reimportEnvWith({ NODE_ENV: "development", BIND_HOST: "0.0.0.0", ALLOW_DEV_PUBLIC_BIND: "true" });
    expect(env.BIND_HOST).toBe("0.0.0.0");
    expect(env.ALLOW_DEV_PUBLIC_BIND).toBe(true);
  });

  // Scope control: production is the deployment posture the reverse proxy targets — a public bind there is
  // the POINT, and a fence that refused it would take the box down.
  test("NODE_ENV=production + BIND_HOST=0.0.0.0 boots (the proxy target, never refused)", async () => {
    const { env } = await reimportEnvWith({ NODE_ENV: "production", BIND_HOST: "0.0.0.0" });
    expect(env.BIND_HOST).toBe("0.0.0.0");
  });

  // Scope control: the default dev boot (no BIND_HOST) must stay green — the restriction to loopback is
  // resolved at the bind site, NOT a refusal. A fence that killed every dev boot (`pnpm stack up`) would be
  // reverted by morning and the invariant would be gone with it.
  test("NODE_ENV=development with BIND_HOST unset boots clean (restriction, not refusal)", async () => {
    const { env } = await reimportEnvWith({ NODE_ENV: "development" });
    expect(env.BIND_HOST).toBeUndefined();
    expect(env.ALLOW_DEV_PUBLIC_BIND).toBe(false);
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
        "IMPORT_SKIP_CHARACTERS='Wren, Assistant'",
        'ST_PROFILE_DIR="/tmp/st profiles"',
        'TRUSTED_PRIVATE_RANGES="a\\nb"',
        "this line is junk with no separator",
        "OWNER_GROUP=admins # inline comment",
        "PORT=9001",
      ].join("\n")}\r\nLOG_LEVEL=debug\r\n`,
    );
    const { env } = await reimportEnvIn(dir, {}, { vitest: false });
    expect(env.DEFAULT_USER_HANDLE).toBe("exported");
    expect(env.IMPORT_SKIP_CHARACTERS).toBe("Wren, Assistant");
    expect(env.ST_PROFILE_DIR).toBe("/tmp/st profiles");
    expect(env.TRUSTED_PRIVATE_RANGES).toBe("a\nb");
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

  // ENV-BLEEDS-INTO-TESTS (dogfood-tracking.md) — the fix: `ORB_ENV_NO_FILE` skips the `.env` load ENTIRELY,
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
});
