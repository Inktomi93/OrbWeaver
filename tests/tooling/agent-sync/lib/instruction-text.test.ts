// The instruction-layer text rules on strings: what counts as prose, what the history and word rules
// catch, what the glossary allows, and which spans are checked as repository paths. Every negative case
// sits beside a positive control that proves the same rule fires on the planted spelling.
import { backtickedRepoPaths, glossaryWords, markdownLinkTargets, proseFindings, proseOnly } from "../../../../tooling/src/agent-sync/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const NONE: ReadonlySet<string> = new Set();

test("history markers in prose are findings, each on its real line", () => {
  const source = ["# Rule", "", "Fixed on 2026-09-12 in #1234.", "The gate used to skip this.", "The old file is retired."].join("\n");
  expect(proseFindings("r.md", source, NONE)).toEqual([
    'r.md:3: a date ("2026-09-12")',
    'r.md:3: an issue or PR number ("#1234")',
    'r.md:4: "used to" ("used to")',
    'r.md:5: "retired" ("retired")',
  ]);
});

test("the passive 'is used to' is a description, not history", () => {
  expect(proseFindings("r.md", "A probe is used to measure load.", NONE)).toEqual([]);
  expect(proseFindings("r.md", "The probe used to measure load.", NONE)).toHaveLength(1);
});

test("banned house words are findings in singular and plural forms", () => {
  const findings = proseFindings("r.md", "A load-bearing belt. Two fences, one rung, receipts and lenses on each arm.", NONE);
  expect(findings.map((finding) => finding.replace(/ \(.*\)$/u, ""))).toEqual([
    'r.md:1: banned word "load-bearing"',
    'r.md:1: banned word "belt"',
    'r.md:1: banned word "fence"',
    'r.md:1: banned word "arm"',
    'r.md:1: banned word "lens"',
    'r.md:1: banned word "receipt"',
    'r.md:1: banned word "rung"',
  ]);
});

test("a word inside a longer word is not the banned word", () => {
  expect(proseFindings("r.md", "The alarm fenced the harmless belted text.", NONE)).toEqual([]);
});

test("code spans, code blocks and owner-voice sections are not prose", () => {
  const source = [
    "Run `git log --since=2026-01-01` for #12.",
    "```bash",
    "echo receipt 2026-09-12",
    "```",
    "<!-- owner-voice -->",
    "The fence used to be load-bearing.",
    "<!-- /owner-voice -->",
    "After the section, a receipt counts again.",
  ].join("\n");
  expect(proseFindings("r.md", source, NONE)).toEqual(['r.md:1: an issue or PR number ("#12")', 'r.md:8: banned word "receipt" ("receipt")']);
  expect(proseOnly(source).split("\n")).toHaveLength(8);
});

test("a word the AGENTS.md glossary defines is allowed", () => {
  const claude = [
    "# Core",
    "",
    "## Glossary",
    "",
    "| Word | Meaning |",
    "| - | - |",
    "| fence | a boundary check |",
    "| lane | a subagent |",
    "",
    "## Next",
  ].join("\n");
  const allowed = glossaryWords(claude);
  expect([...allowed].toSorted()).toEqual(["fence", "lane"]);
  expect(proseFindings("r.md", "The fence holds.", allowed)).toEqual([]);
  expect(proseFindings("r.md", "The fence holds.", NONE)).toHaveLength(1);
});

test("relative link targets are collected without anchors; external and in-page links are not", () => {
  const source = "See [a](../docs/a.md#part), [b](https://example.com), [c](#local) and `[d](x.md)`.";
  expect(markdownLinkTargets(source)).toEqual([{ line: 1, target: "../docs/a.md" }]);
});

test("backticked repository paths are collected; globs, placeholders, commands and runtime artifacts are not", () => {
  const source = [
    "Read `tooling/src/a.ts:12` and `docs/b.md#part` and `.claude/rules/`.",
    "Skip `packages/*/package.json`, `tests/<pkg>/`, `pnpm test:scoped tests/x`, `reports/verify.json`, `Tier-1-DB.md`.",
    "```",
    "`packages/in/fence.ts`",
    "```",
  ].join("\n");
  expect(backtickedRepoPaths(source)).toEqual([
    { line: 1, path: "tooling/src/a.ts" },
    { line: 1, path: "docs/b.md" },
    { line: 1, path: ".claude/rules" },
  ]);
});
