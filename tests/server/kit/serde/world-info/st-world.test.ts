// Mirror test for the world-info serde's raw SillyTavern grammar: the field-spelling adaptation onto the
// shared entry mapper, and the ONE native-only divergence, delimited-key regex detection (owner ruling).

import type { BulkImportLorebookInput } from "@orb/contracts/world-info";
import { matchEntryKeys } from "@orb/kit/world-info";
import { parseWorldBookFile } from "@orb/server/kit/serde/world-info";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";

/** The ST grammar through the one detecting parser; null when it refused (the old null-on-unreadable shape). */
function parseStWorldFile(bytes: Uint8Array, name: string): BulkImportLorebookInput | null {
  const parsed = parseWorldBookFile(bytes, name);
  return parsed.ok ? parsed.value : null;
}

const encoder = new TextEncoder();

/** An ST-native world file (`{ entries: { <uid>: {...} } }`) carrying one entry with the given keys. */
function stWorldBytes(keys: readonly string[], extra: Record<string, unknown> = {}): Uint8Array {
  return encoder.encode(
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
    const book = parseStWorldFile(stWorldBytes(["/he(llo|y)/i"]), "greetings");
    expect(book).not.toBeNull();
    const entry = book?.entries[0];
    expect(entry?.metadata?.["keyMode"]).toBe("regex");

    // The stored columns + metadata are what the per-turn pool feeds the matcher.
    expect(matchEntryKeys(entry?.keys ?? [], "hey there", { keyMode: "regex" })).toEqual(["/he(llo|y)/i"]);
  });

  test("keys with slashes that are NOT delimiter-shaped stay literal", () => {
    // `and/or` never opens with a slash; `/path/to/file` has a trailing segment that is not a flag string;
    // `/unclosed` has no closing delimiter. All three are ordinary keys a user may legitimately have typed.
    for (const key of ["and/or", "/path/to/file", "/unclosed", "//"]) {
      const book = parseStWorldFile(stWorldBytes([key]), "literal");
      expect(book?.entries[0]?.metadata).not.toHaveProperty("keyMode");
    }
  });

  test("an explicit use_regex / keyMode on the entry still wins over the derivation", () => {
    // The flag door stays open on this format too, and a re-import of an orb export is a fixpoint.
    // biome-ignore lint/style/useNamingConvention: ST native world-file field names (`insertion_order`, `use_regex`) appear verbatim in these fixtures — they ARE the format.
    expect(parseStWorldFile(stWorldBytes(["he(llo|y)"], { use_regex: true }), "w")?.entries[0]?.metadata?.["keyMode"]).toBe("regex");
    expect(parseStWorldFile(stWorldBytes(["/x/"], { keyMode: "literal" }), "w")?.entries[0]?.metadata?.["keyMode"]).toBe("literal");
  });

  test("the shared adaptation still holds: field renames, filename book name, malformed → null", () => {
    const book = parseStWorldFile(stWorldBytes(["hello"], { disable: true, order: 42 }), "greetings");
    expect(book?.name).toBe("greetings");
    expect(book?.entries[0]?.enabled).toBe(false);
    expect(book?.entries[0]?.priority).toBe(42);
    expect(parseStWorldFile(encoder.encode("{not json"), "x")).toBeNull();
    expect(parseStWorldFile(encoder.encode(JSON.stringify({ entries: {} })), "x")).toBeNull();
  });
});

describe("parseWorldBookFile — grammar detection", () => {
  test("a JSON object in neither grammar is refused `foreign-kind`; an ST file with no entries is `malformed`", () => {
    expect(parseWorldBookFile(encoder.encode(JSON.stringify({ name: "x", findRegex: "a" })), "x")).toEqual({ ok: false, reason: "foreign-kind" });
    expect(parseWorldBookFile(encoder.encode(JSON.stringify({ entries: {} })), "x")).toEqual({ ok: false, reason: "malformed" });
  });

  test("an ST file takes the fallback name; a native file keeps its own", () => {
    const st = parseWorldBookFile(stWorldBytes(["hello"]), "From Stem");
    expect(st.ok && st.value.name).toBe("From Stem");
    const native = parseWorldBookFile(
      encoder.encode(JSON.stringify({ schemaKind: "orb.world-info.book", schemaVersion: 1, name: "Own Name", description: null, entries: [] })),
      "From Stem",
    );
    expect(native.ok && native.value.name).toBe("Own Name");
  });

  test("ST numeric positions and `constant` map to the orb anchor and scope, in entry order", () => {
    const bytes = encoder.encode(
      JSON.stringify({
        entries: {
          "0": { uid: 0, key: ["a"], comment: "before", content: "x", order: 10, position: 0, disable: false, constant: true },
          "1": { uid: 1, key: ["b"], comment: "after", content: "y", order: 5, position: 1, disable: false },
        },
      }),
    );
    const book = parseStWorldFile(bytes, "w");
    expect(book?.entries.map((e) => [e.title, e.priority, e.metadata?.["position"], e.metadata?.["scopeMode"]])).toEqual([
      ["before", 10, "before", "always"],
      ["after", 5, "after", undefined],
    ]);
  });
});
