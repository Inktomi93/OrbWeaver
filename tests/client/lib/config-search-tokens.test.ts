// `parseConfigQuery` + friends (lib/config-search-tokens.ts) — the Settings search's typed `@` grammar:
// the token table, the malformed spellings (surfaced as UNKNOWN, never
// silently searched as text), the partial-token detector the `@` menu keys on, and the literal-substring
// highlight ranges. Pure logic → a browser-free unit test (Spine-Testing.md §7).

import { applyConfigToken, CONFIG_QUERY_TOKENS, findHighlightRanges, parseConfigQuery, partialConfigToken } from "@orb/client/lib";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

describe("parseConfigQuery", () => {
  test("free text alone is terms, single-spaced", () => {
    expect(parseConfigQuery("  avatar   size ")).toEqual({ terms: "avatar size", modified: false, advanced: false, unknown: [] });
  });

  test("the grammar table — every token, mixed with terms", () => {
    expect(parseConfigQuery("@modified motion")).toMatchObject({ terms: "motion", modified: true });
    expect(parseConfigQuery("@advanced")).toMatchObject({ terms: "", advanced: true });
    expect(parseConfigQuery("@shelf:APP keys")).toMatchObject({ terms: "keys", shelf: "app" });
    // `@in:` keeps the value AS TYPED — group ids are mixed-case (`worldInfo`).
    expect(parseConfigQuery("@in:worldInfo scan")).toMatchObject({ terms: "scan", group: "worldInfo" });
    expect(parseConfigQuery("@ext:Weather-Teller")).toMatchObject({ terms: "", ext: "weather-teller" });
  });

  test("token NAMES are case-insensitive", () => {
    expect(parseConfigQuery("@Modified @SHELF:user")).toMatchObject({ modified: true, shelf: "user" });
  });

  test("malformed tokens are UNKNOWN, never searched as text — a typo matching a row would be a lie", () => {
    const parsed = parseConfigQuery("@shefl:app @shelf: @bogus avatar");
    expect(parsed.unknown).toEqual(["@shefl:app", "@shelf:", "@bogus"]);
    expect(parsed.terms).toBe("avatar");
    expect(parsed.shelf).toBeUndefined();
  });

  test("a later duplicate value-token wins (the one nearest the caret is being edited)", () => {
    expect(parseConfigQuery("@shelf:user @shelf:app")).toMatchObject({ shelf: "app" });
  });
});

describe("partialConfigToken / applyConfigToken", () => {
  test("the trailing `@` word is partial only while the caret is inside it", () => {
    expect(partialConfigToken("avatar @sh")).toBe("@sh");
    expect(partialConfigToken("avatar @sh ")).toBeNull();
    expect(partialConfigToken("avatar")).toBeNull();
    expect(partialConfigToken("")).toBeNull();
  });

  test("selecting a token completes the partial in place; a value token parks the caret after `:`", () => {
    expect(applyConfigToken("avatar @sh", "@shelf:")).toBe("avatar @shelf:");
    expect(applyConfigToken("avatar @mo", "@modified")).toBe("avatar @modified ");
    // The funnel appends a bare `@` with NO trailing space — the lone `@` is itself the partial that keeps
    // the token menu open (a space here was the real defect the funnel CT caught: `partialConfigToken("@ ")`
    // is null, so the menu the funnel exists to open never showed).
    expect(applyConfigToken("avatar ", "@")).toBe("avatar @");
    expect(applyConfigToken("", "@")).toBe("@");
  });

  test("the menu's vocabulary is total and insertable — every token either bare or value-taking", () => {
    expect(CONFIG_QUERY_TOKENS.map((t) => t.token)).toEqual(["@modified", "@shelf:", "@in:", "@ext:", "@advanced"]);
  });
});

describe("findHighlightRanges", () => {
  test("every case-insensitive occurrence of every term, as [start, end) offsets", () => {
    expect(findHighlightRanges("Avatar size", "avatar")).toEqual([{ start: 0, end: 6 }]);
    expect(findHighlightRanges("Message details & actions", "mess act")).toEqual([
      { start: 0, end: 4 },
      { start: 18, end: 21 },
    ]);
  });

  test("no literal overlap ⇒ no ranges (a fuzzy hit renders unmarked rather than marking the wrong letters)", () => {
    expect(findHighlightRanges("Avatar size", "avtar")).toEqual([]);
    expect(findHighlightRanges("Avatar size", "")).toEqual([]);
  });
});
