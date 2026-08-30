// domain/credentials/substrate/mint — the single construction home for the brand-protected
// `ResolvedCredential` arms. Pins the load-bearing gate: mintMaxProSub is UNCONSTRUCTABLE for a non-owner
// principal (requireOwner throws before the cast is reached), and the other mint factories carry their
// fields through verbatim.

import type { UserCredentialId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { requireOwner } from "@orb/server/domain/admin";
import { describe } from "vitest";
import {
  mintCustomOpenAi,
  mintLocalLight,
  mintMaxProSub,
  mintOpenRouter,
  mintVllm,
} from "../../../../../packages/server/src/domain/credentials/substrate/mint.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { principal } from "../../character/_support.ts";

describe("mintMaxProSub — owner-only gate", () => {
  test("an OWNER principal mints the box credential (no key, no row)", () => {
    const owner = principal(castId<UserId>("user_owner"), "owner");
    expect(mintMaxProSub(owner, requireOwner)).toEqual({ source: "max-pro-sub", credentialId: null });
  });

  test("a non-owner principal is REFUSED — the cast is unreachable without requireOwner passing first", () => {
    const regular = principal(castId<UserId>("user_regular"), "user");
    expect(() => mintMaxProSub(regular, requireOwner)).toThrow();
  });
});

describe("the other mints carry their fields through verbatim", () => {
  test("mintOpenRouter", () => {
    const credentialId = castId<UserCredentialId>("user_credential_x");
    expect(mintOpenRouter("sk-test", credentialId)).toEqual({ source: "openrouter", apiKey: "sk-test", credentialId });
  });

  test("mintVllm / mintLocalLight — no key, no row, source-only markers", () => {
    expect(mintVllm()).toEqual({ source: "vllm", credentialId: null });
    expect(mintLocalLight()).toEqual({ source: "local-light", credentialId: null });
  });

  test("mintCustomOpenAi carries every field, including a null apiKey for no-auth local servers", () => {
    const credentialId = castId<UserCredentialId>("user_credential_y");
    const cred = mintCustomOpenAi({
      baseUrl: "http://localhost:8080",
      apiKey: null,
      headers: { "x-custom": "1" },
      credentialId,
      model: "local-model",
      contextWindow: 4096,
      includeBody: null,
      excludeBody: null,
      responseMap: null,
    });
    expect(cred).toEqual({
      source: "custom_openai",
      baseUrl: "http://localhost:8080",
      apiKey: null,
      headers: { "x-custom": "1" },
      credentialId,
      model: "local-model",
      contextWindow: 4096,
      includeBody: null,
      excludeBody: null,
      responseMap: null,
    });
  });
});
