import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderUnicodeHandleKeyData, sourcesMismatchingPins, UNICODE_SOURCE_PINS } from "../../../../../tooling/src/verify/ops/gen/unicode-handle-key.ts";
import { expect, test } from "../../../../support/tool-fixtures.ts";

const SOURCES = {
  caseFolding: [
    "# CaseFolding-17.0.0.txt",
    "0041; C; 0061; # LATIN CAPITAL LETTER A",
    "00DF; F; 0073 0073; # LATIN SMALL LETTER SHARP S",
    "1E9E; S; 00DF; # LATIN CAPITAL LETTER SHARP S",
    "0049; T; 0131; # LATIN CAPITAL LETTER I",
  ].join("\n"),
  derivedCore: [
    "# DerivedCoreProperties-17.0.0.txt",
    "00AD          ; Default_Ignorable_Code_Point # Cf       SOFT HYPHEN",
    "180B..180D    ; Default_Ignorable_Code_Point # Mn   [3] MONGOLIAN FREE VARIATION SELECTOR ONE..THREE",
    "0041..005A    ; Alphabetic # L&  [26] LATIN CAPITAL LETTER A..Z",
  ].join("\n"),
  confusables: ["# Version: 17.0.0", "0441 ;\t0063 ;\tMA\t# ( с → c )", "006D ;\t0072 006E ;\tMA\t# ( m → rn )"].join("\n"),
  aliases: [
    "# PropertyValueAliases-17.0.0.txt",
    "gc ; Lu                               ; Uppercase_Letter",
    "sc ; Grek                             ; Greek",
    "sc ; Hrkt                             ; Katakana_Or_Hiragana",
    "sc ; Latn                             ; Latin",
  ].join("\n"),
} as const;

test("keeps the full case folding (C and F) and drops the simple and Turkic rows, which would change every key", () => {
  const rendered = renderUnicodeHandleKeyData(SOURCES);
  expect(rendered).toContain('"41>61;df>73 73"');
  expect(rendered).not.toContain("1e9e>");
  expect(rendered).not.toContain("49>131");
  expect(rendered).toContain('"ad;180b-180d"');
  expect(rendered).toContain('"441>63;6d>72 6e"');
});

test("keeps every Script code a code point can carry, and only those", () => {
  const rendered = renderUnicodeHandleKeyData(SOURCES);
  expect(rendered).toContain('"Grek;Latn"');
  expect(rendered).not.toContain("Hrkt");
  expect(rendered).not.toContain("Lu;");
});

test("refuses a source from another Unicode version instead of vendoring it", () => {
  expect(() => renderUnicodeHandleKeyData({ ...SOURCES, confusables: SOURCES.confusables.replace("17.0.0", "18.0.0") })).toThrow(/another Unicode version/u);
});

test("refuses a table that parses empty", () => {
  expect(() => renderUnicodeHandleKeyData({ ...SOURCES, derivedCore: "# DerivedCoreProperties-17.0.0.txt\n" })).toThrow(/parsed empty/u);
});

test("a source that differs from its pinned SHA-256 is named, and the pinned ones pass", () => {
  const pins = Object.fromEntries(Object.entries(SOURCES).map(([name, text]) => [name, createHash("sha256").update(text).digest("hex")])) as typeof SOURCES;
  expect(sourcesMismatchingPins(SOURCES, pins)).toEqual([]);
  expect(sourcesMismatchingPins({ ...SOURCES, confusables: `${SOURCES.confusables}\n0430 ;\t0061 ;\tMA` }, pins)).toEqual(["confusables"]);
});

test("the pins are the digests recorded in the committed tables, so a pin bump without a regeneration reds", ({ repoRoot }) => {
  const header = readFileSync(join(repoRoot, "packages/kit/src/handle-key/unicode-data.ts"), "utf8");
  for (const pin of Object.values(UNICODE_SOURCE_PINS)) {
    expect(header).toContain(`sha256 ${pin}`);
  }
});
