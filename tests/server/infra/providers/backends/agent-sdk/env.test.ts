// The CARRIED-FORWARD credential-firewall test (providers.md §7.1 / Esoteric §1). The load-bearing
// security guarantees: a mode-2 OR-skin spawn can NEVER see the Max-sub OAuth token, AND a preset's
// escape hatch can NEVER set/strip a reserved (auth/routing/isolation) key. If any of these flip, the sub
// token can leak to a paid endpoint — a ban-risk hole.

import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  buildClaudeOpenRouterEnv,
  buildClaudeSdkEnv,
  buildClaudeVllmEnv,
  RESERVED_CLAUDE_ENV_KEYS,
} from "@orb/server/infra/providers/backends/agent-sdk";
import { afterEach, describe, expect, test, vi } from "vitest";

const OR_KEY = "sk-or-test-key";
const FAKE_SUB_TOKEN = "oauth-sub-token-SECRET";
const OPENROUTER_BASE = "https://openrouter.ai/api";
const KEY_REQUIRED_RE = /OpenRouter API key is required/u;
const LOOPBACK_BASE_RE = /^http:\/\/127\.0\.0\.1:/u;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("mode-2 (OpenRouter-Anthropic skin) firewall", () => {
  test("the sub OAuth token is structurally unreachable — every host credential source is nulled", () => {
    // Simulate an ambient host sub token + the app's own secret in the environment.
    vi.stubEnv("CLAUDE_CODE_OAUTH_TOKEN", FAKE_SUB_TOKEN);
    vi.stubEnv("ANTHROPIC_IDENTITY_TOKEN", FAKE_SUB_TOKEN);
    vi.stubEnv("OPENROUTER_API_KEY", "host-or-secret");

    const env = buildClaudeOpenRouterEnv(OR_KEY);

    // The token string appears NOWHERE in the spawn env.
    expect(Object.values(env)).not.toContain(FAKE_SUB_TOKEN);
    // Every host credential source is explicitly nulled.
    expect(env["CLAUDE_CODE_OAUTH_TOKEN"]).toBeUndefined();
    expect(env["ANTHROPIC_IDENTITY_TOKEN"]).toBeUndefined();
    expect(env["ANTHROPIC_IDENTITY_TOKEN_FILE"]).toBeUndefined();
    expect(env["ANTHROPIC_SERVICE_ACCOUNT_ID"]).toBeUndefined();
    // The only auth in scope is the OpenRouter key, pointed at the paid skin.
    expect(env["ANTHROPIC_BASE_URL"]).toBe(OPENROUTER_BASE);
    expect(env["ANTHROPIC_AUTH_TOKEN"]).toBe(OR_KEY);
    // EMPTY string (not unset) so the runtime can't fall through to another credential source.
    expect(env["ANTHROPIC_API_KEY"]).toBe("");
    // The app's own secret is stripped from the host baseline.
    expect(env["OPENROUTER_API_KEY"]).toBeUndefined();
  });

  test("the ephemeral config dir is EMPTY — no .credentials.json is reachable", () => {
    const env = buildClaudeOpenRouterEnv(OR_KEY);
    expect(env["CLAUDE_CONFIG_DIR"]).toBeDefined();
    expect(env["ANTHROPIC_CONFIG_DIR"]).toBe(env["CLAUDE_CONFIG_DIR"]);
    const dir = env["CLAUDE_CONFIG_DIR"] as string;
    expect(existsSync(join(dir, ".credentials.json"))).toBe(false);
  });

  test("a missing OpenRouter key fails loudly (the key-required invariant)", () => {
    expect(() => buildClaudeOpenRouterEnv("")).toThrow(KEY_REQUIRED_RE);
  });
});

