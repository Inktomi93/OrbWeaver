// The Codex mirror's real-tree conformance: the .codex tree is Claude-owned symlinks + generated
// manifests, and `codexAgentSyncProblems()` is the same oracle `pnpm check:agents` runs. Relocated from
// tests/tooling/codex-agent-config.int.test.ts at the #393 P5 move (Core-Tooling-Law.md §4.7 mirror).
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import {
  codexAgentSyncProblems,
  parseClaudeAgent,
  parseRulePaths,
  ROLE_FAMILIES,
  ruleListLine,
  syncCodexAgents,
} from "../../../../tooling/src/agent-sync/index.ts";
import { formatMarkdown } from "../../../../tooling/src/doc/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");

function expectClaudeOwnedLink(path: string, target: string): void {
  expect(lstatSync(path).isSymbolicLink()).toBe(true);
  const resolved = realpathSync(path);
  expect(relative(ROOT, resolved).startsWith("..")).toBe(false);
  expect(resolved).toBe(join(ROOT, target));
}

test("lowercase Codex configuration stays synced to the Claude-owned agent sources", () => {
  expect(existsSync(join(ROOT, ".Codex"))).toBe(false);
  expectClaudeOwnedLink(join(ROOT, ".codex", "hooks"), ".claude/hooks");
  expectClaudeOwnedLink(join(ROOT, ".agents", "skills"), ".claude/skills");
  expect(codexAgentSyncProblems()).toEqual([]);

  // AGENTS.md is the one always-on file for both hosts. Codex expands no `@` import, so the Codex
  // pointers must be written into the file itself.
  expect(existsSync(join(ROOT, "CLAUDE.md"))).toBe(false);
  const projectInstructions = readFileSync(join(ROOT, "AGENTS.md"), "utf8");
  expect(projectInstructions).toContain("read `.claude/skills/lane/SKILL.md` in full");
  expect(projectInstructions).toContain("read `.claude/skills/orchestrator/SKILL.md`");
  expect(projectInstructions).toContain('with `fork_turns="none"`');
  expect(projectInstructions).not.toMatch(/^@/mu);

  // Every rule appears in the hand-written list with its exact globs, read from the rule's own frontmatter.
  const ruleFiles = readdirSync(join(ROOT, ".claude", "rules")).filter((name) => name.endsWith(".md"));
  expect(ruleFiles.length).toBeGreaterThan(0);
  for (const ruleName of ruleFiles) {
    const rel = `.claude/rules/${ruleName}`;
    const paths = parseRulePaths(readFileSync(join(ROOT, rel), "utf8"));
    expect(paths.kind).toBe("list");
    expect(projectInstructions.split("\n")).toContain(ruleListLine(rel, paths));
  }

  // Codex has advisory hooks, but the Claude tool guard is not granted to its tool calls.
  const hookConfig = readFileSync(join(ROOT, ".codex", "hooks.json"), "utf8");
  expect(hookConfig).not.toContain("tool-guard.mjs");

  // The roster is pinned by literal, not derived from the map under test — a role silently dropped from
  // ROLE_FAMILIES would otherwise shrink the loop to nothing and still pass.
  expect(Object.keys(ROLE_FAMILIES).toSorted()).toEqual([
    "executor",
    "forge",
    "mech-executor",
    "security-executor",
    "side-eye",
    "sonnet-executor",
    "stickler",
    "verifier",
  ]);
  for (const [role, family] of Object.entries(ROLE_FAMILIES)) {
    const manifest = readFileSync(join(ROOT, ".codex", "agents", `${role}.toml`), "utf8");
    expect(manifest).toMatch(new RegExp(`^model = "gpt-[0-9]+(?:\\.[0-9]+)*-${family}"$`, "mu"));
    expect(manifest).toContain("`AGENTS.md` names the files to read first");
    expect(manifest).toContain("Read `.agents/skills/lane/SKILL.md`");
    expect(manifest).not.toContain("agent-doctrine");
    const sourceFilename = `${role}.md`;
    const source = readFileSync(join(ROOT, ".claude", "agents", sourceFilename), "utf8");
    expect(manifest).toContain(parseClaudeAgent(sourceFilename, source).body);
  }

  const codexRouting = {
    forge: ["astra", "medium"],
    stickler: ["astra", "medium"],
    executor: ["sol", "medium"],
    verifier: ["sol", "medium"],
    "mech-executor": ["luna", "high"],
    "security-executor": ["sol", "high"],
    "side-eye": ["sol", "high"],
  } as const;
  for (const [role, [family, effort]] of Object.entries(codexRouting)) {
    const manifest = readFileSync(join(ROOT, ".codex", "agents", `${role}.toml`), "utf8");
    expect(manifest).toMatch(new RegExp(`^model = "gpt-[0-9]+(?:\\.[0-9]+)*-${family}"$`, "mu"));
    expect(manifest).toContain(`model_reasoning_effort = "${effort}"`);
  }

  const sideEyeManifest = readFileSync(join(ROOT, ".codex", "agents", "side-eye.toml"), "utf8");
  expect(sideEyeManifest).toContain(
    "Read `.agents/skills/lane/SKILL.md`, `.agents/skills/review/SKILL.md`, `.agents/skills/side-eye-design-review/SKILL.md`, `.agents/skills/snap-driving/SKILL.md` in full",
  );

  const claudeHookConfig = readFileSync(join(ROOT, ".claude", "settings.json"), "utf8");
  // The destructive-command guard remains a Claude-side registration.
  expect(claudeHookConfig).toContain("/.claude/hooks/tool-guard.mjs");
  expect(claudeHookConfig).toContain("/.claude/hooks/biome-check.mjs");
  expect(claudeHookConfig).toContain("/.claude/hooks/session-onboard.sh");
  expect(claudeHookConfig).toContain("/.claude/hooks/worktree-setup.sh");
  expect(claudeHookConfig).toContain("/.claude/hooks/worktree-remove.sh");
});

