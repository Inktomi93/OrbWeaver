// substrate/token-usage — the one pure resolver for imported row-text token accounting. Pins: an inspected
// source count wins and reports 'measured'; absent that, the kit estimator measures the text and reports
// 'estimated'; and the count lands on the RIGHT side of the role axis (assistant → tokensOut, else tokensIn).

import { estimateTokens } from "@orb/kit/tokens";
import { describe } from "vitest";
import { recordedTokenCountFromMetadata, resolveImportedTokenUsage } from "../../../../../packages/server/src/domain/import/substrate/token-usage.ts";
import { expect, test } from "../../../../support/fixtures.ts";

describe("recordedTokenCountFromMetadata", () => {
  test("a valid non-negative safe integer token_count is read through", () => {
    // biome-ignore lint/style/useNamingConvention: the ST wire field `token_count` appears verbatim in test fixtures.
    expect(recordedTokenCountFromMetadata({ token_count: 42 })).toBe(42);
  });

  test("null metadata, a missing key, a negative, or a non-integer all resolve to null", () => {
    expect(recordedTokenCountFromMetadata(null)).toBeNull();
    expect(recordedTokenCountFromMetadata({})).toBeNull();
    // biome-ignore lint/style/useNamingConvention: the ST wire field `token_count` appears verbatim in test fixtures.
    expect(recordedTokenCountFromMetadata({ token_count: -1 })).toBeNull();
    // biome-ignore lint/style/useNamingConvention: the ST wire field `token_count` appears verbatim in test fixtures.
    expect(recordedTokenCountFromMetadata({ token_count: "42" })).toBeNull();
  });
});

describe("resolveImportedTokenUsage", () => {
  test("a recorded count wins and reports 'measured', landing on tokensOut for an assistant row", () => {
    const result = resolveImportedTokenUsage({ role: "assistant", content: "hi", recordedTokenCount: 10 });
    expect(result).toEqual({ tokensIn: null, tokensOut: 10, tokenProvenance: "measured" });
  });

  test("no recorded count falls back to the kit estimator and reports 'estimated', on tokensIn for a user row", () => {
    const content = "hello world";
    const result = resolveImportedTokenUsage({ role: "user", content, recordedTokenCount: null });
    expect(result).toEqual({ tokensIn: estimateTokens(content), tokensOut: null, tokenProvenance: "estimated" });
  });
});
