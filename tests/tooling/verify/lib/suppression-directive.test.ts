// The shared FOREIGN-tool directive grammar (`lib/suppression-directive.ts`), pinned at the level BOTH its
// consumers depend on: `suppressions` classifies each site by the RULE it names, `no-blanket-suppression`
// dispatches on the TOKEN. Neither gate had a test over the grammar itself while it lived inside one of them.
//
// The load-bearing property is the MENTION FENCE — a directive is matched at the comment OPENER only — and
// it is asserted in BOTH directions here, because the permissive direction is the dangerous one: a spelling
// read out of prose or a string makes the ledger count a marker nobody wrote, and a missed opener form makes
// the blanket gate go green on a real file-wide suppression.
import type { SourceFile } from "ts-morph";
import { Project, ScriptKind } from "ts-morph";
import { describe } from "vitest";
import { readDirectiveComment, suppressionSites } from "../../../../tooling/src/verify/lib/suppression-directive.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

function parse(text: string): SourceFile {
  return new Project({ useInMemoryFileSystem: true, skipFileDependencyResolution: true }).createSourceFile("s.tsx", text, { scriptKind: ScriptKind.TSX });
}

describe("readDirectiveComment", () => {
  test("reads each opener carrier with the rule it names", () => {
    expect(readDirectiveComment("// biome-ignore lint/style/noMagicNumbers: why")).toEqual({ token: "biome-ignore", rule: "lint/style/noMagicNumbers" });
    expect(readDirectiveComment("/* biome-ignore-all lint/suspicious/noBitwiseOperators: why */")).toEqual({
      token: "biome-ignore-all",
      rule: "lint/suspicious/noBitwiseOperators",
    });
    expect(readDirectiveComment("{/* eslint-disable-next-line jsx-a11y/no-autofocus */}")).toEqual({
      token: "eslint-disable-next-line",
      rule: "jsx-a11y/no-autofocus",
    });
  });

  test("returns a rule-less site for the bare TypeScript directives, which name no rule and are their own key", () => {
    expect(readDirectiveComment("// @ts-nocheck")).toEqual({ token: "@ts-nocheck", rule: "@ts-nocheck" });
    expect(readDirectiveComment("/* eslint-disable */")).toEqual({ token: "eslint-disable", rule: null });
  });

  test("THE MENTION FENCE — a spelling that is not at the comment opener is inert", () => {
    expect(readDirectiveComment("// see biome-ignore-all in the design doc — a quotation mid-sentence")).toBeNull();
    expect(readDirectiveComment('const s = "// biome-ignore-all lint/foo: text";')).toBeNull();
    expect(readDirectiveComment("//biome-ignoreable")).toBeNull();
  });

  test("MEASURED LIMIT of the `\\b` boundary — a HYPHENATED longer word still parses as the shorter token", () => {
    // `\b` holds at the hyphen, so `biome-ignore-allocation` reads as a rule-less `biome-ignore`. Pinned as
    // it behaves rather than as one would wish: no such spelling exists in any analyzer's vocabulary, so the
    // over-read is unreachable in practice, and tightening the grammar would move every suppressions ledger
    // row. A row here so the next reader meets the fact instead of re-deriving it.
    expect(readDirectiveComment("// biome-ignore-allocation lint/foo: a longer word")).toEqual({ token: "biome-ignore", rule: null });
  });

  test("does not recognise the Orb waiver vocabulary — the two grammars are separate homes by ruling", () => {
    expect(readDirectiveComment("// @orb-waive no-array-literal-querykey(queryKey): why")).toBeNull();
  });
});

describe("suppressionSites", () => {
  test("collects leading, trailing and JSX-container carriers in source order, one site per physical comment", () => {
    const sf = parse(
      [
        "// biome-ignore lint/style/noMagicNumbers: leading",
        "export const a = 1;",
        "export const b = 2; // eslint-disable-next-line no-alert",
        "export const C = () => (",
        "  <div>",
        "    {/* eslint-disable-next-line jsx-a11y/no-autofocus */}",
        "    <input />",
        "  </div>",
        ");",
      ].join("\n"),
    );
    expect(suppressionSites(sf).map((site) => ({ line: site.line, token: site.token, rule: site.rule, block: site.block }))).toEqual([
      { line: 1, token: "biome-ignore", rule: "lint/style/noMagicNumbers", block: false },
      { line: 3, token: "eslint-disable-next-line", rule: "no-alert", block: false },
      { line: 6, token: "eslint-disable-next-line", rule: "jsx-a11y/no-autofocus", block: true },
    ]);
  });

  test("PLANTED CONTROL — an identical file with every directive demoted to prose yields ZERO sites", () => {
    const sf = parse(
      [
        "// the biome-ignore lint/style/noMagicNumbers rule is discussed here",
        "export const a = 1;",
        'export const b = "// eslint-disable-next-line no-alert";',
      ].join("\n"),
    );
    expect(suppressionSites(sf)).toEqual([]);
  });

  test("marks BLOCK carriers, which is the discriminator eslint's own semantics turn on", () => {
    const sf = parse("/* eslint-disable jsx-a11y/no-autofocus */\nexport const a = 1;\n// eslint-disable no-alert\n");
    expect(suppressionSites(sf).map((site) => [site.line, site.block])).toEqual([
      [1, true],
      [3, false],
    ]);
  });
});
