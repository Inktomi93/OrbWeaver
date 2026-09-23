import { atRulesContaining, parseCssStylesheet, quotedStatementArgument, rulesContaining } from "../../../../tooling/src/verify/lib/css-rules.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("nested rules and direct at-rule declarations retain source order and ownership", () => {
  const parsed = parseCssStylesheet("@layer theme {\n  --seed: var(--base);\n  .outer {\n    color: red;\n    & .inner { color: blue; }\n  }\n}\n");

  expect(parsed.rules.map((rule) => rule.selectorList)).toEqual([".outer", "& .inner"]);
  expect(parsed.rules.map((rule) => rule.braceStart)).toEqual([47, 78]);
  expect(parsed.atRules).toHaveLength(1);
  expect(parsed.atRules[0]).toMatchObject({
    prelude: "@layer theme",
    line: 1,
    offset: 0,
    declarations: [expect.objectContaining({ prop: "--seed", value: "var(--base)", line: 2, column: 3, offset: 17, valueOffset: 25 })],
  });
});

/** THE ANCESTRY PAIR, held in ONE invocation because half of it is what shipped before (#2293 leg 2).
 *  `atRulesContaining` existed; `rulesContaining` did not, and `CssRule` published no `end` — so
 *  "which SELECTOR encloses this offset" was unanswerable and a declaration written
 *  `[data-theme="dusk"] { @media (…) { --color-z: … } }` looked, to every consumer, like it belonged to
 *  nothing but the `@media`. That is exactly how the seed-palette reader lost a conditional token when it
 *  folded onto the shared facts. Both directions are asserted: the INNER declaration's chain names the
 *  outer selector AND the at-rule, and an offset OUTSIDE the block names neither. */
test("ancestry is askable in both halves — a nested declaration names its enclosing selector and at-rule", () => {
  const text = '[data-theme="dusk"] {\n  color-scheme: light;\n  @media (prefers-contrast: more) {\n    --color-z: red;\n  }\n}\n.after { color: blue; }\n';
  const parsed = parseCssStylesheet(text);
  const nested = parsed.atRules[0]?.declarations[0];
  const after = parsed.rules.find((rule) => rule.selectorList === ".after")?.declarations[0];

  expect(nested?.prop).toBe("--color-z");
  expect(after?.prop).toBe("color");
  // The INNER declaration: owned by the `@media`, ENCLOSED by the seed selector. Before `rulesContaining`
  // the second half of this line could not be written at all.
  expect(rulesContaining(parsed.rules, nested?.offset ?? -1).map((rule) => rule.selectorList)).toEqual(['[data-theme="dusk"]']);
  expect(atRulesContaining(parsed.atRules, nested?.offset ?? -1).map((atRule) => atRule.prelude)).toEqual(["@media (prefers-contrast: more)"]);
  // The NEGATIVE control, so containment is a measurement and not a constant: a declaration after the
  // block is inside its OWN rule and inside no at-rule.
  expect(rulesContaining(parsed.rules, after?.offset ?? -1).map((rule) => rule.selectorList)).toEqual([".after"]);
  expect(atRulesContaining(parsed.atRules, after?.offset ?? -1)).toEqual([]);
});

/** THE STATEMENT AT-RULE FACT, with its controls in BOTH directions in one invocation (#2183). The fact
 *  exists because `closeFrame` fires on `}` and a blockless at-rule has none, so before this the parser
 *  answered `statement at-rules seen = 0` for a sheet whose whole content was `@import`s
 *  (the 2026-09-12 CSS-family audit §(d)) and every consumer that wanted the topology owned a private
 *  regex. Both controls are load-bearing: the POSITIVE — the `@media` BLOCK at-rule must still appear in
 *  `atRules` — because the build must not have moved a block at-rule into the new bucket; the NEGATIVE — an
 *  `@import` inside a comment must NOT appear — because comments are blanked before the scan and a reader
 *  that saw one would be publishing prose as topology. */
test("blockless at-rules become statement facts while a commented one and the block at-rule stay put", () => {
  const parsed = parseCssStylesheet(
    [
      '@charset "utf-8";',
      '@import "tailwindcss";',
      '/* @import "./ghost.css"; */',
      "@source '../';",
      "@media (max-width: 30rem) { .a { color: red; } }",
      ".b { gap: 1px; }",
    ].join("\n"),
  );

  expect(parsed.statements.map((statement) => [statement.name, statement.prelude, statement.line])).toEqual([
    ["charset", '@charset "utf-8"', 1],
    ["import", '@import "tailwindcss"', 2],
    ["source", "@source '../'", 4],
  ]);
  expect(parsed.statements.map((statement) => quotedStatementArgument(statement))).toEqual(["utf-8", "tailwindcss", "../"]);
  expect(parsed.atRules.map((atRule) => atRule.prelude)).toEqual(["@media (max-width: 30rem)"]);
  expect(parsed.rules.map((rule) => rule.selectorList)).toEqual([".a", ".b"]);
});

test("a declaration is never a statement at-rule and an unnameable at-keyword is refused rather than published empty", () => {
  const parsed = parseCssStylesheet('.a { color: red; --x: 1px; }\n@ import "x";\n@layer base, utilities;\n');

  expect(parsed.statements.map((statement) => statement.name)).toEqual(["layer"]);
  expect(parsed.statements.map((statement) => quotedStatementArgument(statement))).toEqual([undefined]);
  expect(parsed.rules[0]?.declarations.map((declaration) => declaration.prop)).toEqual(["color", "--x"]);
});
