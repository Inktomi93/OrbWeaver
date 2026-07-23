// The credential firewall — the dispatch-level POLICY belt (the security half built in the providers
// CORE). Asserts: SOURCE × ROLE compatibility (wrong-source-for-role is fail-closed) and the D17
// max-pro-sub owner-consent belt. The ENV firewall (the sub-token isolation test) lives with the
// agent-sdk backend's `env.ts` (a later slice); the openrouter↛agent-sdk import firewall is the
// dep-cruiser rule — neither is re-tested here.

import type { CredentialSource } from "@orb/server/infra/providers";
import { assertCredentialAllowed, ProviderError } from "@orb/server/infra/providers";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures";

const ALL_SOURCES: readonly CredentialSource[] = ["max-pro-sub", "openrouter", "anthropic", "vllm", "local-light", "custom_openai", "venice"];

/** Run `fn` and return the thrown ProviderError — keeps assertions OUT of a catch block
 *  (noConditionalExpect) while still inspecting the error's `kind`/`retryable`. */
function captureError(fn: () => void): ProviderError {
  try {
    fn();
  } catch (err) {
    return err as ProviderError;
  }
  throw new Error("expected the call to throw, but it did not");
}

describe("assertCredentialAllowed — source × role compatibility (fail-closed)", () => {
  test("embed: openrouter + vllm + local-light are permitted; max-pro-sub and custom_openai are denied", () => {
    for (const source of ["openrouter", "vllm", "local-light"] as const) {
      expect(() => assertCredentialAllowed({ role: "embed", source })).not.toThrow();
    }
    // The owner sub credential does not authenticate embed endpoints (wrong-source-for-role).
    expect(() => assertCredentialAllowed({ role: "embed", source: "max-pro-sub" })).toThrow(ProviderError);
    // A BYO chat endpoint doesn't serve embeddings either.
    expect(() => assertCredentialAllowed({ role: "embed", source: "custom_openai" })).toThrow(ProviderError);
  });

  test("rerank / imageEmbed mirror embed (openrouter + vllm + local-light)", () => {
    for (const role of ["rerank", "imageEmbed"] as const) {
      for (const source of ["openrouter", "vllm", "local-light"] as const) {
        expect(() => assertCredentialAllowed({ role, source })).not.toThrow();
      }
      expect(() => assertCredentialAllowed({ role, source: "max-pro-sub" })).toThrow(ProviderError);
      expect(() => assertCredentialAllowed({ role, source: "custom_openai" })).toThrow(ProviderError);
    }
  });

  test("summarize is a chat-turn shaper: openrouter + vllm + anthropic (MA-10 direct-vision), NOT the chat-less local-light tier", () => {
    expect(() => assertCredentialAllowed({ role: "summarize", source: "openrouter" })).not.toThrow();
    expect(() => assertCredentialAllowed({ role: "summarize", source: "vllm" })).not.toThrow();
    expect(() => assertCredentialAllowed({ role: "summarize", source: "anthropic" })).not.toThrow();
    for (const source of ["local-light", "max-pro-sub", "custom_openai"] as const) {
      expect(() => assertCredentialAllowed({ role: "summarize", source })).toThrow(ProviderError);
    }
  });

  test("generateImage is hosted-only: openrouter + venice pass, every other source is denied", () => {
    const allowed: readonly CredentialSource[] = ["openrouter", "venice"];
    for (const source of allowed) {
      expect(() => assertCredentialAllowed({ role: "generateImage", source })).not.toThrow();
    }
    for (const source of ALL_SOURCES.filter((s) => !allowed.includes(s))) {
      expect(() => assertCredentialAllowed({ role: "generateImage", source })).toThrow(ProviderError);
    }
  });

  test("agent mode permits the agent-sdk-eligible sources (sub/skin/vllm) but never a BYO endpoint", () => {
    for (const source of ["max-pro-sub", "openrouter", "vllm"] as const) {
      // max-pro-sub needs consent (asserted below); pass it here so this case isolates source policy.
      expect(() =>
        assertCredentialAllowed({
          role: "agent",
          source,
          api: "agent-sdk",
          ownerConsented: true,
        }),
      ).not.toThrow();
    }
    expect(() => assertCredentialAllowed({ role: "agent", source: "custom_openai", api: "agent-sdk" })).toThrow(ProviderError);
  });

  test("a denied check throws kind:'forbidden' (not retryable)", () => {
    const thrown = captureError(() => assertCredentialAllowed({ role: "embed", source: "max-pro-sub" }));
    expect(thrown).toBeInstanceOf(ProviderError);
    expect(thrown.kind).toBe("forbidden");
    expect(thrown.retryable).toBe(false);
  });
});

describe("assertCredentialAllowed — the D17 max-pro-sub owner-consent belt", () => {
  test("max-pro-sub on chat is REFUSED without explicit owner consent (default OFF)", () => {
    expect(() => assertCredentialAllowed({ role: "chat", source: "max-pro-sub", api: "agent-sdk" })).toThrow(ProviderError);
    // ownerConsented explicitly false is still a refusal (consent must be affirmatively ON).
    expect(() =>
      assertCredentialAllowed({
        role: "chat",
        source: "max-pro-sub",
        api: "agent-sdk",
        ownerConsented: false,
      }),
    ).toThrow(ProviderError);
  });

  test("max-pro-sub on chat is ALLOWED once owner consent is ON", () => {
    expect(() =>
      assertCredentialAllowed({
        role: "chat",
        source: "max-pro-sub",
        api: "agent-sdk",
        ownerConsented: true,
      }),
    ).not.toThrow();
  });

  test("the consent belt only applies to max-pro-sub — other sources need no consent", () => {
    expect(() => assertCredentialAllowed({ role: "chat", source: "openrouter", api: "chat-completions" })).not.toThrow();
    expect(() => assertCredentialAllowed({ role: "chat", source: "vllm", api: "chat-completions" })).not.toThrow();
  });
});

describe("assertCredentialAllowed — the first-party anthropic source (W11) serves chat + agent", () => {
  test("anthropic is permitted for chat (the tool-less direct wire) — no consent needed, it is the user's own paid key", () => {
    expect(() => assertCredentialAllowed({ role: "chat", source: "anthropic", api: "anthropic-messages" })).not.toThrow();
  });

  test("anthropic is permitted for agent (the native agent-sdk path — W11 owner ruling) with no consent gate", () => {
    expect(() => assertCredentialAllowed({ role: "agent", source: "anthropic", api: "agent-sdk" })).not.toThrow();
  });

  test("anthropic is DENIED for the vector/image roles — embed/rerank/imageEmbed/generateImage (summarize is allowed, MA-10)", () => {
    for (const role of ["embed", "rerank", "imageEmbed", "generateImage"] as const) {
      expect(() => assertCredentialAllowed({ role, source: "anthropic", api: "anthropic-messages" })).toThrow(ProviderError);
    }
  });
});
