// disciplineOptions — THE FIREWALL BASE + the credential-source → env-builder DISPATCH (providers.md
// §7.1 / Esoteric §1). The load-bearing guarantee: `credential.source` selects the RIGHT env builder
// (sub vs OR-skin vs vLLM) and an ineligible source FAILS CLOSED — a wrong dispatch is how a Max-sub
// OAuth token could land on a paid endpoint. We don't re-test the builders' internals here (env.test.ts
// owns those); we lock that the SWITCH routes each source to its builder and throws on the rest.

import type { ModelCapability } from "@orb/contracts/connection";
import type { ResolvedCredential } from "@orb/contracts/credentials";
import { ProviderError } from "@orb/server/infra/providers";
import { disciplineOptions } from "@orb/server/infra/providers/backends/agent-sdk";
import { describe, expect, test } from "vitest";
// `toSdkGeneration` is an @internal helper (not on the agent-sdk barrel), so — like resolve-chat /
// local-light's model-cache — the test reaches it by relative path. It MAPS resolve-chat's resolved
// decision into the SDK's typed Options; we lock that SDK-shape mapping here (the policy itself is
// covered by resolve-chat.test.ts).
import { toSdkGeneration } from "../../../../../../packages/server/src/infra/providers/backends/agent-sdk/translate.ts";

const OR_KEY = "sk-or-translate-test";
const OPENROUTER_BASE = "https://openrouter.ai/api";
const VLLM_TOKEN = "local-vllm";
const LOOPBACK_BASE_RE = /^http:\/\/127\.0\.0\.1:/u;
// The exact cowork bundle `tools:[]` does NOT remove — must be stripped on EVERY spawn (translate.ts).
const COWORK_DENYLIST = ["DesignSync", "Monitor", "PushNotification", "RemoteTrigger"];

const cred = (value: Record<string, unknown>): ResolvedCredential =>
  value as unknown as ResolvedCredential;

const OR_CRED = cred({ source: "openrouter", apiKey: OR_KEY, credentialId: null });
const VLLM_CRED = cred({ source: "vllm", credentialId: null });
const SUB_CRED = cred({ source: "max-pro-sub", credentialId: null });
const LOCAL_LIGHT_CRED = cred({ source: "local-light", credentialId: null });
const CUSTOM_CRED = cred({
  source: "custom_openai",
  baseUrl: "http://example.test",
  apiKey: null,
  headers: null,
  credentialId: "cust-1",
});

describe("disciplineOptions — the leak-proof firewall base", () => {
  test("every spawn gets no built-in tools, the cowork denylist, strict MCP, and no settings", () => {
    const opts = disciplineOptions(VLLM_CRED);
    expect(opts.tools).toStrictEqual([]);
    expect(opts.disallowedTools).toStrictEqual(COWORK_DENYLIST);
    expect(opts.mcpServers).toStrictEqual({});
    expect(opts.strictMcpConfig).toBe(true);
    expect(opts.settingSources).toStrictEqual([]);
  });
});