const FIXTURE_CATALOG =
  '{"fetched_at":"2026-09-30T12:00:00Z","models":[{"slug":"gpt-6.10-sol","visibility":"list","supported_reasoning_levels":[{"effort":"medium"}]}]}';

test("sync validates before overwriting or pruning, then check detects persisted selection and body drift", async ({ plantedTree }) => {
  const role = (name: string): string => `---\nname: ${name}\ndescription: Review work\neffort: medium\n---\n\nReview the assigned work.\n`;
  const root = await plantedTree({
    ".claude/agents/executor.md": role("executor"),
    ".claude/agents/verifier.md": role("verifier"),
    ".claude/skills/lane/SKILL.md": "# Lane\n",
    ".agents/README.md": "Skills link lives here.\n",
    ".codex/agents/executor.toml": "existing executor\n",
    ".codex/agents/orphan.toml": "existing orphan\n",
    "catalog.json": FIXTURE_CATALOG,
  });
  symlinkSync(join(root, ".claude/skills"), join(root, ".agents/skills"), "junction");
  const catalogPath = join(root, "catalog.json");
  const executorPath = join(root, ".codex/agents/executor.toml");
  const orphanPath = join(root, ".codex/agents/orphan.toml");
  for (const invalid of ["{", FIXTURE_CATALOG.replace("6.10-sol", "6-astra"), FIXTURE_CATALOG.replace("medium", "low")]) {
    writeFileSync(catalogPath, invalid);
    expect(() => syncCodexAgents(catalogPath, root)).toThrow();
    expect(readFileSync(executorPath, "utf8")).toBe("existing executor\n");
    expect(readFileSync(orphanPath, "utf8")).toBe("existing orphan\n");
    expect(existsSync(join(root, ".codex/agents/verifier.toml"))).toBe(false);
  }
  writeFileSync(catalogPath, FIXTURE_CATALOG);
  expect(syncCodexAgents(catalogPath, root)).toEqual({ roles: 2, fetchedAt: "2026-09-30T12:00:00Z" });
  expect(existsSync(orphanPath)).toBe(false);
  const valid = readFileSync(executorPath, "utf8");
  expect(valid).toContain('model = "gpt-6.10-sol"');
  expect(codexAgentSyncProblems(root)).toEqual([]);
  for (const changed of [
    valid.replace("gpt-6.10-sol", "gpt-6-astra"),
    valid.replace("gpt-6.10-sol", "gpt-6.9-sol"),
    valid.replace('model_reasoning_effort = "medium"', 'model_reasoning_effort = "high"'),
    valid.replace("Review the assigned work.", "Different work."),
    valid.replace('model = "gpt-6.10-sol"\n', ""),
  ]) {
    writeFileSync(executorPath, changed);
    expect(codexAgentSyncProblems(root).length).toBeGreaterThan(0);
  }
});

test("root AGENTS.md is canonical markdown, so check:agents and check:docs can both be green", () => {
  // Two enforced stages read this file: `check:agents` checks its rule list and budget, and `check:docs`
  // owns its bytes (class 3 of the formatter). A non-canonical edit reds the docs stage, so this pins
  // the property at the file both tools share.
  const projectInstructions = readFileSync(join(ROOT, "AGENTS.md"), "utf8");
  const { output, refusal } = formatMarkdown(projectInstructions);

  expect(refusal).toBeNull();
  expect(output).toBe(projectInstructions);
});
