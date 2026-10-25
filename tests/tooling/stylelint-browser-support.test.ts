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

// Firefox 138 and Safari 18 lack `field-sizing`; `@scope` is Firefox 146.
test.for([
  ["a property", ".probe { field-sizing: content; }"],
  ["a property after a guard on another one", "@supports (display: grid) { .probe { field-sizing: content; } }"],
  ["a scroll-driven timeline", ".probe { animation-timeline: scroll(self block); }"],
  ["a property under another family's @supports", "@supports (animation-timeline: scroll()) { .probe { field-sizing: content; } }"],
  ["an at-rule", "@scope (.probe) { .inner { opacity: 1; } }"],
] as const)("refuses %s", async ([, rules]) => {
  expect(await hits(layered(rules))).toEqual([RULE]);
});

test.for([
  ["a property under an @supports naming it", "@supports (field-sizing: content) { .probe { field-sizing: content; } }"],
  ["a property under a nested @supports naming it", "@supports (display: grid) { @supports (field-sizing: content) { .probe { field-sizing: content; } } }"],
  ["a timeline under its @supports", "@supports (animation-timeline: scroll()) { .probe { animation-timeline: scroll(self block); } }"],
  ["a sibling longhand under the family's @supports", "@supports (animation-timeline: scroll()) { .probe { animation-range: 0 10px; } }"],
  ["a supported property", ".probe { opacity: 1; }"],
  ["an at-rule under an @supports naming it", "@supports at-rule(@scope) { @scope (.probe) { .inner { opacity: 1; } } }"],
] as const)("admits %s", async ([, rules]) => {
  expect(await hits(layered(rules))).toEqual([]);
});
