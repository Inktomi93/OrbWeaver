import type { ChatSource, ModelCapability, ModelCatalogEntry } from "@orb/contracts/connection";
import {
  CHAT_APIS,
  chatApiSchema,
  EFFORT_LEVELS,
  effortLevelSchema,
  modelCapabilitySchema,
  modelCatalogEntrySchema,
  openRouterProviderRoutingSchema,
  parseProviderRouting,
  REASONING_MODES,
  reasoningModeSchema,
  VERBOSITY_LEVELS,
  verbositySchema,
} from "@orb/contracts/connection";
import type { CredentialSource } from "@orb/contracts/credentials";
import { expect, test } from "vitest";

// --- ChatSource IS CredentialSource (D31, the load-bearing pin) ---------------
// The type-level identity pin (ChatSource ≡ CredentialSource) lives in `index.test-d.ts` (spine/testing.md
// §1); here we keep the runtime bidirectional-assignability check.

test("ChatSource is a verbatim re-export of CredentialSource (D31, no second tuple)", () => {
  // Runtime: a value typed as one is assignable as the other in both directions.
  const fromSource: CredentialSource = "openrouter";
  const asChatSource: ChatSource = fromSource;
  const backAgain: CredentialSource = asChatSource;
  expect(backAgain).toBe("openrouter");
});

// --- ChatApi — the protocol axis (canonical here) ----------------------------

test("chatApiSchema round-trips every protocol member", () => {
  for (const api of CHAT_APIS) {
    expect(chatApiSchema.parse(api)).toBe(api);
  }
  expect(CHAT_APIS).toEqual(["agent-sdk", "chat-completions", "responses"]);
});

test("chatApiSchema rejects a non-member", () => {
  expect(chatApiSchema.safeParse("openrouter").success).toBe(false);
});

// --- OpenRouter provider routing (lenient parse) -----------------------------

test("openRouterProviderRoutingSchema round-trips a known-knob blob", () => {
  const prefs = {
    order: ["Anthropic"],
    allow_fallbacks: false,
    sort: "throughput" as const,
  };
  expect(openRouterProviderRoutingSchema.parse(prefs)).toEqual(prefs);
});

test("parseProviderRouting keeps unknown fields and heals non-objects to undefined", () => {
  // `.loose()` preserves a not-yet-modelled field rather than dropping it.
  const withExtra = { order: ["Anthropic"], some_new_or_knob: true };
  expect(parseProviderRouting(withExtra)).toEqual(withExtra);
  expect(parseProviderRouting(null)).toBeUndefined();
  expect(parseProviderRouting("not an object")).toBeUndefined();
});

// --- ModelCapability — distinct axes; EffortLevel excludes 'none' -------------

test("EFFORT_LEVELS excludes the off-switch 'none' (connection.md invariant 3)", () => {
  expect((EFFORT_LEVELS as readonly string[]).includes("none")).toBe(false);
  expect(effortLevelSchema.safeParse("none").success).toBe(false);
  // The off-switch lives on its OWN axis: 'none' is a reasoning MODE, never an effort LEVEL.
  expect((REASONING_MODES as readonly string[]).includes("none")).toBe(true);
  expect(reasoningModeSchema.parse("none")).toBe("none");
});

test("verbositySchema round-trips its members", () => {
  for (const level of VERBOSITY_LEVELS) {
    expect(verbositySchema.parse(level)).toBe(level);
  }
});

test("modelCapabilitySchema round-trips a descriptor with distinct reasoning/sampling axes", () => {
  const window = 200_000;
  const maxOut = 64_000;
  const capability: ModelCapability = {
    reasoning: {
      mode: "effort",
      enabled: true,
      effortLevels: ["low", "medium", "high", "max"],
      displayModes: ["summarized"],
    },
    sampling: {
      temperature: { min: 0, max: 2 },
      topP: { min: 0, max: 1 },
      seed: true,
    },
    verbosity: ["low", "high"],
    output: { maxTokens: { min: 1, max: maxOut } },
    context: { window, supports1M: true },
  };
  expect(modelCapabilitySchema.parse(capability)).toEqual(capability);
});

// --- ModelCatalogEntry — explicit shape, nullable prices ---------------------

test("modelCatalogEntrySchema round-trips an entry with nullable pricing", () => {
  const entry: ModelCatalogEntry = {
    id: "anthropic/claude-sonnet-4.6",
    name: "Claude Sonnet 4.6",
    contextLength: 200_000,
    promptPrice: null,
    completionPrice: null,
    cacheReadPrice: null,
    cacheWritePrice: null,
    inputModalities: ["text", "image"],
    supportedParameters: ["tools", "reasoning", "temperature"],
  };
  expect(modelCatalogEntrySchema.parse(entry)).toEqual(entry);
});
