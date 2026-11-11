// A ProviderError built with every field its constructor takes carries each one through toLog, rewrap and withPartialItems.
// @subject packages/inference/src/contract/errors.ts
import { modelIdSchema } from "@orb/contracts/inference";
import { ProviderError } from "@orb/inference";
import { brandedId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";

type Init = ConstructorParameters<typeof ProviderError>[0];

const FINISHED_ITEM = { text: "A summary the batch finished.", usage: { tokensIn: 3, tokensOut: 2, costUsd: null } };

// One value for every field of the constructor's init, so a field added to it fails `tsc` here until it is given one.
const FULL = {
  kind: "rate_limit",
  retryable: true,
  message: "the provider asked for a pause",
  resetsAt: 1_750_000_000_000,
  apiErrorStatus: 429,
  model: modelIdSchema.parse("carrier-model"),
  terminalReason: "rate_limit_exceeded",
  detail: "tokens_per_minute",
  sessionId: brandedId("AgentSdkSessionId").parse("sdk-session-1"),
  requestId: "req_carrier_1",
  width: { stated: 1024, measured: 768 },
  violations: [{ kind: "vendor-refused", mode: "hosted-common", rule: "oneOf" }],
  partialItems: [FINISHED_ITEM, undefined],
  cause: new Error("the transport failure"),
} satisfies Required<Init>;

/** The carried fields: the log reads every one but the cause chain, and logs the finished items as a count. */
function expectedLog(): Record<string, unknown> {
  const { cause: _chain, ...fields } = FULL;
  return { ...fields, partialItems: 1 };
}

function carriedFields(failure: ProviderError, except: readonly string[]): [string, unknown][] {
  return Object.keys(FULL)
    .filter((key) => !except.includes(key))
    .map((key) => [key, Reflect.get(failure, key)]);
}

test("toLog names every field the error carries, and logs the finished items only as a count", () => {
  const logged = new ProviderError(FULL).toLog();

  expect(logged).toEqual(expectedLog());
  expect(JSON.stringify(logged)).not.toContain(FINISHED_ITEM.text);
});

test("rewrap carries every field forward under the new message and chains the original as its cause", () => {
  const original = new ProviderError(FULL);

  const reframed = original.rewrap("reframed for the caller");

  expect(reframed.message).toBe("reframed for the caller");
  expect(reframed.cause).toBe(original);
  expect(Object.fromEntries(carriedFields(reframed, ["message", "cause"]))).toEqual(
    Object.fromEntries(Object.entries(FULL).filter(([key]) => key !== "message" && key !== "cause")),
  );
});

test("withPartialItems keeps every field, the message and the cause, and swaps only the finished items", () => {
  const items = [undefined, FINISHED_ITEM];

  const resent = new ProviderError(FULL).withPartialItems(items);

  expect(resent.partialItems).toEqual(items);
  expect(resent.message).toBe(FULL.message);
  expect(resent.cause).toBe(FULL.cause);
  expect(Object.fromEntries(carriedFields(resent, ["partialItems", "message", "cause"]))).toEqual(
    Object.fromEntries(Object.entries(FULL).filter(([key]) => key !== "partialItems" && key !== "message" && key !== "cause")),
  );
});
