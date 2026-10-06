import { tokenizeResultSchema, wordTokensSchema } from "@orb/contracts/inference";
import { expect, test } from "../../support/fixtures.ts";

test("tokenization preserves success and per-word failure independently", () => {
  const value = {
    available: true,
    words: [
      { ok: true, word: "rain", ids: [0, 7], pieces: ["r", "ain"] },
      { ok: false, word: "sun", reason: "not answered" },
    ],
  };
  expect(tokenizeResultSchema.parse(JSON.parse(JSON.stringify(value)))).toEqual(value);
  expect(tokenizeResultSchema.parse({ available: false, words: [] })).toEqual({ available: false, words: [] });
});

test("a successful word requires valid integer token identities and a failed word requires its reason", () => {
  for (const ids of [[-1], [0.5], ["1"]]) {
    expect(wordTokensSchema.safeParse({ ok: true, word: "x", ids }).success).toBe(false);
  }
  expect(wordTokensSchema.safeParse({ ok: true, word: "x" }).success).toBe(false);
  expect(wordTokensSchema.safeParse({ ok: false, word: "x" }).success).toBe(false);
});
