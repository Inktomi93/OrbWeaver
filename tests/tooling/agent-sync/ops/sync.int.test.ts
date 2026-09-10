// The Codex mirror's real-tree conformance: the .codex tree is Claude-owned symlinks + generated
// manifests, and `codexAgentSyncProblems()` is the same oracle `pnpm check:agents` runs. Relocated from
// tests/tooling/codex-agent-config.int.test.ts at the #393 P5 move (Core-Tooling-Law.md §4.7 mirror).
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { join, relative } from "node:path";
import { codexAgentSyncProblems, ROLE_MODELS } from "../../../../tooling/src/agent-sync/index.ts";
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
  expectClaudeOwnedLink(join(ROOT, ".codex", "agent-doctrine.md"), ".claude/agent-doctrine.md");
  expectClaudeOwnedLink(join(ROOT, ".codex", "hooks"), ".claude/hooks");
  expectClaudeOwnedLink(join(ROOT, ".agents", "skills"), ".claude/skills");
  expect(codexAgentSyncProblems()).toEqual([]);

  const projectInstructions = readFileSync(join(ROOT, "AGENTS.md"), "utf8");
  expect(projectInstructions).toContain("@.claude/rules/orchestration.md");
  expect(projectInstructions).not.toContain("@.codex/rules/");

  // The roster is pinned by literal, not derived from the map under test — a role silently dropped from
  // ROLE_MODELS would otherwise shrink the loop to nothing and still pass.
  expect(Object.keys(ROLE_MODELS).toSorted()).toEqual(["executor", "forge", "mech-executor", "security-executor", "side-eye", "stickler", "verifier"]);
  for (const [role, model] of Object.entries(ROLE_MODELS)) {
    const manifest = readFileSync(join(ROOT, ".codex", "agents", `${role}.toml`), "utf8");
    expect(manifest).toContain(`model = "${model}"`);
  }

  const codexHookConfig = readFileSync(join(ROOT, ".codex", "hooks.json"), "utf8");
  expect(codexHookConfig).not.toContain("/home/");
  expect(codexHookConfig).not.toContain("tool-guard.mjs");
  expect(codexHookConfig).toContain("/.codex/hooks/biome-check.sh");

  const claudeHookConfig = readFileSync(join(ROOT, ".claude", "settings.json"), "utf8");
  expect(claudeHookConfig).not.toContain("tool-guard.mjs");
  expect(claudeHookConfig).toContain("/.claude/hooks/biome-check.sh");
  expect(claudeHookConfig).toContain("/.claude/hooks/session-onboard.sh");
  expect(claudeHookConfig).toContain("/.claude/hooks/worktree-setup.sh");
  expect(claudeHookConfig).toContain("/.claude/hooks/worktree-remove.sh");
});
