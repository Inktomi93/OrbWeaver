// Unit test for kit/serde/world-info — the PURE book content-identity rule every import door dedups by.
// The planner decides which incoming embedded book LINKS to an owned library book vs mints a fresh one. This
// pins the identity rule: name + entry SET (order-independent), object-key-order-independent, and the
// null-vs-[] keys collapse — the properties that let a re-encoded identical book match its stored twin.

import type { WorldBookId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { DedupBook, DedupCandidateBook, DedupLoreEntry } from "@orb/server/kit/serde/world-info";
import { bookContentKey, findDuplicateBook } from "@orb/server/kit/serde/world-info";
import { describe } from "vitest";
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

  test("a different entry content or entry set keys DIFFERENTLY; a different NAME does not (a renamed book is the same book)", () => {
    const base = book();
    expect(bookContentKey(book({ name: "Other" }))).toBe(bookContentKey(base));
    expect(bookContentKey(book({ name: "Aria's World (2)" }))).toBe(bookContentKey(base));
    expect(bookContentKey(book({ entries: [entry({ content: "changed" })] }))).not.toBe(bookContentKey(base));
    expect(bookContentKey(book({ entries: [entry(), entry({ title: "Extra" })] }))).not.toBe(bookContentKey(base));
  });
});

describe("findDuplicateBook", () => {
  test("returns the content-equal candidate with the name it carries (the LINK case), whatever the incoming name", () => {
    const match = findDuplicateBook(book(), [candidate("world_book_a", { name: "Aria's World (2)" }), candidate("world_book_b", { entries: [] })]);
    expect(match).toEqual(candidate("world_book_a", { name: "Aria's World (2)" }));
  });

  test("returns null when no candidate matches (the MINT case) — a same-name different-content book is NOT a match", () => {
    const sameNameDifferentContent = candidate("world_book_a", { entries: [entry({ content: "totally different lore" })] });
    expect(findDuplicateBook(book(), [sameNameDifferentContent])).toBeNull();
    expect(findDuplicateBook(book(), [])).toBeNull();
  });
});
