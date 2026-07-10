// biome-ignore-all lint/style/useNamingConvention: the SDK HookInput fixture uses snake_case wire fields
// (hook_event_name, session_id, transcript_path).
//
// disciplineOptions — THE FIREWALL BASE + the credential-source → env-builder DISPATCH (providers.md
// §7.1 / Esoteric §1). The load-bearing guarantee: `credential.source` selects the RIGHT env builder
// (sub vs OR-skin vs vLLM) and an ineligible source FAILS CLOSED — a wrong dispatch is how a Max-sub
// OAuth token could land on a paid endpoint. We don't re-test the builders' internals here (env.test.ts
// owns those); we lock that the SWITCH routes each source to its builder and throws on the rest.

import { SYSTEM_PROMPT_DYNAMIC_BOUNDARY } from "@anthropic-ai/claude-agent-sdk";
import type { ModelCapability } from "@orb/contracts/connection";
import type { ResolvedCredential } from "@orb/contracts/credentials";
import { ProviderError } from "@orb/server/infra/providers";
import {
  disciplineOptions,
  dynamicContextOptions,
} from "@orb/server/infra/providers/backends/agent-sdk";
import { describe } from "vitest";
// `toSdkGeneration` is an @internal helper (not on the agent-sdk barrel), so — like resolve-chat /
// local-light's model-cache — the test reaches it by relative path. It MAPS resolve-chat's resolved
// decision into the SDK's typed Options; we lock that SDK-shape mapping here (the policy itself is
// covered by resolve-chat.test.ts).
// `buildSystemPrompt` is likewise not on the agent-sdk barrel (its only consumer is the sibling
// runner.ts); the test reaches it by the same relative path as `toSdkGeneration`.
import {
  buildSystemPrompt,
  toSdkGeneration,
} from "../../../../../../packages/server/src/infra/providers/backends/agent-sdk/translate.ts";
import { expect, test } from "../../../../../support/fixtures";

const OR_KEY = "sk-or-translate-test";
const OPENROUTER_BASE = "https://openrouter.ai/api";
const VLLM_TOKEN = "local-vllm";
// The derived tier→slug map the connection domain supplies for a mode-2 (openrouter) dispatch.
const TIER_MODELS = {
  opus: "anthropic/claude-opus-4.8",
  sonnet: "anthropic/claude-sonnet-5",
  haiku: "anthropic/claude-haiku-4.5",
} as const;
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
    const opts = disciplineOptions(VLLM_CRED, undefined);
    expect(opts.tools).toStrictEqual([]);
    expect(opts.disallowedTools).toStrictEqual(COWORK_DENYLIST);
    expect(opts.mcpServers).toStrictEqual({});
    expect(opts.strictMcpConfig).toBe(true);
    expect(opts.settingSources).toStrictEqual([]);
  });
});

