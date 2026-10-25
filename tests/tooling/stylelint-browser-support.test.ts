// orb/browser-support-css refuses a property, value keyword or at-rule some browser in BROWSER_TARGETS lacks, and admits it under an @supports naming it.
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@orb/testkit/tooling";
import stylelint from "stylelint";
import config from "../../stylelint.config.ts";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const FILE = join(REPO_ROOT, "packages/client/src/styles/globals.css");
const RULE = "orb/browser-support-css";

async function hits(code: string): Promise<string[]> {
  const { results } = await stylelint.lint({ code, codeFilename: FILE, config, configBasedir: REPO_ROOT });
  return results.flatMap((result) => result.warnings.map((warning) => warning.rule)).filter((rule) => rule === RULE);
}

const layered = (rules: string): string => `@layer client { ${rules} }`;

// Firefox 138 lacks `anchor-name` and `@scope`; `field-sizing` is listed harmless, `cursor` and `overscroll-behavior` run on the floor.
test.for([
  ["a property that is not listed harmless", ".probe { anchor-name: --probe; }"],
  ["a property after a guard on another one", "@supports (display: grid) { .probe { anchor-name: --probe; } }"],
  ["a scroll-driven timeline", ".probe { animation-timeline: scroll(self block); }"],
  ["a property under another family's @supports", "@supports (animation-timeline: scroll()) { .probe { anchor-name: --probe; } }"],
  ["an at-rule", "@scope (.probe) { .inner { opacity: 1; } }"],
] as const)("refuses %s", async ([, rules]) => {
  expect(await hits(layered(rules))).toEqual([RULE]);
});

test.for([
  ["a property under an @supports naming it", "@supports (anchor-name: --a) { .probe { anchor-name: --probe; } }"],
  ["a property under a nested @supports naming it", "@supports (display: grid) { @supports (anchor-name: --a) { .probe { anchor-name: --probe; } } }"],
  ["a property listed harmless", ".probe { field-sizing: content; scrollbar-width: thin; }"],
  ["cursor: pointer, which iOS ignores harmlessly", ".probe { cursor: pointer; }"],
  ["overscroll-behavior, a partial implementation that still ships", ".probe { overscroll-behavior: none; }"],
  ["a timeline under its @supports", "@supports (animation-timeline: scroll()) { .probe { animation-timeline: scroll(self block); } }"],
  ["a sibling longhand under the family's @supports", "@supports (animation-timeline: scroll()) { .probe { animation-range: 0 10px; } }"],
  ["a supported property", ".probe { opacity: 1; }"],
  ["an at-rule under an @supports naming it", "@supports at-rule(@scope) { @scope (.probe) { .inner { opacity: 1; } } }"],
] as const)("admits %s", async ([, rules]) => {
  expect(await hits(layered(rules))).toEqual([]);
});
