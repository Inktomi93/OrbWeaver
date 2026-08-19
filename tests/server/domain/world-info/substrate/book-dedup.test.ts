// Unit test for domain/world-info/substrate/book-dedup — the PURE embedded-book content-dedup rule (#303).
// The planner decides which incoming embedded book LINKS to an owned library book vs mints a fresh one. This
// pins the identity rule: name + entry SET (order-independent), object-key-order-independent, and the
// null-vs-[] keys collapse — the properties that let a re-encoded identical book match its stored twin.

import type { WorldBookId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import type { DedupBook, DedupCandidateBook, DedupLoreEntry } from "../../../../../packages/server/src/domain/world-info/contract/book-dedup.ts";
import { bookContentKey, findDuplicateBook } from "../../../../../packages/server/src/domain/world-info/substrate/book-dedup.ts";
import { expect, test } from "../../../../support/fixtures.ts";

function entry(over: Partial<DedupLoreEntry> = {}): DedupLoreEntry {
  return {
    title: "The Kingdom",
    description: null,
    content: "A realm of eternal dusk.",
    keys: ["kingdom", "realm"],
    enabled: true,
    priority: 10,
    ignoreBudget: false,
    metadata: null,
    ...over,
  };
}

function book(over: Partial<DedupBook> = {}): DedupBook {
  return { name: "Aria's World", entries: [entry()], ...over };
}

function candidate(id: string, over: Partial<DedupBook> = {}): DedupCandidateBook {
  return { id: castId<WorldBookId>(id), ...book(over) };
}

describe("bookContentKey", () => {
  test("is entry-order independent — the same entry set in any order keys identically", () => {
    const a = book({ entries: [entry({ title: "One", keys: ["a"] }), entry({ title: "Two", keys: ["b"] })] });
    const b = book({ entries: [entry({ title: "Two", keys: ["b"] }), entry({ title: "One", keys: ["a"] })] });
    expect(bookContentKey(a)).toBe(bookContentKey(b));
  });

  test("is object-key-order independent inside metadata", () => {
    const a = book({ entries: [entry({ metadata: { scopeMode: "always", position: "before" } })] });
    const b = book({ entries: [entry({ metadata: { position: "before", scopeMode: "always" } })] });
    expect(bookContentKey(a)).toBe(bookContentKey(b));
  });

  test("collapses empty keys and null keys to the same identity (the world_entries NULL-vs-[] axis)", () => {
    const empty = book({ entries: [entry({ keys: [] })] });
    const nulled = book({ entries: [entry({ keys: null })] });
    expect(bookContentKey(empty)).toBe(bookContentKey(nulled));
  });

  test("a different name, entry content, or entry set keys DIFFERENTLY", () => {
    const base = book();
    expect(bookContentKey(book({ name: "Other" }))).not.toBe(bookContentKey(base));
    expect(bookContentKey(book({ entries: [entry({ content: "changed" })] }))).not.toBe(bookContentKey(base));
    expect(bookContentKey(book({ entries: [entry(), entry({ title: "Extra" })] }))).not.toBe(bookContentKey(base));
  });
});

describe("findDuplicateBook", () => {
  test("returns the id of a content-equal candidate (the LINK case)", () => {
    const match = findDuplicateBook(book(), [candidate("world_book_a"), candidate("world_book_b", { name: "Different" })]);
    expect(match).toBe(castId<WorldBookId>("world_book_a"));
  });

  test("returns null when no candidate matches (the MINT case) — a same-name different-content book is NOT a match", () => {
    const sameNameDifferentContent = candidate("world_book_a", { entries: [entry({ content: "totally different lore" })] });
    expect(findDuplicateBook(book(), [sameNameDifferentContent])).toBeNull();
    expect(findDuplicateBook(book(), [])).toBeNull();
  });
});
