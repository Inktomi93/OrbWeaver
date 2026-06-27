// The credential firewall — the dispatch-level POLICY belt (the security half built in the providers
// CORE). Asserts: SOURCE × ROLE compatibility (wrong-source-for-role is fail-closed) and the D17
// max-pro-sub owner-consent belt. The ENV firewall (the sub-token isolation test) lives with the
// agent-sdk backend's `env.ts` (a later slice); the openrouter↛agent-sdk import firewall is the
// dep-cruiser rule — neither is re-tested here.

import type { CredentialSource } from "@orb/server/infra/providers";
import { assertCredentialAllowed, ProviderError } from "@orb/server/infra/providers";
import { describe, expect, test } from "vitest";

const ALL_SOURCES: readonly CredentialSource[] = [
  "max-pro-sub",
  "openrouter",
  "vllm",
  "custom_openai",
];

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
  test("embed: only openrouter + vllm are permitted; max-pro-sub and custom_openai are denied", () => {
    expect(() => assertCredentialAllowed({ role: "embed", source: "openrouter" })).not.toThrow();
    expect(() => assertCredentialAllowed({ role: "embed", source: "vllm" })).not.toThrow();
    // The owner sub credential does not authenticate embed endpoints (wrong-source-for-role).
    expect(() => assertCredentialAllowed({ role: "embed", source: "max-pro-sub" })).toThrow(
      ProviderError,
    );
    // A BYO chat endpoint doesn't serve embeddings either.
    expect(() => assertCredentialAllowed({ role: "embed", source: "custom_openai" })).toThrow(
      ProviderError,
    );
  });

  test("rerank / imageEmbed / summarize mirror embed (openrouter + vllm only)", () => {
    for (const role of ["rerank", "imageEmbed", "summarize"] as const) {
      expect(() => assertCredentialAllowed({ role, source: "vllm" })).not.toThrow();
      expect(() => assertCredentialAllowed({ role, source: "max-pro-sub" })).toThrow(ProviderError);
      expect(() => assertCredentialAllowed({ role, source: "custom_openai" })).toThrow(
        ProviderError,
      );
    }
  });

  test("generateImage is hosted-only: openrouter passes, every other source is denied", () => {
    expect(() =>
      assertCredentialAllowed({ role: "generateImage", source: "openrouter" }),
    ).not.toThrow();
    for (const source of ALL_SOURCES.filter((s) => s !== "openrouter")) {
      expect(() => assertCredentialAllowed({ role: "generateImage", source })).toThrow(
        ProviderError,
      );
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
    expect(() =>
      assertCredentialAllowed({ role: "agent", source: "custom_openai", api: "agent-sdk" }),
    ).toThrow(ProviderError);
  });

  test("a denied check throws kind:'forbidden' (not retryable)", () => {
    const thrown = captureError(() =>
      assertCredentialAllowed({ role: "embed", source: "max-pro-sub" }),
    );
    expect(thrown).toBeInstanceOf(ProviderError);
    expect(thrown.kind).toBe("forbidden");
    expect(thrown.retryable).toBe(false);
  });
});

describe("assertCredentialAllowed — the D17 max-pro-sub owner-consent belt", () => {
  test("max-pro-sub on chat is REFUSED without explicit owner consent (default OFF)", () => {
    expect(() =>
      assertCredentialAllowed({ role: "chat", source: "max-pro-sub", api: "agent-sdk" }),
    ).toThrow(ProviderError);
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
    expect(() =>
      assertCredentialAllowed({ role: "chat", source: "openrouter", api: "chat-completions" }),
    ).not.toThrow();
    expect(() =>
      assertCredentialAllowed({ role: "chat", source: "vllm", api: "chat-completions" }),
    ).not.toThrow();
  });
});
