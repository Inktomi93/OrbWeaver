// @subject packages/contracts/src/chat/messages.ts
// The variant sidecar is parsed, never cast: `message_variants.metadata` is `z.object(...).strip()`, so a key the
// schema does not declare is REMOVED at the read seam. `sources` is declared for that reason, and its array heals
// element-wise: one bad entry drops, its neighbours survive, and the whole sidecar only degrades when the blob is
// not even a list.
import { parseVariantMetadata } from "@orb/contracts/chat";
import { expect, test } from "@orb/testkit/node";

const ONE = { url: "https://example.test/one", title: "One", atChars: 6, endChars: 10, citedText: "the passage" };
const TWO = { url: "https://example.test/two", atChars: 0 };

test("the sidecar keeps a stored sources list and drops the wire's own index keys", () => {
  const parsed = parseVariantMetadata({ sources: [ONE, { ...TWO, startIndex: 3, endIndex: 7 }] });
  // The `startIndex`/`endIndex` a provider supplied are not part of the stored frame; strip mode is what proves the
  // seam is narrow rather than echoing the blob.
  expect(parsed.sources).toEqual([ONE, TWO]);
});

test("one malformed entry drops without taking its neighbours with it", () => {
  const parsed = parseVariantMetadata({ sources: [ONE, { url: 42, atChars: "soon" }, null, TWO] });
  expect(parsed.sources).toEqual([ONE, TWO]);
});

// The whole-array fallback is not the rule; it is the LAST resort, and this is the boundary that says so.
test("a sources value that is not a list degrades the sidecar instead of throwing", () => {
  expect(parseVariantMetadata({ sources: "https://example.test/one" })).toEqual({});
});
