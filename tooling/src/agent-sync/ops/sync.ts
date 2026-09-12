// The two verbs: WRITE the Codex mirror (`.codex/agents/*.toml` + AGENTS.md's generated rule-guidance
// block + the shared skill symlink check) and CHECK it. Check never writes; write is idempotent and
// prunes .toml files whose Claude source is gone — a stale role manifest is a role Codex can still
// dispatch after the role was retired.
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import {
  AGENTS_PATH,
  CLAUDE_AGENTS_DIR,
  CLAUDE_RULES_DIR,
  CLAUDE_SKILLS_DIR,
  CODEX_AGENTS_DIR,
  CODEX_SKILLS_DIR,
  codexFilename,
  isMarkdown,
  isToml,
  RULE_GUIDANCE_BEGIN,
  RULE_GUIDANCE_END,
  RULE_GUIDANCE_PATTERN,
} from "../lib/paths.ts";
import { renderCodexAgent } from "./render.ts";

refuseDirectInvocation(import.meta.url, "pnpm agents:sync");

function sourceFilenames(): readonly string[] {
  return readdirSync(CLAUDE_AGENTS_DIR).filter(isMarkdown).toSorted();
}

function ruleFilenames(): readonly string[] {
  return readdirSync(CLAUDE_RULES_DIR).filter(isMarkdown).toSorted();
}

function renderedRuleGuidance(): string {
  const rules = ruleFilenames().map((filename) => `- \`.claude/rules/${filename}\``);
  if (rules.length === 0) {
    throw new Error(".claude/rules must contain at least one Markdown rule");
  }
  return [
    RULE_GUIDANCE_BEGIN,
    // The two blank lines at the SEAMS are load-bearing, not cosmetic (#2173). The block lands inside
    // root `AGENTS.md`, which the docs formatter now owns (class 3 of the #2144 widening), and canonical
    // markdown puts a blank line between an HTML comment and the heading that follows it, and before a
    // closing comment that ends a list. Emitting them here is what lets `check:agents` and `check:docs`
    // be green in the SAME tree: without them the formatter wanted bytes this generator would overwrite
    // on the next sync, so `AGENTS.md` had to be fenced out of the format population entirely and its
    // ~33 hand-authored lines went unchecked. Delete either blank and that deadlock returns.
    "",
    "## Codex reading map",
    "",
    "Codex does not expand `@path` directives. Begin with the bounded task and the relevant source and tests; load shared policy when the work reaches the decision or action it governs:",
    "",
    "- A lookup of a file, command, value, or test location does not itself require a build, review, or test preflight. Inspect the relevant source or help entry and finish once the answer is supported.",
    "- Use §0.3 of `docs/architecture/core/AGENTS.md` as the reading router when policy is needed. Read a complete relevant section and its needed linked constraints before making the decision or change it governs.",
    "- When making or reviewing an architecture or package-placement decision, read constitution §§0.2, 2, and 3 plus the pertinent spine section.",
    "- Before adding, changing, or running tests, read `.claude/rules/lane-standing-facts.md` sections `Verification floors` and `Running suites without starving the box`, plus the relevant testing law.",
    "- Before staging, committing, creating, moving, or merging a worktree, read `.claude/rules/lane-standing-facts.md` section `Staging and commits` plus constitution §L.",
    "- Before driving or changing the running stack, read `.claude/rules/lane-standing-facts.md` section `The dev stack`.",
    "- Read the applicable `.claude/agent-doctrine.md` section when the task reaches one of its build-process topics; it is not a routine whole-file preflight in Codex.",
    "- For delegation, consult the role table and the relevant parts of `Rules` and `What a brief must carry` in `.claude/rules/orchestration.md`; add its concurrency or merge constraints only when the operation needs them. Subagents follow their role prompt and do not load orchestrator-only policy.",
    "- The current requested goal bounds the work. Continue necessary work within it; do not adopt standing overnight or whole-Ready-queue draining as the default scope of an unrelated task.",
    "- For a work-item operation, use current `pnpm work:item --help`; consult orchestrator-runbook §1 only when the help does not settle the lifecycle question. Routine board operations do not require `dogfood-loop`; use it when a drive or finding workflow is relevant.",
    "- For a worktree or integration operation, consult only the relevant runbook §5 or §6 procedure and the existing native worktree paths. Do not load unrelated account or lifecycle procedures.",
    "- Claude-account, bridge, onboard, project-memory, and hook-automation procedures do not establish Codex runtime state. Use them when the task concerns Claude setup; otherwise use the Codex tools and live state available in this session.",
    "- Read the current board when a lifecycle, refill, or recovery decision needs it; do not repeat the same board view without a new decision or relevant state change.",
    "- Read `.claude/rules/browser-and-instruments.md` for component tests, end-to-end tests, or rendered/browser probes.",
    "- Read `.claude/rules/db-schema.md` before touching database schema or migrations.",
    "- Read `.claude/rules/gates-and-tooling.md` before touching tooling, gates, or tooling tests.",
    '- To preserve an independent review, spawn `verifier`, `side-eye`, or `stickler` with `fork_turns="none"` and give it a self-contained brief. Codex defaults to a full-history fork.',
    "- Use the global `code-recon` skill when its advanced reference is relevant to the task, primarily in `Explore` and `scout`. It is not routine pre-reading. In Codex, `.claude/agent-doctrine.md`'s blanket direction to load it does not require a separate skill read.",
    "- Use `Core-Path-Registry.md` and `Core-Enforcement-Active-Gates.md` as targeted lookup catalogs: read the complete relevant D entry or gate row and the linked constraints needed for the task, rather than both catalogs in full.",
    "- Archived library companions are provenance and reference material. Read them when the task needs that history, not during routine startup.",
    "- Do not reread unchanged material already present in context. If a read is truncated, retrieve the missing relevant sections instead of repeating the whole file. Full reads still apply to changed or reviewed source and tests, and when the user explicitly requests a full document read.",
    "",
    "Claude `memory: project`, path-scoped rule auto-loading, permission/post-edit/onboard hooks, and worktree isolation do not carry into Codex. Use Codex-native memory, tools, and subagent controls; treat Claude-specific names in shared role prose as intent labels. Run the required verification explicitly.",
    "",
    "Canonical Claude-owned rule inventory (generated so a new rule cannot disappear from the Codex entry point):",
    "",
    ...rules,
    "",
    RULE_GUIDANCE_END,
  ].join("\n");
}

