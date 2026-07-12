// @orb/contracts/hub — the gif wire schemas (D61 gallery-design §5). Pins the SECURITY-load-bearing bounds:
// the search `limit` clamp (the gif-count DoS bound + its default), the query length bounds, and the import
// URL requirement (a syntactic URL — the host allowlist is the server's real gate) + optional strict-TypeID
// subject character.

import {
  gifImportParamsSchema,
  gifSearchHitSchema,
  gifSearchParamsSchema,
} from "@orb/contracts/hub";
import { expect, test } from "../../support/fixtures";

test("gifSearchParamsSchema clamps limit 1..50 and defaults to 20", () => {
  expect(gifSearchParamsSchema.parse({ query: "cat" }).limit).toBe(20);
  expect(gifSearchParamsSchema.parse({ query: "cat", limit: 50 }).limit).toBe(50);
  expect(gifSearchParamsSchema.safeParse({ query: "cat", limit: 51 }).success).toBe(false);
  expect(gifSearchParamsSchema.safeParse({ query: "cat", limit: 0 }).success).toBe(false);
});

test("gifSearchParamsSchema bounds the query length (non-empty, ≤ 200)", () => {
  expect(gifSearchParamsSchema.safeParse({ query: "" }).success).toBe(false);
  expect(gifSearchParamsSchema.safeParse({ query: "x".repeat(201) }).success).toBe(false);
  expect(gifSearchParamsSchema.parse({ query: "a" }).query).toBe("a");
});

test("gifSearchHitSchema requires positive dims + valid preview/full URLs", () => {
  const ok = {
    id: "opaque-provider-id",
    previewUrl: "https://media.tenor.com/p.gif",
    fullUrl: "https://media.tenor.com/f.gif",
    width: 200,
    height: 100,
  };
  expect(gifSearchHitSchema.safeParse(ok).success).toBe(true);
  expect(gifSearchHitSchema.safeParse({ ...ok, width: 0 }).success).toBe(false);
  expect(gifSearchHitSchema.safeParse({ ...ok, previewUrl: "not-a-url" }).success).toBe(false);
});

test("gifImportParamsSchema requires a syntactic URL; subjectCharacterId is optional + strict-TypeID", () => {
  expect(gifImportParamsSchema.safeParse({ url: "https://media.tenor.com/f.gif" }).success).toBe(
    true,
  );
  expect(gifImportParamsSchema.safeParse({ url: "not-a-url" }).success).toBe(false);
  // A non-character-prefixed id is rejected at the wire (before the verb's ownership gate).
  expect(
    gifImportParamsSchema.safeParse({
      url: "https://media.tenor.com/f.gif",
      subjectCharacterId: "not_a_character_id",
    }).success,
  ).toBe(false);
});
