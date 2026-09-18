// The Codex mirror's real-tree conformance: the .codex tree is Claude-owned symlinks + generated
// manifests, and `codexAgentSyncProblems()` is the same oracle `pnpm check:agents` runs. Relocated from
// tests/tooling/codex-agent-config.int.test.ts at the #393 P5 move (Core-Tooling-Law.md §4.7 mirror).
import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { join, relative } from "node:path";
import { codexAgentSyncProblems, parseClaudeAgent, ROLE_MODELS } from "../../../../tooling/src/agent-sync/index.ts";
import { formatMarkdown } from "../../../../tooling/src/doc-catalog/index.ts";
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
  for (const ruleName of ["browser-and-instruments.md", "db-schema.md", "gates-and-tooling.md", ".claude/rules/lane-standing-facts.md", "orchestration.md"]) {
    expect(projectInstructions).toContain(`\`.claude/rules/${ruleName}\``);
  }
  expect(projectInstructions).not.toContain("@.codex/rules/");

  // The Codex mirror registers NO hooks, and that is a RULING, not an oversight — owner, 2026-09-11:
  // "it's fine, Codex is a lot more cautious than our side so I haven't had to use the tool guard."
  // JSON holds no comments, so this assertion is the reason's home: do not "repair" the empty object by
  // mirroring the Claude PreToolUse entry. `.codex/hooks` symlinks to `.claude/hooks`, so the guard is
  // already on that side if the ruling ever changes.
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

  const claudeHookConfig = readFileSync(join(ROOT, ".claude", "settings.json"), "utf8");
  // Re-registered 2026-09-11 by owner ruling, superseding the #1898 archival that made this a `not`:
  // the Bash guard is the only enforcement of the destroy-uncommitted ban, and its day unregistered cost
  // five lanes their uncommitted files to one `git stash -u`. The Codex half stays empty by the separate
  // owner ruling recorded above — this is a Claude-side registration, deliberately.
  expect(claudeHookConfig).toContain("/.claude/hooks/tool-guard.mjs");
  expect(claudeHookConfig).toContain("/.claude/hooks/biome-check.sh");
  expect(claudeHookConfig).toContain("/.claude/hooks/session-onboard.sh");
  expect(claudeHookConfig).toContain("/.claude/hooks/worktree-setup.sh");
  expect(claudeHookConfig).toContain("/.claude/hooks/worktree-remove.sh");
});

test("the generated rule-guidance block is CANONICAL markdown, so both stages can be green at once", () => {
  // A CROSS-TOOL invariant, and it needs a cross-tool pin: `AGENTS.md` is written by this generator AND
  // owned by the docs formatter (class 3 of the #2144 widening). They enforce each other's opposite —
  // `check:agents` requires the generator's exact bytes, `check:docs` requires canonical markdown — so if
  // the emitted block is not already canonical, the two stages CANNOT both be green and the only escapes
  // are fencing the file out of one door (which is what #2173 had to do, at the cost of leaving its
  // hand-authored lines unchecked) or hand-editing generated output (which the next sync overwrites).
  //
  // #2175 removed the deadlock by making the GENERATOR emit the two blank lines at the marker seams. This
  // asserts the property rather than the two lines: any future edit to `renderedRuleGuidance()` that
  // emits non-canonical markdown fails HERE, at the generator, instead of surfacing as an unexplainable
  // red in a docs lane that has never heard of `agents:sync`.
  const projectInstructions = readFileSync(join(ROOT, "AGENTS.md"), "utf8");
  const { output, refusal } = formatMarkdown(projectInstructions);

  expect(refusal).toBeNull();
  expect(output).toBe(projectInstructions);
  expect(codexAgentSyncProblems()).toEqual([]);
});
