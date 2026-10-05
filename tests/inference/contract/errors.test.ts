import { ProviderError } from "../../../packages/inference/src/contract/errors.ts";
import { expect, test } from "../../support/fixtures.ts";

test("adding batch progress preserves the failing item's stack and original cause without repeating the message", () => {
  const cause = new Error("upstream failure");
  const failure = new ProviderError({ kind: "server", retryable: true, message: "failed item", cause });
  const stack = failure.stack;
  const batch = failure.withPartialItems([undefined]);
  expect(batch.stack).toBe(stack);
  expect(batch.cause).toBe(cause);
  expect(batch.message).toBe(failure.message);
  expect(batch.partialItems).toEqual([undefined]);
  expect(failure.partialItems).toBeUndefined();
  expect(batch.toLog()).toEqual({ kind: "server", retryable: true, message: "failed item", partialItems: 0 });
});
