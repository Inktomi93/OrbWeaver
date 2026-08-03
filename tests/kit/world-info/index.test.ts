import {
  buildKeywordHaystack,
  ENTRY_POSITIONS,
  ENTRY_SCOPE_MODES,
  keyRegex,
  matchEntryKeys,
  resolveEntryInjection,
  resolveEntryPosition,
  resolveEntryScope,
} from "@orb/kit/world-info";
import { expect, test } from "../../support/fixtures.ts";

// ── tuples ─────────────────────────────────────────────────────────────────

test("the const tuples carry the documented members", () => {
  expect(ENTRY_SCOPE_MODES).toEqual(["auto", "always", "keyword"]);
  expect(ENTRY_POSITIONS).toEqual(["before", "after"]);
});

// ── resolveEntryScope ────────────────────────────────────────────────────────

test("resolveEntryScope honors an explicit always/keyword override regardless of keys", () => {
  expect(resolveEntryScope({ scopeMode: "always" }, true)).toBe("always");
  expect(resolveEntryScope({ scopeMode: "always" }, false)).toBe("always");
  expect(resolveEntryScope({ scopeMode: "keyword" }, false)).toBe("keyword");
  expect(resolveEntryScope({ scopeMode: "keyword" }, true)).toBe("keyword");
});

test("resolveEntryScope falls back to the keys heuristic for auto / missing / invalid mode", () => {
  // "auto" is not a forced scope → heuristic.
  expect(resolveEntryScope({ scopeMode: "auto" }, true)).toBe("keyword");
  expect(resolveEntryScope({ scopeMode: "auto" }, false)).toBe("always");
  // No metadata → heuristic.
  expect(resolveEntryScope(undefined, true)).toBe("keyword");
  expect(resolveEntryScope(null, false)).toBe("always");
  // Garbage mode → heuristic.
  expect(resolveEntryScope({ scopeMode: "nonsense" }, true)).toBe("keyword");
});

test("resolveEntryScope reads scopeMode in isolation — a malformed inject sibling doesn't poison it", () => {
  expect(resolveEntryScope({ scopeMode: "always", inject: "broken" }, true)).toBe("always");
});

// ── resolveEntryInjection ─────────────────────────────────────────────────────

test("resolveEntryInjection returns the directive with an explicit role", () => {
  expect(resolveEntryInjection({ inject: { depth: 4, role: "assistant" } })).toEqual({
    depth: 4,
    role: "assistant",
  });
});

test("resolveEntryInjection defaults a missing role to user", () => {
  expect(resolveEntryInjection({ inject: { depth: 0 } })).toEqual({ depth: 0, role: "user" });
});

test("resolveEntryInjection returns null when there is no inject directive", () => {
  expect(resolveEntryInjection({})).toBeNull();
  expect(resolveEntryInjection(undefined)).toBeNull();
  expect(resolveEntryInjection(null)).toBeNull();
  expect(resolveEntryInjection("not an object")).toBeNull();
});

test("resolveEntryInjection rejects an invalid inject (negative / non-int depth, bad role)", () => {
  expect(resolveEntryInjection({ inject: { depth: -1 } })).toBeNull();
  expect(resolveEntryInjection({ inject: { depth: 1.5 } })).toBeNull();
  expect(resolveEntryInjection({ inject: { depth: 1, role: "narrator" } })).toBeNull();
});

test("resolveEntryInjection reads inject in isolation — a malformed scopeMode sibling doesn't disable it", () => {
  expect(resolveEntryInjection({ scopeMode: 123, inject: { depth: 2 } })).toEqual({
    depth: 2,
    role: "user",
  });
});

// ── resolveEntryPosition ──────────────────────────────────────────────────────

test("resolveEntryPosition returns the explicit position, defaulting to before", () => {
  expect(resolveEntryPosition({ position: "after" })).toBe("after");
  expect(resolveEntryPosition({ position: "before" })).toBe("before");
  expect(resolveEntryPosition({})).toBe("before");
  expect(resolveEntryPosition(undefined)).toBe("before");
  expect(resolveEntryPosition({ position: "sideways" })).toBe("before");
});

// (The ST role bimap moved to @orb/kit/message-role — tested there; the {depth,role} inject schema
//  moved to @orb/kit/injection. world-info's resolveEntryInjection above consumes them.)

// ── keyword matching ──────────────────────────────────────────────────────────

