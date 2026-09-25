import { renderUnicodeHandleKeyData } from "../../../../../tooling/src/verify/ops/gen/unicode-handle-key.ts";
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
} as const;

test("keeps the full case folding (C and F) and drops the simple and Turkic rows, which would change every key", () => {
  const rendered = renderUnicodeHandleKeyData(SOURCES);
  expect(rendered).toContain('"41>61;df>73 73"');
  expect(rendered).not.toContain("1e9e>");
  expect(rendered).not.toContain("49>131");
  expect(rendered).toContain('"ad;180b-180d"');
  expect(rendered).toContain('"441>63;6d>72 6e"');
});

test("refuses a source from another Unicode version instead of vendoring it", () => {
  expect(() => renderUnicodeHandleKeyData({ ...SOURCES, confusables: SOURCES.confusables.replace("17.0.0", "18.0.0") })).toThrow(/another Unicode version/u);
});

test("refuses a table that parses empty", () => {
  expect(() => renderUnicodeHandleKeyData({ ...SOURCES, derivedCore: "# DerivedCoreProperties-17.0.0.txt\n" })).toThrow(/parsed empty/u);
});
