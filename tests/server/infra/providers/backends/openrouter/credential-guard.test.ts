// backends/openrouter credential-guard — converts a brand-protected ResolvedCredential into the bare API
// key, fail-closing (typed invalid) on any non-openrouter source. The message names the source vocab only
// (never the key).

import type { ResolvedCredential } from "@orb/contracts/credentials";
import { ProviderError } from "@orb/server/infra/providers";
import { requireOpenRouterApiKey } from "@orb/server/infra/providers/backends/openrouter";
import { describe } from "vitest";
import { expect, test } from "../../../../../support/fixtures";

// Capture a synchronous throw without a conditional expect (the guard throws sync, so `.rejects` doesn't
// apply and an in-catch expect trips noConditionalExpect).
function capture(fn: () => unknown): unknown {
  let caught: unknown;
  try {
    fn();
  } catch (err) {
    caught = err;
  }
  return caught;
}

describe("requireOpenRouterApiKey", () => {
  test("returns the API key for an openrouter credential", () => {
    const cred = {
      source: "openrouter",
      apiKey: "sk-or-secret",
      credentialId: null,
    } as unknown as ResolvedCredential;
    expect(requireOpenRouterApiKey(cred, "chat-completions")).toBe("sk-or-secret");
  });

  test("fail-closes (typed invalid) on a non-openrouter source, without leaking a key", () => {
    const cred = { source: "vllm", credentialId: null } as unknown as ResolvedCredential;
    const err = capture(() => requireOpenRouterApiKey(cred, "embed"));
    expect(err).toBeInstanceOf(ProviderError);
    const providerError = err instanceof ProviderError ? err : undefined;
    expect(providerError?.kind).toBe("invalid");
    expect(providerError?.message).toContain("vllm");
    expect(providerError?.message).not.toContain("secret");
  });
});