describe("disciplineOptions — credential.source DISPATCHES the env builder (the firewall)", () => {
  test("openrouter → the OR-skin builder: the key becomes the auth token, pointed at the paid skin", () => {
    const opts = disciplineOptions(OR_CRED);
    // Only the OR builder lands the credential's key on ANTHROPIC_AUTH_TOKEN at the OR base.
    expect(opts.env["ANTHROPIC_AUTH_TOKEN"]).toBe(OR_KEY);
    expect(opts.env["ANTHROPIC_BASE_URL"]).toBe(OPENROUTER_BASE);
    // Fall-through to another credential source is blocked (empty, not unset).
    expect(opts.env["ANTHROPIC_API_KEY"]).toBe("");
  });

  test("vllm → the loopback builder: keyless placeholder token at a 127.0.0.1 base", () => {
    const opts = disciplineOptions(VLLM_CRED);
    expect(opts.env["ANTHROPIC_AUTH_TOKEN"]).toBe(VLLM_TOKEN);
    expect(opts.env["ANTHROPIC_BASE_URL"]).toMatch(LOOPBACK_BASE_RE);
  });

  test("max-pro-sub → the sub builder: no auth token / base url, CLAUDE.md injection killed", () => {
    const opts = disciplineOptions(SUB_CRED);
    // The sub path carries NO explicit auth/base (the host sub credential drives it) — the marker that
    // proves the sub builder ran rather than the OR/vLLM ones.
    expect(opts.env["ANTHROPIC_AUTH_TOKEN"]).toBeUndefined();
    expect(opts.env["ANTHROPIC_BASE_URL"]).toBeUndefined();
    expect(opts.env["CLAUDE_CODE_DISABLE_CLAUDE_MDS"]).toBe("true");
  });

  test("an ineligible source FAILS CLOSED with a typed, non-retryable invalid ProviderError", () => {
    for (const bad of [LOCAL_LIGHT_CRED, CUSTOM_CRED]) {
      let caught: unknown;
      try {
        disciplineOptions(bad);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(ProviderError);
      expect((caught as ProviderError).kind).toBe("invalid");
      expect((caught as ProviderError).retryable).toBe(false);
    }
  });
});

describe("disciplineOptions — runtime overrides thread through to the builder", () => {
  test("a maxOutputTokens override lands on the spawn env", () => {
    const opts = disciplineOptions(VLLM_CRED, { maxOutputTokens: 256 });
    expect(opts.env["CLAUDE_CODE_MAX_OUTPUT_TOKENS"]).toBe("256");
  });
});

// toSdkGeneration MAPS resolve-chat's resolved decision → the SDK's typed Options + the env overrides.
// The gating policy is resolve-chat's (resolve-chat.test.ts); here we lock the SDK-VOCAB shape mapping.
const EFFORT_CAP: ModelCapability = {
  reasoning: { mode: "effort", enabled: true, effortLevels: ["minimal", "low", "high"] },
  sampling: {},
  output: { maxTokens: { min: 1, max: 4096 } },
  context: { window: 200_000 },
};

describe("toSdkGeneration — maps the resolved decision into SDK Options", () => {
  test("effort mode ON: thinking enabled, effort rides options.effort, env un-disables thinking", () => {
    const gen = toSdkGeneration({ effort: "high" }, EFFORT_CAP);
    expect(gen.options.thinking).toEqual({ type: "enabled" });
    expect(gen.options.effort).toBe("high");
    expect(gen.envOverrides.disableThinking).toBe(false);
  });

  test("the SDK effort vocab: 'minimal' aliases to the SDK's 'low'", () => {
    expect(toSdkGeneration({ effort: "minimal" }, EFFORT_CAP).options.effort).toBe("low");
  });

  test("adaptive: thinking {type:'adaptive'} carries NO budget even when one is requested; effort rides", () => {
    const cap: ModelCapability = {
      ...EFFORT_CAP,
      reasoning: { mode: "adaptive", enabled: true, effortLevels: ["high"] },
    };
    const gen = toSdkGeneration({ effort: "high", thinkingBudgetTokens: 4096 }, cap);
    expect(gen.options.thinking).toEqual({ type: "adaptive" });
    expect(gen.options.effort).toBe("high");
  });

  test("budget mode: thinking {type:'enabled', budgetTokens} clamped; effort dial stays off", () => {
    const cap: ModelCapability = {
      ...EFFORT_CAP,
      reasoning: { mode: "budget", enabled: true, budgetRange: { min: 1024, max: 8192 } },
    };
    const gen = toSdkGeneration({ effort: "high", thinkingBudgetTokens: 99_999 }, cap);
    expect(gen.options.thinking).toEqual({ type: "enabled", budgetTokens: 8192 });
    expect(gen.options.effort).toBeUndefined();
  });

  test("the display knob rides into thinking when the model supports it", () => {
    const cap: ModelCapability = {
      ...EFFORT_CAP,
      reasoning: {
        mode: "effort",
        enabled: true,
        effortLevels: ["high"],
        displayModes: ["summarized"],
      },
    };
    const gen = toSdkGeneration({ effort: "high", thinkingDisplay: "summarized" }, cap);
    expect(gen.options.thinking).toEqual({ type: "enabled", display: "summarized" });
  });

  test("OFF when no effort: thinking disabled, no effort, env leaves disableThinking unset", () => {
    const gen = toSdkGeneration({}, EFFORT_CAP);
    expect(gen.options.thinking).toEqual({ type: "disabled" });
    expect(gen.options.effort).toBeUndefined();
    expect(gen.envOverrides.disableThinking).toBeUndefined();
  });

  test("the resolved, range-clamped output cap lands on the env overrides", () => {
    expect(
      toSdkGeneration({ maxOutputTokens: 999_999 }, EFFORT_CAP).envOverrides.maxOutputTokens,
    ).toBe(4096);
  });

  test("forwards resolve-chat's warnings (the runner emits them as `warning` events)", () => {
    // EFFORT_CAP exposes no temperature range → resolve-chat drops it + warns.
    const gen = toSdkGeneration({ effort: "high", temperature: 0.7 }, EFFORT_CAP);
    expect(gen.warnings).toContainEqual({
      code: "sampling_knob_dropped",
      message: "temperature ignored: model does not expose a temperature range",
    });
  });
});
