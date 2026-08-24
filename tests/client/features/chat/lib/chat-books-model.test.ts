// The per-chat LOREBOOKS rack's pure model (#640) — the picker's offer set.

import type { WorldBookId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { attachableBooks } from "../../../../../packages/client/src/features/chat/lib/chat-books-model.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const ASHFALL = castId<WorldBookId>("worldbook_ct_0000000000001");
const NOTES = castId<WorldBookId>("worldbook_ct_0000000000002");

const LIBRARY = [
  { id: ASHFALL, name: "Ashfall Canon", description: null, createdAt: 1 },
  { id: NOTES, name: "Session Notes", description: null, createdAt: 2 },
];

describe("attachableBooks — the picker's offer set", () => {
  test("offers every owned book when the room carries none", () => {
    expect(attachableBooks(LIBRARY, []).map((book) => book.id)).toEqual([ASHFALL, NOTES]);
  });

  test("never offers a book the room already carries — re-attaching is an invisible no-op", () => {
    expect(attachableBooks(LIBRARY, [ASHFALL]).map((book) => book.id)).toEqual([NOTES]);
  });

  test("subtracts an attached id the caller does not own (a previous host's book is still IN the room)", () => {
    // `listForChat` is not owner-filtered, so the attached set can name a book absent from this library.
    // The subtraction must not choke on it, and must not start offering the caller's own books twice.
    const foreign = castId<WorldBookId>("worldbook_ct_0000000000009");
    expect(attachableBooks(LIBRARY, [foreign, NOTES]).map((book) => book.id)).toEqual([ASHFALL]);
  });
});
