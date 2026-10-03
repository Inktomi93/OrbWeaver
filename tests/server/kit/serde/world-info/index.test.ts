// Mirror test for @orb/server/kit/serde/world-info — the ONE standalone world-info-book serde core
// (W-worldinfo). Pins BOTH directions: build emits the uniform `{schemaKind, schemaVersion}` envelope +
// every canonical field; parse REFUSES non-JSON / a wrong `schemaKind` / a mistyped entry with a typed
// reason (the isolated per-file failure, never a throw); the ACCEPT-OLD-FOREVER arm still reads a book
// written with the legacy `version` key; and the build->parse->build ROUND-TRIP identity holds.
//
// `reject-file` is this family's DECLARED rowPolicy (O-8 opt-in): one bad entry fails the whole book,
// because a lorebook that restores LOOKING complete while silently missing an entry is the worse outcome.

import type { PortableParse } from "@orb/contracts/portability";
import type { BulkImportLorebookInput } from "@orb/contracts/world-info";
import type { WorldBookId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { matchEntryKeys } from "@orb/kit/world-info";
import type { DedupBook, DedupCandidateBook, DedupLoreEntry } from "@orb/server/kit/serde/world-info";
import { bookContentKey, buildWorldBookFile, findDuplicateBook, parseWorldBookFile, WORLD_INFO_SCHEMA_KIND } from "@orb/server/kit/serde/world-info";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";

/** The parse outcome's value — the spine returns a typed refusal reason, never null. */
function refusalOf<T>(result: PortableParse<T>): string {
  if (result.ok) {
    throw new Error("expected the file to be refused, but it parsed");
  }
  return result.reason;
}

function must<T>(result: PortableParse<T>): T {
  if (!result.ok) {
    throw new Error(`portable parse refused: ${result.reason}`);
  }
  return result.value;
}

const ENC = new TextEncoder();

function book(over: Partial<BulkImportLorebookInput> = {}): BulkImportLorebookInput {
  return {
    name: "Aria's World",
    description: "the lore",
    entries: [
      {
        title: "The Kingdom",
        description: "a memo",
        content: "A realm of eternal dusk.",
        keys: ["kingdom", "realm"],
        enabled: true,
        priority: 10,
        ignoreBudget: false,
        metadata: { scopeMode: "always", vendorTail: { keep: 1 } },
      },
      {
        title: "The River",
        description: null,
        content: "It never freezes.",
        keys: [],
        enabled: false,
        priority: -5,
        ignoreBudget: true,
        metadata: null,
      },
    ],
    ...over,
  };
}

describe("buildWorldBookFile", () => {
  test("emits the envelope + a self-describing JSON object", () => {
    const parsed = JSON.parse(new TextDecoder().decode(buildWorldBookFile(book()))) as Record<string, unknown>;
    expect(parsed["schemaKind"]).toBe(WORLD_INFO_SCHEMA_KIND);
    // Build emits the UNIFORM key; the legacy `version` spelling is parse-only (external artifacts).
    expect(parsed["schemaVersion"]).toBe(1);
    expect(parsed["version"]).toBeUndefined();
    expect(parsed["name"]).toBe("Aria's World");
    expect((parsed["entries"] as unknown[]).length).toBe(2);
  });
});

describe("parseWorldBookFile", () => {
  test("round-trips the canonical shape (keys, metadata blob, and the null/empty fields all survive)", () => {
    const canonical = must(parseWorldBookFile(buildWorldBookFile(book()), "fallback"));
    expect(canonical).toEqual(book());
    expect(canonical.entries[0]?.keys).toEqual(["kingdom", "realm"]);
    expect(Object.isFrozen(canonical.entries[0]?.keys)).toBe(false);
  });

  test("null for non-JSON text", () => {
    expect(refusalOf(parseWorldBookFile(ENC.encode("{not json"), "fallback"))).toBe("not-json");
    expect(refusalOf(parseWorldBookFile(ENC.encode(""), "fallback"))).toBe("not-json");
  });

  test("null for a wrong schemaKind (a foreign file is not silently imported)", () => {
    const wrong = JSON.stringify({
      schemaKind: "some-other-format",
      version: 1,
      name: "x",
      entries: [],
    });
    expect(refusalOf(parseWorldBookFile(ENC.encode(wrong), "fallback"))).toBe("foreign-kind");
  });

  test("null for a structurally-wrong entry (a mistyped field fails the shape schema)", () => {
    const bad = JSON.stringify({
      schemaKind: WORLD_INFO_SCHEMA_KIND,
      version: 1,
      name: "x",
      description: null,
      entries: [{ title: "t", content: 42 }],
    });
    expect(refusalOf(parseWorldBookFile(ENC.encode(bad), "fallback"))).toBe("malformed");
  });
});

describe("accept-old-forever (external artifacts)", () => {
  test("a book written with the LEGACY `version` key still parses (NO-LEGACY governs the db, not a user's file)", () => {
    const legacy = JSON.stringify({
      schemaKind: WORLD_INFO_SCHEMA_KIND,
      version: 1,
      name: "Old Book",
      description: null,
      entries: [],
    });
    expect(must(parseWorldBookFile(ENC.encode(legacy), "fallback")).name).toBe("Old Book");
  });

  test("a book from a NEWER writer is REFUSED by name, not half-parsed with today's semantics", () => {
    const future = JSON.stringify({
      schemaKind: WORLD_INFO_SCHEMA_KIND,
      schemaVersion: 99,
      name: "From The Future",
      description: null,
      entries: [],
    });
    expect(refusalOf(parseWorldBookFile(ENC.encode(future), "fallback"))).toBe("newer-version");
  });
});

describe("build -> parse -> build identity", () => {
  test("the serialized JSON text is the stable fixed point", () => {
    const source = book();
    const bytes1 = buildWorldBookFile(source);
    const bytes2 = buildWorldBookFile(must(parseWorldBookFile(bytes1, "fallback")));
    expect(new TextDecoder().decode(bytes2)).toBe(new TextDecoder().decode(bytes1));
  });
});

// The raw SillyTavern grammar: the field-spelling adaptation onto the shared entry mapper, and the one
// native-only divergence, delimited-key regex detection (owner ruling).

/** The ST grammar through the one detecting parser; null when it refused (the old null-on-unreadable shape). */
function parseStWorldFile(bytes: Uint8Array, name: string): BulkImportLorebookInput | null {
  const parsed = parseWorldBookFile(bytes, name);
  return parsed.ok ? parsed.value : null;
}

/** An ST-native world file (`{ entries: { <uid>: {...} } }`) carrying one entry with the given keys. */
function stWorldBytes(keys: readonly string[], extra: Record<string, unknown> = {}): Uint8Array {
  return ENC.encode(
    JSON.stringify({
      entries: {
        "0": { uid: 0, key: keys, keysecondary: [], comment: "Greetings", content: "A greeting.", order: 100, disable: false, ...extra },
      },
    }),
  );
}

describe("parseStWorldFile — ST-native world-info", () => {
  test("a delimited `/pattern/flags` key imports as keyMode regex and actually fires (#268 arm (a))", () => {
    // ST's native world file has NO use_regex field, so before this the delimited key imported LITERAL and
    // the slashes were matched as characters — the author's pattern was silently inert.
    const stBook = parseStWorldFile(stWorldBytes(["/he(llo|y)/i"]), "greetings");
    expect(stBook).not.toBeNull();
    const entry = stBook?.entries[0];
    expect(entry?.metadata?.["keyMode"]).toBe("regex");

    // The stored columns + metadata are what the per-turn pool feeds the matcher.
    expect(matchEntryKeys(entry?.keys ?? [], "hey there", { keyMode: "regex" })).toEqual(["/he(llo|y)/i"]);
  });

  test("keys with slashes that are NOT delimiter-shaped stay literal", () => {
    // `and/or` never opens with a slash; `/path/to/file` has a trailing segment that is not a flag string;
    // `/unclosed` has no closing delimiter. All three are ordinary keys a user may legitimately have typed.
    for (const key of ["and/or", "/path/to/file", "/unclosed", "//"]) {
      const stBook = parseStWorldFile(stWorldBytes([key]), "literal");
      expect(stBook?.entries[0]?.metadata).not.toHaveProperty("keyMode");
    }
  });

  test("an explicit use_regex / keyMode on the entry still wins over the derivation", () => {
    // The flag door stays open on this format too, and a re-import of an orb export is a fixpoint.
    // biome-ignore lint/style/useNamingConvention: ST native world-file field names (`insertion_order`, `use_regex`) appear verbatim in these fixtures — they ARE the format.
    expect(parseStWorldFile(stWorldBytes(["he(llo|y)"], { use_regex: true }), "w")?.entries[0]?.metadata?.["keyMode"]).toBe("regex");
    expect(parseStWorldFile(stWorldBytes(["/x/"], { keyMode: "literal" }), "w")?.entries[0]?.metadata?.["keyMode"]).toBe("literal");
  });

  test("the shared adaptation still holds: field renames, filename book name, malformed → null", () => {
    const stBook = parseStWorldFile(stWorldBytes(["hello"], { disable: true, order: 42 }), "greetings");
    expect(stBook?.name).toBe("greetings");
    expect(stBook?.entries[0]?.enabled).toBe(false);
    expect(stBook?.entries[0]?.priority).toBe(42);
    expect(parseStWorldFile(ENC.encode("{not json"), "x")).toBeNull();
    expect(parseStWorldFile(ENC.encode(JSON.stringify({ entries: {} })), "x")).toBeNull();
  });
});

describe("parseWorldBookFile — grammar detection", () => {
  test("a JSON object in neither grammar is refused `foreign-kind`; an ST file with no entries is `malformed`", () => {
    expect(parseWorldBookFile(ENC.encode(JSON.stringify({ name: "x", findRegex: "a" })), "x")).toEqual({ ok: false, reason: "foreign-kind" });
    expect(parseWorldBookFile(ENC.encode(JSON.stringify({ entries: {} })), "x")).toEqual({ ok: false, reason: "malformed" });
  });

  test("an ST file takes the fallback name; a native file keeps its own", () => {
    const st = parseWorldBookFile(stWorldBytes(["hello"]), "From Stem");
    expect(st.ok && st.value.name).toBe("From Stem");
    const native = parseWorldBookFile(
      ENC.encode(JSON.stringify({ schemaKind: "orb.world-info.book", schemaVersion: 1, name: "Own Name", description: null, entries: [] })),
      "From Stem",
    );
    expect(native.ok && native.value.name).toBe("Own Name");
  });

  test("ST numeric positions and `constant` map to the orb anchor and scope, in entry order", () => {
    const bytes = ENC.encode(
      JSON.stringify({
        entries: {
          "0": { uid: 0, key: ["a"], comment: "before", content: "x", order: 10, position: 0, disable: false, constant: true },
          "1": { uid: 1, key: ["b"], comment: "after", content: "y", order: 5, position: 1, disable: false },
        },
      }),
    );
    const stBook = parseStWorldFile(bytes, "w");
    expect(stBook?.entries.map((e) => [e.title, e.priority, e.metadata?.["position"], e.metadata?.["scopeMode"]])).toEqual([
      ["before", 10, "before", "always"],
      ["after", 5, "after", undefined],
    ]);
  });
});

// The book content identity every import door dedups by: name-blind, entry-set and key-order independent,
// and the null-vs-[] keys collapse, so a re-encoded identical book matches its stored twin.

function dedupEntry(over: Partial<DedupLoreEntry> = {}): DedupLoreEntry {
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

function dedupBook(over: Partial<DedupBook> = {}): DedupBook {
  return { name: "Aria's World", entries: [dedupEntry()], ...over };
}

function dedupCandidate(id: string, over: Partial<DedupBook> = {}): DedupCandidateBook {
  return { id: castId<WorldBookId>(id), ...dedupBook(over) };
}

describe("bookContentKey", () => {
  test("is entry-order independent — the same entry set in any order keys identically", () => {
    const a = dedupBook({ entries: [dedupEntry({ title: "One", keys: ["a"] }), dedupEntry({ title: "Two", keys: ["b"] })] });
    const b = dedupBook({ entries: [dedupEntry({ title: "Two", keys: ["b"] }), dedupEntry({ title: "One", keys: ["a"] })] });
    expect(bookContentKey(a)).toBe(bookContentKey(b));
  });

  test("is object-key-order independent inside metadata", () => {
    const a = dedupBook({ entries: [dedupEntry({ metadata: { scopeMode: "always", position: "before" } })] });
    const b = dedupBook({ entries: [dedupEntry({ metadata: { position: "before", scopeMode: "always" } })] });
    expect(bookContentKey(a)).toBe(bookContentKey(b));
  });

  test("collapses empty keys and null keys to the same identity (the world_entries NULL-vs-[] axis)", () => {
    const empty = dedupBook({ entries: [dedupEntry({ keys: [] })] });
    const nulled = dedupBook({ entries: [dedupEntry({ keys: null })] });
    expect(bookContentKey(empty)).toBe(bookContentKey(nulled));
  });

  test("a different entry content or entry set keys DIFFERENTLY; a different NAME does not (a renamed book is the same book)", () => {
    const base = dedupBook();
    expect(bookContentKey(dedupBook({ name: "Other" }))).toBe(bookContentKey(base));
    expect(bookContentKey(dedupBook({ name: "Aria's World (2)" }))).toBe(bookContentKey(base));
    expect(bookContentKey(dedupBook({ entries: [dedupEntry({ content: "changed" })] }))).not.toBe(bookContentKey(base));
    expect(bookContentKey(dedupBook({ entries: [dedupEntry(), dedupEntry({ title: "Extra" })] }))).not.toBe(bookContentKey(base));
  });
});

describe("findDuplicateBook", () => {
  test("returns the content-equal candidate with the name it carries (the LINK case), whatever the incoming name", () => {
    const match = findDuplicateBook(dedupBook(), [
      dedupCandidate("world_book_a", { name: "Aria's World (2)" }),
      dedupCandidate("world_book_b", { entries: [] }),
    ]);
    expect(match).toEqual(dedupCandidate("world_book_a", { name: "Aria's World (2)" }));
  });

  test("returns null when no candidate matches (the MINT case) — a same-name different-content book is NOT a match", () => {
    const sameNameDifferentContent = dedupCandidate("world_book_a", { entries: [dedupEntry({ content: "totally different lore" })] });
    expect(findDuplicateBook(dedupBook(), [sameNameDifferentContent])).toBeNull();
    expect(findDuplicateBook(dedupBook(), [])).toBeNull();
  });
});