describe("disciplineOptions — credential.source DISPATCHES the env builder (the firewall)", () => {
  test("openrouter → the OR-skin builder: the key becomes the auth token, pointed at the paid skin", () => {
    const opts = disciplineOptions(OR_CRED, TIER_MODELS);
    // Only the OR builder lands the credential's key on ANTHROPIC_AUTH_TOKEN at the OR base.
    expect(opts.env["ANTHROPIC_AUTH_TOKEN"]).toBe(OR_KEY);
    expect(opts.env["ANTHROPIC_BASE_URL"]).toBe(OPENROUTER_BASE);
    // Fall-through to another credential source is blocked (empty, not unset).
    expect(opts.env["ANTHROPIC_API_KEY"]).toBe("");
    // The tier map the caller passed is the one the firewall wrote (no hardcoded strings in the builder).
    expect(opts.env["ANTHROPIC_DEFAULT_SONNET_MODEL"]).toBe(TIER_MODELS.sonnet);
  });

  test("openrouter WITHOUT a tier map FAILS CLOSED — a mode-2 turn must carry the derived map", () => {
    // The domain always derives + threads the map (the derivation never throws); its absence at dispatch
    // is a programming error, never a silent fall-through to a hardcoded default.
    let caught: unknown;
    try {
      disciplineOptions(OR_CRED, undefined);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ProviderError);
    expect((caught as ProviderError).kind).toBe("invalid");
    expect((caught as ProviderError).retryable).toBe(false);
  });

  test("vllm → the loopback builder: keyless placeholder token at a 127.0.0.1 base", () => {
    const opts = disciplineOptions(VLLM_CRED, undefined);
    expect(opts.env["ANTHROPIC_AUTH_TOKEN"]).toBe(VLLM_TOKEN);
    expect(opts.env["ANTHROPIC_BASE_URL"]).toMatch(LOOPBACK_BASE_RE);
  });

  test("max-pro-sub → the sub builder: no auth token / base url, CLAUDE.md injection killed", () => {
    const opts = disciplineOptions(SUB_CRED, undefined);
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
        disciplineOptions(bad, undefined);
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
    const opts = disciplineOptions(VLLM_CRED, undefined, { maxOutputTokens: 256 });
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

describe("dynamicContextOptions — the mid-conversation operator-context seam", () => {
  test("builds ONE UserPromptSubmit hook whose callback returns the context as additionalContext", async () => {
    const opts = dynamicContextOptions("[scene: the tavern is burning]");
    const matchers = opts.hooks?.UserPromptSubmit;
    expect(matchers).toHaveLength(1);
    const hook = matchers?.[0]?.hooks[0];
    expect(hook).toBeDefined();
    // The callback's own param type (derived from the seam — no SDK import, keeping the D8 seal); the
    // hook ignores its input, so a structurally-satisfying literal is enough and stays type-checked.
    type HookInput = Parameters<NonNullable<typeof hook>>[0];
    const input = {
      hook_event_name: "UserPromptSubmit",
      prompt: "hi",
      session_id: "s",
      transcript_path: "/dev/null",
      cwd: "/",
    } satisfies Partial<HookInput> as HookInput;
    const out = await hook?.(input, undefined, { signal: new AbortController().signal });
    expect(out).toStrictEqual({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: "[scene: the tavern is burning]",
      },
    });
  });

  test("whitespace-only context yields NO hooks (an empty reminder must not spend a control round-trip)", () => {
    expect(dynamicContextOptions("   \n ")).toStrictEqual({});
  });
});

// buildSystemPrompt — the "system"-mode projection into the SDK `systemPrompt` shape. The load-bearing
// guarantee is LEAK-PROOFING: the boundary sentinel must NEVER reach the model. The array+boundary form is
// FORBIDDEN — b1 2026-07-10 (SDK 0.3.206) proved the runtime split is flag-gated OFF, so a standalone
// marker element rides through as visible prompt text. So the halves JOIN into one string (`static\n\n
// dynamic`) and any marker copy in user text is stripped from BOTH halves before the join. We lock:
// (a) both present → the joined string, static-before-dynamic; (b) the sentinel appears NOWHERE in the
// output; (c) the degenerate halves collapse to a plain string / undefined.
/** Does the emitted prompt (string, string[], or undefined) contain the sentinel substring ANYWHERE? A
 *  leak-free build is `false`. Returned (not asserted inline) so the caller's `expect` stays unconditional
 *  (noConditionalExpect). */
function outputHidesMarker(out: string | string[] | undefined): boolean {
  if (out === undefined) {
    return false;
  }
  const blocks = Array.isArray(out) ? out : [out];
  return blocks.some((b) => b.includes(SYSTEM_PROMPT_DYNAMIC_BOUNDARY));
}

describe("buildSystemPrompt — the leak-free joined projection", () => {
  const STATIC = "You are a careful roleplay engine.";
  const DYNAMIC = "[scene: the tavern is burning]";

  test("undefined input → undefined (the SDK uses its own default, nothing to send)", () => {
    expect(buildSystemPrompt(undefined)).toBeUndefined();
  });

  test("both halves empty/whitespace → undefined", () => {
    expect(buildSystemPrompt({ static: "  ", dynamic: "\n\t " })).toBeUndefined();
  });

  test("both halves present → the JOINED string (static\\n\\ndynamic), no boundary sentinel", () => {
    const out = buildSystemPrompt({ static: STATIC, dynamic: DYNAMIC });
    // The array+boundary form is forbidden (b1: it leaks) — the output is the joined string.
    expect(out).toBe(`${STATIC}\n\n${DYNAMIC}`);
    expect(Array.isArray(out)).toBe(false);
    // Static strictly before dynamic; the sentinel appears NOWHERE.
    expect((out as string).indexOf(STATIC)).toBeLessThan((out as string).indexOf(DYNAMIC));
    expect(outputHidesMarker(out)).toBe(false);
  });

  test("empty/whitespace dynamic → plain static STRING", () => {
    expect(buildSystemPrompt({ static: STATIC, dynamic: "   " })).toBe(STATIC);
  });

  test("empty static + dynamic present → plain dynamic STRING", () => {
    expect(buildSystemPrompt({ static: "", dynamic: DYNAMIC })).toBe(DYNAMIC);
  });

  test("halves are trimmed before the join", () => {
    const out = buildSystemPrompt({ static: `  ${STATIC}  `, dynamic: `\n${DYNAMIC}\n` });
    expect(out).toBe(`${STATIC}\n\n${DYNAMIC}`);
  });

  test("a marker copy in EITHER user half is stripped — it never reaches the joined output", () => {
    const dirtyStatic = `${STATIC} ${SYSTEM_PROMPT_DYNAMIC_BOUNDARY} tail`;
    const dirtyDynamic = `head ${SYSTEM_PROMPT_DYNAMIC_BOUNDARY} ${DYNAMIC}`;
    const out = buildSystemPrompt({ static: dirtyStatic, dynamic: dirtyDynamic });
    // Both smuggled copies are gone — the sentinel appears nowhere in the emitted prompt.
    expect(outputHidesMarker(out)).toBe(false);
    // The real content survives the strip.
    expect((out as string).includes("tail")).toBe(true);
    expect((out as string).includes(DYNAMIC)).toBe(true);
  });

  test("a lone marker in the static half strips to empty → collapses to the plain dynamic string", () => {
    const out = buildSystemPrompt({ static: SYSTEM_PROMPT_DYNAMIC_BOUNDARY, dynamic: DYNAMIC });
    expect(out).toBe(DYNAMIC);
    expect(outputHidesMarker(out)).toBe(false);
  });

  test("repeated/adjacent marker copies in one half are ALL stripped", () => {
    const dynamic = `${SYSTEM_PROMPT_DYNAMIC_BOUNDARY}${SYSTEM_PROMPT_DYNAMIC_BOUNDARY} ${DYNAMIC} ${SYSTEM_PROMPT_DYNAMIC_BOUNDARY}`;
    const out = buildSystemPrompt({ static: STATIC, dynamic });
    // The real content survives, with every smuggled marker removed.
    expect((out as string).includes(DYNAMIC)).toBe(true);
    expect(outputHidesMarker(out)).toBe(false);
  });

  test("a half that is ONLY marker copies in both → strips to nothing → undefined", () => {
    const both = `${SYSTEM_PROMPT_DYNAMIC_BOUNDARY} ${SYSTEM_PROMPT_DYNAMIC_BOUNDARY}`;
    expect(buildSystemPrompt({ static: both, dynamic: both })).toBeUndefined();
  });
});
