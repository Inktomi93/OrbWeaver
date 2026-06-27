// biome-ignore-all lint/style/useNamingConvention: env var keys (AUTH_MODE, OIDC_*, SESSION_SECRET, …) are
// SCREAMING_SNAKE_CASE by external convention; the crafted process.env literals must match that shape.
// biome-ignore-all lint/style/noProcessEnv: this test DRIVES the sole env reader by crafting process.env.
import process from "node:process";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

// Re-import foundation/env under a controlled process.env so the module-level `envSchema.parse()` runs
// against the crafted input. resetModules invalidates the cache; we wipe process.env first to strip the
// runner pins; we stub `dotenv`'s `config` so a developer's local `.env` (real OIDC_ISSUER etc.) can't
// bleed in and mask the refinement under test. VITEST stays set so env's override path is the no-op.
async function reimportEnvWith(
  overrides: Record<string, string | undefined>,
): Promise<typeof import("@orb/server/foundation/env")> {
  for (const k of Object.keys(process.env)) {
    delete process.env[k];
  }
  process.env["VITEST"] = "1";
  for (const [k, v] of Object.entries(overrides)) {
    if (v !== undefined) {
      process.env[k] = v;
    }
  }
  vi.resetModules();
  vi.doMock("dotenv", () => ({ config: () => ({ parsed: {} }) }));
  const mod = await import("@orb/server/foundation/env");
  vi.doUnmock("dotenv");
  return mod;
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
        OIDC_REDIRECT_URIS: "https://x/cb",
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
        OIDC_REDIRECT_URIS: "https://x/cb",
      }),
    ).rejects.toThrow("SESSION_SECRET is required when AUTH_MODE=oidc");
  });

  test("AUTH_MODE=oidc WITH all required vars → boots clean", async () => {
    const { env } = await reimportEnvWith({
      AUTH_MODE: "oidc",
      OIDC_ISSUER: "https://idp.example",
      OIDC_CLIENT_ID: "client",
      OIDC_CLIENT_SECRET: "x",
      OIDC_REDIRECT_URIS: "https://app/cb",
      SESSION_SECRET: VALID_SESSION_SECRET,
    });
    expect(env.AUTH_MODE).toBe("oidc");
    expect(env.OIDC_ISSUER).toBe("https://idp.example");
  });

  test("AUTH_MODE=local WITHOUT LOCAL_INITIAL_PASSWORD → boot FAILS", async () => {
    await expect(
      reimportEnvWith({ AUTH_MODE: "local", SESSION_SECRET: VALID_SESSION_SECRET }),
    ).rejects.toThrow("LOCAL_INITIAL_PASSWORD is required when AUTH_MODE=local");
  });

  test("AUTH_MODE=local WITHOUT SESSION_SECRET → boot FAILS", async () => {
    await expect(
      reimportEnvWith({ AUTH_MODE: "local", LOCAL_INITIAL_PASSWORD: "abcdefgh" }),
    ).rejects.toThrow("SESSION_SECRET is required when AUTH_MODE=local");
  });

  test("invalid AUTH_MODE enum → the Zod error names the AUTH_MODE field", async () => {
    await expect(reimportEnvWith({ AUTH_MODE: "bogus" })).rejects.toThrow("AUTH_MODE");
  });

  test("SESSION_SECRET shorter than 32 chars is rejected", async () => {
    await expect(
      reimportEnvWith({
        AUTH_MODE: "oidc",
        OIDC_ISSUER: "https://idp.example",
        OIDC_CLIENT_ID: "x",
        OIDC_CLIENT_SECRET: "x",
        OIDC_REDIRECT_URIS: "https://x/cb",
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
    expect(env.RATE_LIMIT_GENERAL).toBe(120);
    expect(env.RATE_LIMIT_AI_TURN).toBe(30);
    expect(env.RATE_LIMIT_PUBLIC_IP).toBe(60);
    expect(env.RATE_LIMIT_AUTHED).toBe(600);
    expect(env.RATE_LIMIT_WINDOW_MS).toBe(60_000);
  });

  test("the boolean-string toggles transform to real booleans", async () => {
    const { env } = await reimportEnvWith({ CORPUS_AUTOINDEX: "false", EGRESS_FIREWALL: "true" });
    expect(env.CORPUS_AUTOINDEX).toBe(false);
    expect(env.EGRESS_FIREWALL).toBe(true);
    expect(env.VLLM_DISABLED).toBe(false);
    expect(env.CREDENTIALS_KEY_AUTO).toBe(false);
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
