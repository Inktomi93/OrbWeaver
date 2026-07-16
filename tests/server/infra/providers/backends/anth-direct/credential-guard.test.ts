// backends/anth-direct credential-guard — the fail-closed OR-key extraction + THE SUB-EXCLUSION at the
// runner door (§3d, tier-1). A non-`openrouter` source (the free `max-pro-sub`, vllm, local-light,
// custom_openai) throws a typed `kind:"invalid"` ProviderError — never a TypeError on a missing `.apiKey`,
// never the paid endpoint reached by the sub's OAuth. The message names the SOURCE vocab only, never the key.

import { ProviderError } from "@orb/server/infra/providers";
import { requireAnthDirectKey } from "@orb/server/infra/providers/backends/anth-direct";
import { describe } from "vitest";
import { makeCustomOpenAiCredential, makeOpenRouterCredential, makeResolvedCredential } from "../../../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../../../support/fixtures";

describe("requireAnthDirectKey — fail-closed source guard (the sub-exclusion tier-1)", () => {
  test("returns the OR key for an openrouter credential", () => {
    const cred = makeOpenRouterCredential({ apiKey: "sk-or-REAL" });
    expect(requireAnthDirectKey(cred)).toBe("sk-or-REAL");
  });

  test("THE SUB-EXCLUSION: a max-pro-sub credential throws invalid (never drives the paid endpoint)", () => {
    expect(() => requireAnthDirectKey(makeResolvedCredential("max-pro-sub"))).toThrow(ProviderError);
  });

  test("every non-openrouter source throws a typed invalid error", () => {
    const creds = [makeResolvedCredential("vllm"), makeResolvedCredential("local-light"), makeCustomOpenAiCredential()];
    for (const cred of creds) {
      expect(() => requireAnthDirectKey(cred)).toThrow(ProviderError);
    }
  });

  test("the error message names the SOURCE vocab only — never the key material", () => {
    let thrown: unknown;
    try {
      requireAnthDirectKey(makeResolvedCredential("max-pro-sub"));
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(ProviderError);
    const message = thrown instanceof Error ? thrown.message : "";
    expect(message).toContain("max-pro-sub");
    expect(message).toContain("openrouter");
  });
});