describe("the preset escape hatch cannot breach the firewall (reserved-keys filter before the overlay)", () => {
  test("a preset can neither REPOINT auth/routing nor STRIP the firewall", () => {
    // Typed as a Record so the SCREAMING_CASE env keys are an index-signature (not literal property
    // names) — the same reason the firewall builders' own env objects don't trip useNamingConvention.
    // Built via tuples (string-literal keys, not identifier property names) so the SCREAMING_CASE
    // wire env-var names don't trip useNamingConvention.
    const hatch: Record<string, string | null> = Object.fromEntries([
      // Attempts to repoint the paid spawn / re-add the sub token / move the config dir:
      ["ANTHROPIC_BASE_URL", "https://evil.example"],
      ["ANTHROPIC_AUTH_TOKEN", "attacker-key"],
      ["CLAUDE_CODE_OAUTH_TOKEN", FAKE_SUB_TOKEN],
      ["CLAUDE_CONFIG_DIR", "/tmp/attacker"],
      ["ANTHROPIC_DEFAULT_OPUS_MODEL", "evil/model"],
      // An attempt to STRIP the firewall by unsetting it:
      ["ANTHROPIC_API_KEY", null],
      // A legitimate non-reserved knob DOES pass through:
      ["MY_CUSTOM_FLAG", "ok"],
    ]);
    const env = buildClaudeOpenRouterEnv(OR_KEY, { userEnv: hatch });

    // Runner-owned auth/routing wins over every escape-hatch attempt.
    expect(env["ANTHROPIC_BASE_URL"]).toBe(OPENROUTER_BASE);
    expect(env["ANTHROPIC_AUTH_TOKEN"]).toBe(OR_KEY);
    expect(env["CLAUDE_CODE_OAUTH_TOKEN"]).toBeUndefined();
    expect(env["ANTHROPIC_DEFAULT_OPUS_MODEL"]).toBe("anthropic/claude-opus-4.8");
    expect(env["CLAUDE_CONFIG_DIR"]).not.toBe("/tmp/attacker");
    // The strip attempt is ignored — the firewall's empty-string API key stands.
    expect(env["ANTHROPIC_API_KEY"]).toBe("");
    expect(Object.values(env)).not.toContain(FAKE_SUB_TOKEN);
    // The non-reserved knob survives.
    expect(env["MY_CUSTOM_FLAG"]).toBe("ok");
  });

  test("RESERVED_CLAUDE_ENV_KEYS names every auth/isolation/routing key the hatch must not touch", () => {
    for (const key of [
      "ANTHROPIC_API_KEY",
      "ANTHROPIC_AUTH_TOKEN",
      "ANTHROPIC_BASE_URL",
      "CLAUDE_CODE_OAUTH_TOKEN",
      "CLAUDE_CONFIG_DIR",
      "ANTHROPIC_DEFAULT_OPUS_MODEL",
    ]) {
      expect(RESERVED_CLAUDE_ENV_KEYS.has(key)).toBe(true);
    }
  });
});

describe("mode-1 (Max sub) firewall", () => {
  test("the OR-skin trio is nulled so a stale ambient export can't repoint the free sub at a paid endpoint", () => {
    vi.stubEnv("ANTHROPIC_BASE_URL", "https://stale-paid.example");
    const env = buildClaudeSdkEnv();
    expect(env["ANTHROPIC_BASE_URL"]).toBeUndefined();
    expect(env["ANTHROPIC_API_KEY"]).toBeUndefined();
    expect(env["ANTHROPIC_AUTH_TOKEN"]).toBeUndefined();
    // CLAUDE.md injection + the isolation pins are on.
    expect(env["CLAUDE_CODE_DISABLE_CLAUDE_MDS"]).toBe("true");
    expect(env["CLAUDE_CODE_DISABLE_1M_CONTEXT"]).toBe("1");
  });
});

describe("mode-3 (local vLLM) firewall", () => {
  test("loopback base URL + keyless throwaway + every host credential nulled", () => {
    vi.stubEnv("CLAUDE_CODE_OAUTH_TOKEN", FAKE_SUB_TOKEN);
    const env = buildClaudeVllmEnv();
    expect(env["ANTHROPIC_BASE_URL"]).toMatch(LOOPBACK_BASE_RE);
    expect(env["ANTHROPIC_AUTH_TOKEN"]).toBe("local-vllm");
    expect(env["CLAUDE_CODE_OAUTH_TOKEN"]).toBeUndefined();
    expect(Object.values(env)).not.toContain(FAKE_SUB_TOKEN);
  });
});
