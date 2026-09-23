// The two verbs: WRITE the Codex mirror (`.codex/agents/*.toml` + the shared skill symlink check) and
// CHECK it. Check never writes; write is idempotent and prunes .toml files whose Claude source is gone —
// a stale role manifest is a role Codex can still dispatch after the role was deleted.
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { parseFrontmatter } from "../lib/frontmatter.ts";
import { CLAUDE_AGENTS_DIR, CLAUDE_SKILLS_DIR, CODEX_AGENTS_DIR, CODEX_SKILLS_DIR, codexFilename, isMarkdown, isToml } from "../lib/paths.ts";
import { renderCodexAgent } from "./render.ts";

refuseDirectInvocation(import.meta.url, "pnpm agents:sync");

function sourceFilenames(): readonly string[] {
  return readdirSync(CLAUDE_AGENTS_DIR).filter(isMarkdown).toSorted();
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

// #1279: browser MCP server names that must not appear in agent definitions. The chrome-devtools MCP was
// retired 2026-09-02 (#1255) and every load-bearing use is a snap arm now; re-adding a browser MCP grant
// to an agent definition is the regression this check prevents.
const bannedMcpServers = new Set([
  "chrome",
  "chrome-devtools",
  "devtools",
  "playwright",
  "browserbase",
  "puppeteer",
  "selenium",
  "browser",
  "claude-in-chrome",
]);

/** #1279: scan every agent def for browser MCP server grants that should not be re-added. */
function browserMcpProblems(): readonly string[] {
  const problems: string[] = [];
  const frontmatterPattern = /^---\n([\s\S]*?)\n---/u;
  for (const filename of readdirSync(CLAUDE_AGENTS_DIR).filter(isMarkdown)) {
    const source = readFileSync(join(CLAUDE_AGENTS_DIR, filename), "utf8");
    const match = frontmatterPattern.exec(source);
    if (match?.[1] === undefined) {
      continue;
    }
    const record = parseFrontmatter(match[1], filename);
    const servers = record["mcpServers"];
    if (!Array.isArray(servers)) {
      continue;
    }
    for (const server of servers) {
      if (typeof server === "string" && bannedMcpServers.has(server.toLowerCase())) {
        problems.push(
          `${filename}: mcpServers includes banned browser MCP "${server}" (#1279, #1255 retirement). ` +
            "Every browser capability is a snap arm now; remove the grant.",
        );
      }
    }
  }
  return problems;
}

/** Every way the Codex mirror can be stale, as operator-readable lines. Empty = current. */
export function codexAgentSyncProblems(): readonly string[] {
  const expectedFiles = sourceFilenames().map(codexFilename);
  const actualFiles = readdirSync(CODEX_AGENTS_DIR).filter(isToml).toSorted();
  const problems: string[] = [...browserMcpProblems()];

  const skillsProblem = skillsLinkProblem();
  if (skillsProblem !== null) {
    problems.push(skillsProblem);
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

/** Regenerate the whole Codex mirror. Returns how many role manifests it wrote (the cli prints it). */
export function syncCodexAgents(): number {
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
  const skillsProblem = skillsLinkProblem();
  if (skillsProblem !== null) {
    throw new Error(skillsProblem);
  }
  return sourceFiles.length;
}

/** How many role manifests `--check` compared (the check's own receipt line). */
export function codexRoleCount(): number {
  return sourceFilenames().length;
}
