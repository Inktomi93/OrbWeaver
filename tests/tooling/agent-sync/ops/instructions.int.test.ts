// The instruction-layer check on planted trees, one failure class per case, each beside the clean tree
// that proves the same walk passes. The last case runs it on the real repository, which must be clean.
import { alwaysOnLines, instructionFiles, instructionLayerProblems } from "../../../../tooling/src/agent-sync/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const RULE = '---\npaths:\n  - "docs/**"\n---\n\n# Docs rule\n\nWrite plainly.\n';
const RULE_LINE = "- `.claude/rules/docs.md`: `docs/**`";
const AGENTS = `# Core\n\nRead \`docs/a.md\` first.\n\n## Path rules\n\n${RULE_LINE}\n`;

function tree(overrides: Readonly<Record<string, string>> = {}): Readonly<Record<string, string>> {
  return { "AGENTS.md": AGENTS, ".claude/rules/docs.md": RULE, "docs/a.md": "# A\n", ...overrides };
}

test("a clean tree has no problems, and the walk reads every instruction file", async ({ plantedTree }) => {
  const root = await plantedTree(tree({ ".claude/skills/x/SKILL.md": "# Skill\n", ".claude/agents/r.md": "# Role\n" }));
  expect(instructionFiles(root)).toEqual([".claude/agents/r.md", ".claude/rules/docs.md", ".claude/skills/x/SKILL.md", "AGENTS.md"]);
  expect(instructionLayerProblems(root)).toEqual([]);
});

test("a root CLAUDE.md is a second always-on copy, and a missing AGENTS.md is refused", async ({ plantedTree }) => {
  const withClaude = await plantedTree(tree({ "CLAUDE.md": "# Core\n" }));
  expect(instructionLayerProblems(withClaude)).toEqual(["CLAUDE.md: AGENTS.md is the one always-on file; move this text into it and delete CLAUDE.md"]);
  const bare = await plantedTree({ "docs/a.md": "# A\n" });
  expect(instructionLayerProblems(bare)).toEqual(["AGENTS.md is missing; it is the always-on instruction file"]);
});

test("the always-on budget counts AGENTS.md, its imports and every rule without paths", async ({ plantedTree }) => {
  const long = `${"line\n".repeat(120)}`;
  const agents = `@docs/law.md\n${RULE_LINE}\n- \`.claude/rules/always.md\`: none\n`;
  const root = await plantedTree(tree({ "AGENTS.md": agents, "docs/law.md": long, ".claude/rules/always.md": `# Always\n${long}` }));
  expect(alwaysOnLines(root).total).toBe(3 + 120 + 121);
  const problems = instructionLayerProblems(root);
  expect(problems[0]).toMatch(/^always-on instruction text is 244 lines \(budget: under 200\)/u);
  expect(problems).toContain(".claude/rules/always.md: needs list-form `paths:` frontmatter (found none)");
});

test("an inline paths value is refused", async ({ plantedTree }) => {
  const root = await plantedTree(tree({ ".claude/rules/docs.md": '---\npaths: ["docs/**"]\n---\n\n# Docs\n' }));
  expect(instructionLayerProblems(root)).toEqual([".claude/rules/docs.md: needs list-form `paths:` frontmatter (found an inline value)"]);
});

test("the AGENTS.md rule list must name every rule with its exact globs, and no rule that does not exist", async ({ plantedTree }) => {
  const second = '---\npaths:\n  - "tests/**"\n  - "tooling/**"\n---\n\n# Tests\n';
  const unlisted = await plantedTree(tree({ ".claude/rules/tests.md": second }));
  expect(instructionLayerProblems(unlisted)).toEqual(["AGENTS.md: the path-rule list has no line for .claude/rules/tests.md"]);

  const stale = await plantedTree(tree({ ".claude/rules/tests.md": second, "AGENTS.md": `${AGENTS}- \`.claude/rules/tests.md\`: \`tests/**\`\n` }));
  expect(instructionLayerProblems(stale)).toEqual([
    "AGENTS.md:8: the line for .claude/rules/tests.md does not match its `paths:`; expected: - `.claude/rules/tests.md`: `tests/**`, `tooling/**`",
  ]);

  const extra = await plantedTree(tree({ "AGENTS.md": `${AGENTS}- \`.claude/rules/gone.md\`: \`x/**\`\n` }));
  expect(instructionLayerProblems(extra)).toEqual([
    "AGENTS.md:8: the path-rule list names .claude/rules/gone.md, which is not a rule file",
    "AGENTS.md:8: path does not exist: .claude/rules/gone.md",
  ]);
});

test("history markers and banned words are found in any .claude markdown, and a glossary word is allowed", async ({ plantedTree }) => {
  const root = await plantedTree(
    tree({
      ".claude/skills/x/reference/deep.md": "Landed in #42 on 2026-09-01; the belt holds.\n",
      "AGENTS.md": `${AGENTS}\n## Glossary\n\n| Word | Meaning |\n| - | - |\n| belt | a guard |\n`,
    }),
  );
  expect(instructionLayerProblems(root)).toEqual([
    '.claude/skills/x/reference/deep.md:1: a date ("2026-09-01")',
    '.claude/skills/x/reference/deep.md:1: an issue or PR number ("#42")',
  ]);
});

test("a dead link or backticked path is a finding; a live one is not", async ({ plantedTree }) => {
  const root = await plantedTree(
    tree({ ".claude/agents/r.md": "See [live](../../docs/a.md), [dead](../../docs/gone.md), `docs/a.md` and `tooling/src/gone.ts:3`.\n" }),
  );
  expect(instructionLayerProblems(root)).toEqual([
    ".claude/agents/r.md:1: link target does not exist: ../../docs/gone.md",
    ".claude/agents/r.md:1: path does not exist: tooling/src/gone.ts",
  ]);
});

test("worktrees under .claude are not walked", async ({ plantedTree }) => {
  const root = await plantedTree(tree({ ".claude/worktrees/lane/AGENTS.md": "#1 used to\n" }));
  expect(instructionLayerProblems(root)).toEqual([]);
});

test("the real repository's instruction layer is clean", ({ repoRoot }) => {
  expect(instructionFiles(repoRoot).length).toBeGreaterThan(0);
  expect(instructionLayerProblems(repoRoot)).toEqual([]);
});
