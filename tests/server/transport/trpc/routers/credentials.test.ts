// credentials router — the inspector result crosses the authenticated tRPC surface without restoring a
// credential value into the structured request/response snapshot.

import type { UserCredentialId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { CredentialsService } from "@orb/server/domain/credentials";
import { redactSecretsFromText } from "@orb/server/infra/providers/backends/kit";
import { describe, vi } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";
import { caller, makeContext, principal } from "../_support.ts";

describe("credentials router", () => {
  test.each(["a", "red", "act"])("inspectEndpoint retains no short credential %j across the tRPC result", async (secret) => {
    const scrub = (text: string): string => redactSecretsFromText(text, [secret]);
    const inspectEndpoint = vi.fn<CredentialsService["inspectEndpoint"]>().mockResolvedValue({
      ok: false,
      request: { url: scrub("https://example.test"), headers: { authorization: scrub(`Bearer ${secret}`) }, body: scrub(`{"credential":"${secret}"}`) },
      response: null,
      error: scrub(`credential ${secret} was refused`),
    });
    const ctx = makeContext({ auth: principal("user"), services: { credentials: { inspectEndpoint } } });
    const credentialId = castId<UserCredentialId>("credential_1");
    const result = await caller(ctx).credentials.inspectEndpoint({ credentialId });
    const retainedValues = [result.request.url, ...Object.values(result.request.headers), result.request.body, result.error ?? ""];
    expect(retainedValues.every((value) => !value.includes(secret))).toBe(true);
    expect(inspectEndpoint).toHaveBeenCalledWith({ principal: ctx.auth, credentialId });
  });
});