test("matchEntryKeys whole-word matches and ignores substrings of larger words", () => {
  // The caller pre-folds the haystack; matchEntryKeys folds + trims the keys.
  expect(matchEntryKeys(["cat"], "the cat sat")).toEqual(["cat"]);
  // "cat" must NOT fire inside "category".
  expect(matchEntryKeys(["cat"], "a category list")).toEqual([]);
});

test("matchEntryKeys folds key case and trims whitespace before matching", () => {
  expect(matchEntryKeys(["  CAT  "], "the cat sat")).toEqual(["cat"]);
  // An all-whitespace / empty key never fires.
  expect(matchEntryKeys(["   ", ""], "anything")).toEqual([]);
});

test("matchEntryKeys returns every distinct key that fired, in input order", () => {
  expect(matchEntryKeys(["sword", "shield", "bow"], "a sword and a shield")).toEqual(["sword", "shield"]);
  expect(matchEntryKeys(["dragon"], "no monsters here")).toEqual([]);
});

test("matchEntryKeys substring-matches boundary-less scripts (CJK has no word breaks)", () => {
  // 北京 (Beijing) must fire inside running Han text that has no spaces around it. The haystack is
  // assembled from short pieces so no single long CJK literal trips the high-entropy lint.
  const han = "北京";
  const hanHaystack = `我去${han}了`;
  expect(matchEntryKeys([han], hanHaystack)).toEqual([han]);
});

test("keyRegex compiles whole-word for spaced scripts and substring for boundary-less ones", () => {
  const han = "北京";
  const hanHaystack = `我去${han}了`;
  expect(keyRegex("cat").test("a cat")).toBe(true);
  expect(keyRegex("cat").test("category")).toBe(false);
  expect(keyRegex(han).test(hanHaystack)).toBe(true);
});

test("keyRegex returns the same cached instance for a repeated key", () => {
  expect(keyRegex("repeatkey")).toBe(keyRegex("repeatkey"));
});

test("the haystack builder joins messages and names, drops empties, and lower-cases", () => {
  expect(buildKeywordHaystack(["Hello There"], ["Alice", "", "Bob"])).toBe("hello there\nalice\nbob");
  expect(buildKeywordHaystack([], [])).toBe("");
});

// ── locale-INDEPENDENT case folding (deterministic across server + client) ──────
// Folding must be the Unicode default fold (`.toLowerCase()`), NOT host-locale-dependent
// (`toLocaleLowerCase()`), so the server and client fold identically on the same input.

test("matchEntryKeys folds key case regardless of input case (case-insensitive match)", () => {
  // Caller pre-folds the haystack (already lowercase here); matchEntryKeys folds the KEY. The key
  // matches its target regardless of the case it was authored in.
  expect(matchEntryKeys(["TITLE"], "the title here")).toEqual(["title"]);
  expect(matchEntryKeys(["WiKi"], "a wiki page")).toEqual(["wiki"]);
});

test("matchEntryKeys folds ASCII I to i deterministically (Turkish locale would diverge)", () => {
  // The Unicode default fold maps "I" → "i" on EVERY host locale. `toLocaleLowerCase("tr")` would
  // instead yield dotless "ı", so a Turkish-locale host would fold this key differently from an
  // English-locale one — exactly the cross-platform divergence orbweaver's locale-independent fold
  // rules out. The folded key is the ASCII-dotted "wifi" everywhere.
  expect(matchEntryKeys(["WIFI"], "the wifi password")).toEqual(["wifi"]);
});

test("keyRegex escapes regex metacharacters in the key — a literal period never wildcards", () => {
  // Without escaping, the "." in "dr." would compile as a regex wildcard and wrongly match "dru".
  expect(matchEntryKeys(["dr."], "the dru walked in")).toEqual([]);
  expect(matchEntryKeys(["dr."], "the dr. walked in")).toEqual(["dr."]);
});

test("matchEntryKeys folds German ß deterministically (no host-locale uppercasing to SS)", () => {
  // The Unicode default fold leaves ß as ß on every host locale; a locale-dependent fold could
  // instead normalize case differently across platforms, diverging server vs. client.
  expect(matchEntryKeys(["straße"], "die straße ist lang")).toEqual(["straße"]);
});

test("the haystack builder lower-cases without locale dependence", () => {
  // Under a Turkish host `toLocaleLowerCase` would produce "wıfı zone"; the locale-independent fold
  // yields "wifi zone" on every platform, so the scan haystack is identical server- and client-side.
  expect(buildKeywordHaystack(["WIFI ZONE"], [])).toBe("wifi zone");
});
