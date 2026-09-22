// The instruction-layer check on planted trees, one failure class per case, each beside the clean tree
// that proves the same walk passes. The last case runs it on the real repository, which must be clean.
import { alwaysOnLines, instructionFiles, instructionLayerProblems } from "../../../../tooling/src/agent-sync/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const RULE = '---\npaths:\n  - "docs/**"\n---\n\n# Docs rule\n\nWrite plainly.\n';
const CLAUDE = "# Core\n\nRead `docs/a.md` first.\n";

function tree(overrides: Readonly<Record<string, string>> = {}): Readonly<Record<string, string>> {
  return { "CLAUDE.md": CLAUDE, "AGENTS.md": "# Codex\n", ".claude/rules/docs.md": RULE, "docs/a.md": "# A\n", ...overrides };
}

test("a clean tree has no problems, and the walk reads every instruction file", async ({ plantedTree }) => {
  const root = await plantedTree(tree({ ".claude/skills/x/SKILL.md": "# Skill\n", ".claude/agents/r.md": "# Role\n" }));
  expect(instructionFiles(root)).toEqual([".claude/agents/r.md", ".claude/rules/docs.md", ".claude/skills/x/SKILL.md", "AGENTS.md", "CLAUDE.md"]);
  expect(instructionLayerProblems(root)).toEqual([]);
});

test("the always-on budget counts CLAUDE.md, its imports and every rule without paths", async ({ plantedTree }) => {
  const long = `${"line\n".repeat(120)}`;
  const root = await plantedTree(tree({ "CLAUDE.md": "@docs/law.md\n# Core\n", "docs/law.md": long, ".claude/rules/always.md": `# Always\n${long}` }));
  expect(alwaysOnLines(root).total).toBe(2 + 120 + 121);
  const problems = instructionLayerProblems(root);
  expect(problems[0]).toMatch(/^always-on instruction text is 243 lines \(budget: under 200\)/u);
  expect(problems).toContain(".claude/rules/always.md: needs list-form `paths:` frontmatter (found none)");
});

test("an inline paths value is refused", async ({ plantedTree }) => {
  const root = await plantedTree(tree({ ".claude/rules/docs.md": '---\npaths: ["docs/**"]\n---\n\n# Docs\n' }));
  expect(instructionLayerProblems(root)).toEqual([".claude/rules/docs.md: needs list-form `paths:` frontmatter (found an inline value)"]);
});

test("history markers and banned words are found in any .claude markdown, and a glossary word is allowed", async ({ plantedTree }) => {
  const root = await plantedTree(
    tree({
      ".claude/skills/x/reference/deep.md": "Landed in #42 on 2026-09-01; the belt holds.\n",
      "CLAUDE.md": `${CLAUDE}\n## Glossary\n\n| Word | Meaning |\n| - | - |\n| belt | a guard |\n`,
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

test("worktrees, the memory link and symlinks under .claude are not walked", async ({ plantedTree }) => {
  const root = await plantedTree(tree({ ".claude/worktrees/lane/CLAUDE.md": "#1 used to\n", ".claude/agent-memory/x/MEMORY.md": "2026-01-01\n" }));
  expect(instructionLayerProblems(root)).toEqual([]);
});

test("the real repository's instruction layer is clean", ({ repoRoot }) => {
  expect(instructionFiles(repoRoot).length).toBeGreaterThan(0);
  expect(instructionLayerProblems(repoRoot)).toEqual([]);
});
