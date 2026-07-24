// The CARRIED-FORWARD credential-firewall test (providers.md §7.1 / Esoteric §1). The load-bearing
// security guarantees: a mode-2 OR-skin spawn can NEVER see the Max-sub OAuth token, AND a preset's
// escape hatch can NEVER set/strip a reserved (auth/routing/isolation) key. If any of these flip, the sub
// token can leak to a paid endpoint — a ban-risk hole.

import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { vllmAgentModelAlias } from "@orb/server/foundation/env";
import {
  buildClaudeAnthEnv,
  buildClaudeOpenRouterEnv,
  buildClaudeSdkEnv,
  buildClaudeVllmEnv,
  RESERVED_CLAUDE_ENV_KEYS,
} from "@orb/server/infra/providers/backends/agent-sdk";
import { afterEach, describe, vi } from "vitest";
import { expect, test } from "../../../../../support/fixtures";

const OR_KEY = "sk-or-test-key";
const FAKE_SUB_TOKEN = "oauth-sub-token-SECRET";
const OPENROUTER_BASE = "https://openrouter.ai/api";
const KEY_REQUIRED_RE = /OpenRouter API key is required/u;
const ANTH_KEY_REQUIRED_RE = /Anthropic API key is required/u;
const LOOPBACK_BASE_RE = /^http:\/\/127\.0\.0\.1:/u;
// The derived tier→slug map the caller (connection) now supplies — the firewall carries NO hardcoded map.
const TIER_MODELS = {
  opus: "anthropic/claude-opus-4.8",
  sonnet: "anthropic/claude-sonnet-5",
  haiku: "anthropic/claude-haiku-4.5",
} as const;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("mode-2 (OpenRouter-Anthropic skin) firewall", () => {
  test("the sub OAuth token is structurally unreachable — every host credential source is nulled", () => {
    // Simulate an ambient host sub token + the app's own secret in the environment.
    vi.stubEnv("CLAUDE_CODE_OAUTH_TOKEN", FAKE_SUB_TOKEN);
    vi.stubEnv("ANTHROPIC_IDENTITY_TOKEN", FAKE_SUB_TOKEN);
    vi.stubEnv("OPENROUTER_API_KEY", "host-or-secret");

    const env = buildClaudeOpenRouterEnv(OR_KEY, TIER_MODELS);

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

  test("the tier envs are EXACTLY the passed tier map (no hardcoded model strings in the firewall)", () => {
    // The derived sonnet slug is the daemon-current `claude-sonnet-5`, not the old stale `4.6` pin — the
    // firewall echoes whatever the caller derived, so a family roll-forward is picked up automatically.
    const env = buildClaudeOpenRouterEnv(OR_KEY, TIER_MODELS);
    expect(env["ANTHROPIC_DEFAULT_OPUS_MODEL"]).toBe(TIER_MODELS.opus);
    expect(env["ANTHROPIC_DEFAULT_SONNET_MODEL"]).toBe(TIER_MODELS.sonnet);
    expect(env["ANTHROPIC_DEFAULT_HAIKU_MODEL"]).toBe(TIER_MODELS.haiku);
  });

  test("the ephemeral config dir is EMPTY — no .credentials.json is reachable", () => {
    const env = buildClaudeOpenRouterEnv(OR_KEY, TIER_MODELS);
    expect(env["CLAUDE_CONFIG_DIR"]).toBeDefined();
    expect(env["ANTHROPIC_CONFIG_DIR"]).toBe(env["CLAUDE_CONFIG_DIR"]);
    const dir = env["CLAUDE_CONFIG_DIR"] as string;
    expect(existsSync(join(dir, ".credentials.json"))).toBe(false);
  });

  test("a missing OpenRouter key fails loudly (the key-required invariant)", () => {
    expect(() => buildClaudeOpenRouterEnv("", TIER_MODELS)).toThrow(KEY_REQUIRED_RE);
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
    const env = buildClaudeOpenRouterEnv(OR_KEY, TIER_MODELS, { userEnv: hatch });

    // Runner-owned auth/routing wins over every escape-hatch attempt.
    expect(env["ANTHROPIC_BASE_URL"]).toBe(OPENROUTER_BASE);
    expect(env["ANTHROPIC_AUTH_TOKEN"]).toBe(OR_KEY);
    expect(env["CLAUDE_CODE_OAUTH_TOKEN"]).toBeUndefined();
    // The tier default is the CALLER's derived value (still reserved — the hatch's "evil/model" was dropped).
    expect(env["ANTHROPIC_DEFAULT_OPUS_MODEL"]).toBe(TIER_MODELS.opus);
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

describe("host baseline strips the ambient Claude/Anthropic control surface (uncontrolled-behavior leak)", () => {
  test("ambient CLAUDE_*/ANTHROPIC_*/CLAUDECODE are stripped; a non-Claude var survives", () => {
    // Simulate the operator's own Claude Code session / a deploy shell exporting control knobs.
    vi.stubEnv("CLAUDE_CODE_SOME_AMBIENT_KNOB", "ambient-value");
    vi.stubEnv("ANTHROPIC_MODEL", "some-ambient-model");
    vi.stubEnv("CLAUDECODE", "1");
    // A non-Claude ambient var the child needs / should keep.
    vi.stubEnv("SOME_UNRELATED_PATH_VAR", "/opt/keep-me");

    const env = buildClaudeSdkEnv();

    // The entire ambient Claude/Anthropic namespace is stripped from the baseline.
    expect(env["CLAUDE_CODE_SOME_AMBIENT_KNOB"]).toBeUndefined();
    expect(env["ANTHROPIC_MODEL"]).toBeUndefined();
    expect(env["CLAUDECODE"]).toBeUndefined();
    // A non-Claude ambient var passes through — the child needs PATH/HOME/etc. to spawn.
    expect(env["SOME_UNRELATED_PATH_VAR"]).toBe("/opt/keep-me");
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

  test("the default model env is the SHARED slash-free alias (the same helper healModel resolves)", () => {
    // The alias env the loopback engine serves must equal `vllmAgentModelAlias()` — the ONE derivation the
    // connection heal ALSO reads, so the runner env and the resolved requestedModel can't drift (the
    // RPG-on-vLLM 404 crash was exactly this divergence).
    const env = buildClaudeVllmEnv();
    const alias = vllmAgentModelAlias();
    expect(alias).not.toContain("/"); // Claude Code can't resolve a slash-containing id
    expect(env["ANTHROPIC_DEFAULT_OPUS_MODEL"]).toBe(alias);
    expect(env["ANTHROPIC_DEFAULT_SONNET_MODEL"]).toBe(alias);
    expect(env["ANTHROPIC_DEFAULT_HAIKU_MODEL"]).toBe(alias);
  });
});

const ANTH_KEY = "sk-ant-first-party-SECRET";

describe("mode-4 (first-party Anthropic direct) firewall — the native x-api-key agent path (W11)", () => {
  test("the real key rides ANTHROPIC_API_KEY; base URL is UNSET (native api.anthropic.com); no OAuth/ambient resolution", () => {
    // Poison the ambient env the owner's box may carry — a stale sub OAuth + an ambient base URL.
    vi.stubEnv("CLAUDE_CODE_OAUTH_TOKEN", FAKE_SUB_TOKEN);
    vi.stubEnv("ANTHROPIC_IDENTITY_TOKEN", FAKE_SUB_TOKEN);
    vi.stubEnv("ANTHROPIC_BASE_URL", "https://stale-ambient.example");

    const env = buildClaudeAnthEnv(ANTH_KEY);

    // The real first-party key is the ONLY auth; it rides the native x-api-key var.
    expect(env["ANTHROPIC_API_KEY"]).toBe(ANTH_KEY);
    // Base URL is UNSET — the runtime uses its native api.anthropic.com default, NOT the poisoned ambient one.
    expect(env["ANTHROPIC_BASE_URL"]).toBeUndefined();
    // No Bearer/OAuth path — every ambient credential source is nulled so no config/OAuth minting can fire.
    expect(env["ANTHROPIC_AUTH_TOKEN"]).toBeUndefined();
    expect(env["CLAUDE_CODE_OAUTH_TOKEN"]).toBeUndefined();
    expect(env["ANTHROPIC_IDENTITY_TOKEN"]).toBeUndefined();
    expect(env["ANTHROPIC_IDENTITY_TOKEN_FILE"]).toBeUndefined();
    expect(env["ANTHROPIC_SERVICE_ACCOUNT_ID"]).toBeUndefined();
    // The poisoned sub token appears NOWHERE in the spawn env.
    expect(Object.values(env)).not.toContain(FAKE_SUB_TOKEN);
  });

  test("the ephemeral config dir is EMPTY — the host ~/.claude sub credentials are unreachable", () => {
    const env = buildClaudeAnthEnv(ANTH_KEY);
    expect(env["CLAUDE_CONFIG_DIR"]).toBeDefined();
    expect(env["ANTHROPIC_CONFIG_DIR"]).toBe(env["CLAUDE_CONFIG_DIR"]);
    const dir = env["CLAUDE_CONFIG_DIR"] as string;
    expect(existsSync(join(dir, ".credentials.json"))).toBe(false);
  });

  test("a preset escape hatch can neither repoint the base nor re-add an OAuth token", () => {
    const hatch: Record<string, string | null> = Object.fromEntries([
      ["ANTHROPIC_BASE_URL", "https://evil.example"],
      ["ANTHROPIC_API_KEY", "attacker-key"],
      ["CLAUDE_CODE_OAUTH_TOKEN", FAKE_SUB_TOKEN],
      ["MY_CUSTOM_FLAG", "ok"],
    ]);
    const env = buildClaudeAnthEnv(ANTH_KEY, { userEnv: hatch });
    // Reserved keys are stripped BEFORE the overlay — the runner-owned key + unset base stand.
    expect(env["ANTHROPIC_API_KEY"]).toBe(ANTH_KEY);
    expect(env["ANTHROPIC_BASE_URL"]).toBeUndefined();
    expect(env["CLAUDE_CODE_OAUTH_TOKEN"]).toBeUndefined();
    expect(Object.values(env)).not.toContain(FAKE_SUB_TOKEN);
    expect(env["MY_CUSTOM_FLAG"]).toBe("ok");
  });

  test("a missing Anthropic key fails loudly (the key-required invariant)", () => {
    expect(() => buildClaudeAnthEnv("")).toThrow(ANTH_KEY_REQUIRED_RE);
  });
});

describe("byte-stability — cache-buster tripwires (a nondeterministic env busts the prompt cache)", () => {
  test("mode-1 env is deep-equal across calls with the same overrides", () => {
    const overrides = { maxOutputTokens: 2048, disableThinking: false };
    expect(buildClaudeSdkEnv(overrides)).toStrictEqual(buildClaudeSdkEnv(overrides));
  });

  test("mode-2 env is deep-equal across calls with the same key + overrides", () => {
    expect(buildClaudeOpenRouterEnv("sk-or-x", TIER_MODELS, { maxContextTokens: 100_000 })).toStrictEqual(
      buildClaudeOpenRouterEnv("sk-or-x", TIER_MODELS, { maxContextTokens: 100_000 }),
    );
  });

  test("mode-3 env is deep-equal across calls", () => {
    expect(buildClaudeVllmEnv()).toStrictEqual(buildClaudeVllmEnv());
  });

  test("mode-4 env is deep-equal across calls with the same key + overrides", () => {
    expect(buildClaudeAnthEnv("sk-ant-x", { maxContextTokens: 100_000 })).toStrictEqual(buildClaudeAnthEnv("sk-ant-x", { maxContextTokens: 100_000 }));
  });
});

// SDK-UPGRADE TRIPWIRE (#9 VERIFY): the env var NAMES the builder emits are read by the BUNDLED claude runtime the
// SDK spawns — a JS-wrapper type never validates them, and a silent rename on an SDK bump would make the knob a
// no-op (e.g. `DISABLE_AUTO_COMPACT` no longer disabling auto-compact, so SDK-native compaction fires UNDERNEATH
// our managed layer). This pins each emitted name against the bundled runtime source (`bridge.mjs` — the
// extract-from-bunfs bridge the SDK loads); a bump that renames one fails HERE, loudly. EVIDENCE (2026-07-24,
// bundle 2.1.216): all five are PRESENT — neo's `DISABLE_AUTO_COMPACT` + `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` (which
// break the CLAUDE_CODE_* prefix its siblings use) are REAL runtime keys, not silent no-ops.

// The bundled runtime source the SDK spawns. `bridge.mjs` is not an exports subpath, so resolve the package's MAIN
// entry (a package export) and take its sibling bundle file — never a hand-typed node_modules path.
const bridgeSource = readFileSync(join(dirname(createRequire(import.meta.url).resolve("@anthropic-ai/claude-agent-sdk")), "bridge.mjs"), "utf8");

// The compaction/context/output knob names the builder can emit — the SET this guards. `CLAUDE_EFFORT` is emitted
// as `undefined` (a clear, never a set) so it isn't a runtime-read key we depend on.
const GUARDED_ENV_NAMES = [
  "DISABLE_AUTO_COMPACT",
  "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE",
  "CLAUDE_CODE_MAX_CONTEXT_TOKENS",
  "CLAUDE_CODE_MAX_OUTPUT_TOKENS",
  "CLAUDE_CODE_DISABLE_THINKING",
] as const;

describe("agent-sdk env — bundled-runtime name parity (SDK-upgrade tripwire)", () => {
  test("every guarded env name is a real key in the bundled claude runtime", () => {
    for (const name of GUARDED_ENV_NAMES) {
      // A whole-word match — the name must appear as a literal token in the runtime bundle, not a substring.
      expect(bridgeSource, `env name ${name} vanished from the bundled runtime — an SDK bump renamed it (this knob is now a no-op)`).toMatch(
        new RegExp(`\\b${name}\\b`),
      );
    }
  });

  test("the builder actually emits the compaction-disable + pct-override keys when asked", () => {
    // Managed/off mode disables auto-compact; auto mode sets the pct override — the two names the compaction path
    // depends on. This asserts our builder emits them (the parity test above asserts the runtime reads them).
    const disabled = buildClaudeSdkEnv({ disableAutoCompact: true, autoCompactPct: 90 });
    expect(disabled["DISABLE_AUTO_COMPACT"]).toBe("1");
    expect(disabled["CLAUDE_AUTOCOMPACT_PCT_OVERRIDE"]).toBe("90");
    // Every guarded name the builder emits must be in the guarded set (so a NEW emitted name can't silently escape
    // the parity pin) — the builder's compaction/context keys are a subset of GUARDED_ENV_NAMES.
    const emitted = new Set(Object.keys(buildClaudeSdkEnv({ disableAutoCompact: true, autoCompactPct: 90, maxContextTokens: 1000, maxOutputTokens: 500 })));
    for (const name of ["DISABLE_AUTO_COMPACT", "CLAUDE_AUTOCOMPACT_PCT_OVERRIDE", "CLAUDE_CODE_MAX_CONTEXT_TOKENS", "CLAUDE_CODE_MAX_OUTPUT_TOKENS"]) {
      expect(emitted.has(name)).toBe(true);
    }
  });
});
