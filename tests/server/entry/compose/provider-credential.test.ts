// provider-credential — the entry-tier adapter between credential resolution and provider execution.
// A stored-secret configuration failure becomes ProviderError invalid/non-retryable without retaining cause.

import type { CredentialSource } from "@orb/contracts/credentials";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { CredentialsDecryptError } from "@orb/server/domain/credentials";
import { ProviderError } from "@orb/server/infra/providers";
import { describe } from "vitest";
import { mapProviderCredentialResolver } from "../../../../packages/server/src/entry/compose/provider-credential.ts";
import { principal } from "../../../support/factories/principal.ts";
import { expect, test } from "../../../support/fixtures.ts";

describe("mapProviderCredentialResolver", () => {
  test("maps decrypt/config failure onto the provider retry taxonomy without secret-bearing cause", async () => {
    const secret = "credential cannot";
    const resolve = mapProviderCredentialResolver(() => Promise.reject(new CredentialsDecryptError([secret])));

    let caught: unknown;
    try {
      await resolve({ principal: principal(castId<UserId>("user_provider_credential")), source: "custom_openai" as CredentialSource });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ProviderError);
    expect(caught).toMatchObject({ kind: "invalid", retryable: false, detail: "credential_decrypt_failed" });
    expect(JSON.stringify(caught)).not.toContain(secret);
    expect(JSON.stringify((caught as ProviderError).toLog())).not.toContain(secret);
    expect((caught as Error).cause).toBeUndefined();
  });
});
