// The wire carries the reset moment of a rate-limited provider failure beside its reason, and only that failure's.
// @subject packages/server/src/transport/trpc/error-mapping.ts
// @subject packages/server/src/transport/trpc/trpc.ts

import { PROVIDER_FAILURE_REASON_PREFIX, RATE_LIMIT_RESETS_AT_DETAIL_KEY } from "@orb/contracts/chat";
import { ProviderError } from "@orb/inference";
import { appRouter, classifyDomainError } from "@orb/server/transport/trpc";
import { present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";

const RESETS_AT = 1_900_000_000_000;
// tRPC's JSON-RPC code for TOO_MANY_REQUESTS and its HTTP status, the numbers the error shape carries.
const TOO_MANY_REQUESTS_RPC_CODE = -32_029;
const TOO_MANY_REQUESTS_STATUS = 429;

/** What the production error formatter puts on the wire for a failure the classifier maps. */
function wireDataOf(failure: ProviderError): { readonly reason: string | undefined; readonly detail: unknown } {
  const mapped = present(classifyDomainError(failure));
  const { data } = appRouter._def._config.errorFormatter({
    error: mapped,
    type: "unknown",
    path: "chat.generate",
    input: undefined,
    ctx: undefined,
    shape: { message: mapped.message, code: TOO_MANY_REQUESTS_RPC_CODE, data: { code: mapped.code, httpStatus: TOO_MANY_REQUESTS_STATUS } },
  });
  return { reason: data.reason, detail: data.detail };
}

test("a rate-limited provider failure rides its reason and the reset moment the provider stated", () => {
  const failure = new ProviderError({ kind: "rate_limit", retryable: true, message: "slow down", resetsAt: RESETS_AT });
  expect(wireDataOf(failure)).toEqual({
    reason: `${PROVIDER_FAILURE_REASON_PREFIX}rate_limit`,
    detail: { [RATE_LIMIT_RESETS_AT_DETAIL_KEY]: RESETS_AT },
  });
});

test("a rate limit that states no reset, and a failure of another kind, carry no reset detail", () => {
  const unstated = new ProviderError({ kind: "rate_limit", retryable: true, message: "slow down" });
  const rejected = new ProviderError({ kind: "auth_failed", retryable: false, message: "bad key", resetsAt: RESETS_AT });
  expect(wireDataOf(unstated).detail).toBeUndefined();
  expect(wireDataOf(rejected).detail).toBeUndefined();
});
