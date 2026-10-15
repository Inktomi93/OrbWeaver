// @subject tests/support/node/factories/imagery-view.ts
import { expect, test } from "../fixtures.ts";
import { makeGenerationProvenance } from "./imagery-view.ts";

test("provenance snapshots keep unknown usage distinct from recorded zero without changing linked image identities", () => {
  const unknown = makeGenerationProvenance();
  const zero = makeGenerationProvenance({
    ...unknown,
    costUsd: 0,
    usage: { ...unknown.usage, tokensIn: 0, tokensOut: 0, cacheReadTokens: 0, costProvenance: "measured" },
    edited: true,
  });
  expect(zero.assetId).toBe(unknown.assetId);
  expect(zero.generationId).toBe(unknown.generationId);
  expect(zero.costUsd).toBe(0);
  expect(zero.usage.tokensIn).toBe(0);
  expect(zero.usage.cacheReadTokens).toBe(0);
  expect(zero.usage.costProvenance).toBe("measured");
  expect(zero.usage.tokenDetails).toBeNull();
  expect(zero.usage).not.toHaveProperty("responseCache");
  expect(unknown.costUsd).toBeNull();
  expect(unknown.usage.tokensIn).toBeNull();
  expect(unknown.usage.costProvenance).toBeNull();
  expect(unknown.edited).toBe(false);
  expect(unknown.subjectCharacterId).toBeNull();
  expect(unknown.identityHash).toBeNull();
});
