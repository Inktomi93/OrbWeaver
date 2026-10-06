import { portableImageryCallSchema } from "@orb/contracts/imagery";
import { makeImageryCall } from "../../support/factories/imagery-call.ts";
import { expect, test } from "../../support/fixtures.ts";

test("portable history retains partial subsets without inferring absent counts or invoice proof", () => {
  const call = portableImageryCallSchema.parse(makeImageryCall());
  expect(call.execution.usage.tokensOut).toBe(300);
  expect(call.execution.usage.tokenDetails?.output).toEqual([{ modality: "image", tokens: 200 }]);
  expect(call.execution.usage.cacheWriteTokens).toBeNull();
  expect(call.execution.usage.costProvenance).toBe("estimated");
  expect(call.execution.usage).not.toHaveProperty("responseCache");
});

test("portable response-cache facts use the canonical optional shape without inferring unknown ages", () => {
  const call = makeImageryCall();
  call.execution.usage.responseCache = { status: "hit", ageSeconds: 15, ttlSeconds: null, sourceGenerationId: null };
  expect(portableImageryCallSchema.parse(call).execution.usage.responseCache).toEqual(call.execution.usage.responseCache);
  call.execution.usage.responseCache = { status: "miss", ageSeconds: null, ttlSeconds: null, sourceGenerationId: null };
  expect(portableImageryCallSchema.parse(call).execution.usage.responseCache).toEqual(call.execution.usage.responseCache);
  expect(
    portableImageryCallSchema.safeParse({
      ...call,
      execution: { ...call.execution, usage: { ...call.execution.usage, responseCache: { ...call.execution.usage.responseCache, ageSeconds: -1 } } },
    }).success,
  ).toBe(false);
});
