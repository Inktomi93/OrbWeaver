// The two verbs: WRITE the Codex mirror (`.codex/agents/*.toml` + AGENTS.md's generated rule-import
// block + the shared skill symlink check) and CHECK it. Check never writes; write is idempotent and
// prunes .toml files whose Claude source is gone — a stale role manifest is a role Codex can still
// dispatch after the role was retired.
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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
  RULE_IMPORTS_BEGIN,
  RULE_IMPORTS_END,
  RULE_IMPORTS_PATTERN,
} from "../lib/paths.ts";
import { renderCodexAgent } from "./render.ts";

function sourceFilenames(): readonly string[] {
  return readdirSync(CLAUDE_AGENTS_DIR).filter(isMarkdown).toSorted();
}

function ruleFilenames(): readonly string[] {
  return readdirSync(CLAUDE_RULES_DIR).filter(isMarkdown).toSorted();
}

function renderedRuleImports(): string {
  const imports = ruleFilenames().map((filename) => `@.claude/rules/${filename}`);
  if (imports.length === 0) {
    throw new Error(".claude/rules must contain at least one Markdown rule");
  }
  return [RULE_IMPORTS_BEGIN, ...imports, RULE_IMPORTS_END].join("\n");
}

function replaceRuleImports(source: string): string {
  if (!RULE_IMPORTS_PATTERN.test(source)) {
    throw new Error("AGENTS.md is missing the generated Claude rule import block");
  }
  return source.replace(RULE_IMPORTS_PATTERN, renderedRuleImports());
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
  if (!agentsSource.includes(renderedRuleImports())) {
    problems.push("AGENTS.md Claude rule imports are stale; run pnpm agents:sync");
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
  readonly ruleImports: number;
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
  writeFileSync(AGENTS_PATH, replaceRuleImports(readFileSync(AGENTS_PATH, "utf8")));
  const skillsProblem = skillsLinkProblem();
  if (skillsProblem !== null) {
    throw new Error(skillsProblem);
  }
  return { roles: sourceFiles.length, ruleImports: ruleFilenames().length };
}

/** How many role manifests `--check` compared (the check's own receipt line). */
export function codexRoleCount(): number {
  return sourceFilenames().length;
}