function replaceRuleGuidance(source: string): string {
  if (!RULE_GUIDANCE_PATTERN.test(source)) {
    throw new Error("AGENTS.md is missing the generated Claude rule guidance block");
  }
  return source.replace(RULE_GUIDANCE_PATTERN, renderedRuleGuidance());
}

function skillsLinkProblem(): string | null {
  if (!(existsSync(CODEX_SKILLS_DIR) && lstatSync(CODEX_SKILLS_DIR).isSymbolicLink())) {
    return ".agents/skills must be a symlink to .claude/skills";
  }
  if (realpathSync(CODEX_SKILLS_DIR) !== realpathSync(CLAUDE_SKILLS_DIR)) {
    return ".agents/skills does not resolve to .claude/skills";
  }
  return null;
}

/** Every way the Codex mirror can be stale, as operator-readable lines. Empty = current. */
export function codexAgentSyncProblems(): readonly string[] {
  const expectedFiles = sourceFilenames().map(codexFilename);
  const actualFiles = readdirSync(CODEX_AGENTS_DIR).filter(isToml).toSorted();
  const problems: string[] = [];

  const skillsProblem = skillsLinkProblem();
  if (skillsProblem !== null) {
    problems.push(skillsProblem);
  }

  const agentsSource = readFileSync(AGENTS_PATH, "utf8");
  if (!agentsSource.includes(renderedRuleGuidance())) {
    problems.push("AGENTS.md Claude rule guidance is stale; run pnpm agents:sync");
  }

  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    problems.push(`agent file set differs: expected ${expectedFiles.join(", ")}; found ${actualFiles.join(", ")}`);
  }

  for (const sourceFilename of sourceFilenames()) {
    const targetFilename = codexFilename(sourceFilename);
    const targetPath = join(CODEX_AGENTS_DIR, targetFilename);
    const expected = renderCodexAgent(sourceFilename, readFileSync(join(CLAUDE_AGENTS_DIR, sourceFilename), "utf8"));
    if (!existsSync(targetPath) || readFileSync(targetPath, "utf8") !== expected) {
      problems.push(`${targetFilename} is stale; run pnpm agents:sync`);
    }
  }
  return problems;
}

export interface SyncCounts {
  readonly roles: number;
  readonly rules: number;
}

/** Regenerate the whole Codex mirror. Returns what it wrote (the cli prints it). */
export function syncCodexAgents(): SyncCounts {
  mkdirSync(CODEX_AGENTS_DIR, { recursive: true });
  const sourceFiles = sourceFilenames();
  const expectedTargets = new Set(sourceFiles.map(codexFilename));

  for (const targetFilename of readdirSync(CODEX_AGENTS_DIR).filter(isToml)) {
    if (!expectedTargets.has(targetFilename)) {
      unlinkSync(join(CODEX_AGENTS_DIR, targetFilename));
    }
  }
  for (const sourceFilename of sourceFiles) {
    const targetFilename = codexFilename(sourceFilename);
    const rendered = renderCodexAgent(sourceFilename, readFileSync(join(CLAUDE_AGENTS_DIR, sourceFilename), "utf8"));
    writeFileSync(join(CODEX_AGENTS_DIR, targetFilename), rendered);
  }
  writeFileSync(AGENTS_PATH, replaceRuleGuidance(readFileSync(AGENTS_PATH, "utf8")));
  const skillsProblem = skillsLinkProblem();
  if (skillsProblem !== null) {
    throw new Error(skillsProblem);
  }
  return { roles: sourceFiles.length, rules: ruleFilenames().length };
}

/** How many role manifests `--check` compared (the check's own receipt line). */
export function codexRoleCount(): number {
  return sourceFilenames().length;
}
