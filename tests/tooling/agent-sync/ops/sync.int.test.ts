// The Codex mirror's real-tree conformance: the .codex tree is Claude-owned symlinks + generated
// manifests, and `codexAgentSyncProblems()` is the same oracle `pnpm check:agents` runs. Relocated from
// tests/tooling/codex-agent-config.int.test.ts at the #393 P5 move (Core-Tooling-Law.md §4.7 mirror).
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { join, relative } from "node:path";
import { codexAgentSyncProblems, parseClaudeAgent, ROLE_MODELS } from "../../../../tooling/src/agent-sync/index.ts";
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
  expect(projectInstructions).toContain("Codex does not expand `@path` directives");
  expect(projectInstructions).toContain("Begin with the bounded task and the relevant source and tests");
  expect(projectInstructions).toContain("A lookup of a file, command, value, or test location does not itself require a build, review, or test preflight");
  expect(projectInstructions).toContain("Use §0.3 of `docs/architecture/core/AGENTS.md` as the reading router");
  expect(projectInstructions).toContain("When making or reviewing an architecture or package-placement decision");
  expect(projectInstructions).toContain("Before adding, changing, or running tests");
  expect(projectInstructions).toContain("Before staging, committing, creating, moving, or merging a worktree");
  expect(projectInstructions).toContain("Before driving or changing the running stack");
  expect(projectInstructions).toContain("Read a complete relevant section and its needed linked constraints before making the decision or change it governs");
  expect(projectInstructions).not.toContain("Before substantive repository work, read `docs/architecture/core/AGENTS.md` in full");
  expect(projectInstructions).not.toContain(
    "Before modifying or reviewing code, read `.claude/agent-doctrine.md` and `.claude/rules/lane-standing-facts.md` in full",
  );
  expect(projectInstructions).toContain("For delegation, consult the role table and the relevant parts of `Rules` and `What a brief must carry`");
  expect(projectInstructions).toContain("The current requested goal bounds the work");
  expect(projectInstructions).toContain(
    "Continue necessary work within it; do not adopt standing overnight or whole-Ready-queue draining as the default scope of an unrelated task",
  );
  expect(projectInstructions).toContain("For a work-item operation, use current `pnpm work:item --help`");
  expect(projectInstructions).toContain("Routine board operations do not require `dogfood-loop`; use it when a drive or finding workflow is relevant");
  expect(projectInstructions).toContain("For a worktree or integration operation, consult only the relevant runbook §5 or §6 procedure");
  expect(projectInstructions).toContain("Claude-account, bridge, onboard, project-memory, and hook-automation procedures do not establish Codex runtime state");
  expect(projectInstructions).toContain("Use them when the task concerns Claude setup");
  expect(projectInstructions).toContain("Read the current board when a lifecycle, refill, or recovery decision needs it");
  expect(projectInstructions).toContain("do not repeat the same board view without a new decision or relevant state change");
  expect(projectInstructions).not.toContain("Read `.claude/rules/orchestration.md` only in the main session");
  expect(projectInstructions).toContain('spawn `verifier`, `side-eye`, or `stickler` with `fork_turns="none"`');
  expect(projectInstructions).toContain(
    "Claude `memory: project`, path-scoped rule auto-loading, permission/post-edit/onboard hooks, and worktree isolation do not carry into Codex",
  );
  expect(projectInstructions).toContain("Run the required verification explicitly");
  expect(projectInstructions).toContain("Use the global `code-recon` skill when its advanced reference is relevant to the task");
  expect(projectInstructions).toContain("It is not routine pre-reading");
  expect(projectInstructions).toContain("Use `Core-Path-Registry.md` and `Core-Enforcement-Active-Gates.md` as targeted lookup catalogs");
  expect(projectInstructions).toContain("Archived library companions are provenance and reference material");
  expect(projectInstructions).toContain("Do not reread unchanged material already present in context");
  expect(projectInstructions).toContain("Full reads still apply to changed or reviewed source and tests");
  expect(projectInstructions).not.toMatch(/^@/mu);
  for (const ruleName of ["browser-and-instruments.md", "db-schema.md", "gates-and-tooling.md", "lane-standing-facts.md", "orchestration.md"]) {
    expect(projectInstructions).toContain(`\`.claude/rules/${ruleName}\``);
  }
  expect(projectInstructions).not.toContain("@.codex/rules/");

  const hookConfig = JSON.parse(readFileSync(join(ROOT, ".codex", "hooks.json"), "utf8")) as { readonly hooks: Readonly<Record<string, unknown>> };
  expect(hookConfig.hooks).toEqual({});

  // The roster is pinned by literal, not derived from the map under test — a role silently dropped from
  // ROLE_MODELS would otherwise shrink the loop to nothing and still pass.
  expect(Object.keys(ROLE_MODELS).toSorted()).toEqual(["executor", "forge", "mech-executor", "security-executor", "side-eye", "stickler", "verifier"]);
  for (const [role, model] of Object.entries(ROLE_MODELS)) {
    const manifest = readFileSync(join(ROOT, ".codex", "agents", `${role}.toml`), "utf8");
    expect(manifest).toContain(`model = "${model}"`);
    expect(manifest).toContain("The Codex reading map in `AGENTS.md` governs shared repository pre-reading");
    const sourceFilename = `${role}.md`;
    const source = readFileSync(join(ROOT, ".claude", "agents", sourceFilename), "utf8");
    expect(manifest).toContain(parseClaudeAgent(sourceFilename, source).body);
  }

  const sideEyeManifest = readFileSync(join(ROOT, ".codex", "agents", "side-eye.toml"), "utf8");
  expect(sideEyeManifest).toContain("Read `.agents/skills/side-eye-design-review/SKILL.md`, `.agents/skills/snap-driving/SKILL.md` in full");

  for (const configName of ["stryker.config.json", "stryker.gate.config.json"]) {
    const config = JSON.parse(readFileSync(join(ROOT, configName), "utf8")) as { readonly ignorePatterns: readonly string[] };
    expect(config.ignorePatterns).toEqual(expect.arrayContaining([".claude/**", ".agents/**", ".codex/**"]));
  }
});
