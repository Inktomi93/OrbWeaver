import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { join, relative } from "node:path";
import { codexAgentSyncProblems } from "../../scripts/agents/sync-codex-agents.ts";
import { expect, test } from "../support/tool-fixtures.ts";

const ROOT = join(import.meta.dirname, "..", "..");

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

  const roleModels = {
    executor: "gpt-5.6-sol",
    forge: "gpt-5.6-sol",
    "mech-executor": "gpt-5.6-sol",
    "security-executor": "gpt-5.6-sol",
    "side-eye": "gpt-5.6-sol",
    stickler: "gpt-5.6-sol",
    verifier: "gpt-5.6-sol",
  } as const;
  for (const [role, model] of Object.entries(roleModels)) {
    const manifest = readFileSync(join(ROOT, ".codex", "agents", `${role}.toml`), "utf8");
    expect(manifest).toContain(`model = "${model}"`);
  }

  const hookConfig = readFileSync(join(ROOT, ".codex", "hooks.json"), "utf8");
  expect(hookConfig).not.toContain("/home/");
  expect(hookConfig).toContain("/.codex/hooks/tool-guard.mjs");
  expect(hookConfig).toContain("/.codex/hooks/biome-check.sh");

  for (const configName of ["stryker.config.json", "stryker.gate.config.json"]) {
    const config = JSON.parse(readFileSync(join(ROOT, configName), "utf8")) as { readonly ignorePatterns: readonly string[] };
    expect(config.ignorePatterns).toEqual(expect.arrayContaining([".claude/**", ".agents/**", ".codex/**"]));
  }
});
