// The two verbs: WRITE the Codex mirror (`.codex/agents/*.toml` + the shared skill symlink check) and
// CHECK it. Check never writes; write is idempotent and prunes .toml files whose Claude source is gone —
// a stale role manifest is a role Codex can still dispatch after the role was deleted.
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { AgentSyncResult } from "../contract/types.ts";
import { parseClaudeAgent, parseFrontmatter } from "../lib/frontmatter.ts";
import { isFamilyModel, resolveRoleModels } from "../lib/model-resolution.ts";
import { agentPaths, codexFilename, isMarkdown, isToml, ROLE_EFFORT_OVERRIDES, ROLE_FAMILIES } from "../lib/paths.ts";
import { readModelCatalog } from "./catalog.ts";
import { renderCodexAgent } from "./render.ts";

refuseDirectInvocation(import.meta.url, "pnpm agents:sync");

function sourceFilenames(root: string): readonly string[] {
  return readdirSync(agentPaths(root).claudeAgents).filter(isMarkdown).toSorted();
}

function skillsLinkProblem(root: string): string | null {
  if (!(existsSync(agentPaths(root).codexSkills) && lstatSync(agentPaths(root).codexSkills).isSymbolicLink())) {
    return ".agents/skills must be a symlink to .claude/skills";
  }
  if (realpathSync(agentPaths(root).codexSkills) !== realpathSync(agentPaths(root).claudeSkills)) {
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
function browserMcpProblems(root: string): readonly string[] {
  const problems: string[] = [];
  const frontmatterPattern = /^---\n([\s\S]*?)\n---/u;
  for (const filename of readdirSync(agentPaths(root).claudeAgents).filter(isMarkdown)) {
    const source = readFileSync(join(agentPaths(root).claudeAgents, filename), "utf8");
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
export function codexAgentSyncProblems(root = REPO_ROOT): readonly string[] {
  const sources = sourceFilenames(root);
  const expectedFiles = sources.map(codexFilename);
  const actualFiles = readdirSync(agentPaths(root).codexAgents).filter(isToml).toSorted();
  const problems: string[] = [...browserMcpProblems(root)];

  const skillsProblem = skillsLinkProblem(root);
  if (skillsProblem !== null) {
    problems.push(skillsProblem);
  }

  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    problems.push(`agent file set differs: expected ${expectedFiles.join(", ")}; found ${actualFiles.join(", ")}`);
  }

  const familySelections = new Map<string, string>();
  for (const sourceFilename of sources) {
    const targetFilename = codexFilename(sourceFilename);
    const targetPath = join(agentPaths(root).codexAgents, targetFilename);
    const source = readFileSync(join(agentPaths(root).claudeAgents, sourceFilename), "utf8");
    const agent = parseClaudeAgent(sourceFilename, source);
    const family = ROLE_FAMILIES[agent.name];
    if (family === undefined) {
      problems.push(`${sourceFilename}: missing Codex model family mapping`);
      continue;
    }
    const current = existsSync(targetPath) ? readFileSync(targetPath, "utf8") : "";
    const model = /^model = "([^"]+)"$/mu.exec(current)?.[1];
    if (model === undefined || !isFamilyModel(model, family)) {
      problems.push(`${targetFilename}: missing or wrong-family stable model; run pnpm agents:sync`);
      continue;
    }
    const previous = familySelections.get(family);
    if (previous !== undefined && previous !== model) {
      problems.push(`${targetFilename}: ${family} family selection differs from ${previous}`);
    }
    familySelections.set(family, model);
    const expected = renderCodexAgent(sourceFilename, source, model, root);
    if (current !== expected) {
      problems.push(`${targetFilename} is stale; run pnpm agents:sync`);
    }
  }
  return problems;
}

/** Regenerate the whole Codex mirror. Returns how many role manifests it wrote (the cli prints it). */
export function syncCodexAgents(catalogPath: string, root = REPO_ROOT): AgentSyncResult {
  const sourceFiles = sourceFilenames(root);
  const catalog = readModelCatalog(catalogPath);
  const sources = sourceFiles.map((filename) => ({ filename, source: readFileSync(join(agentPaths(root).claudeAgents, filename), "utf8") }));
  const roleEfforts = Object.fromEntries(
    sources.map(({ filename, source }) => {
      const agent = parseClaudeAgent(filename, source);
      return [agent.name, ROLE_EFFORT_OVERRIDES[agent.name] ?? agent.effort];
    }),
  );
  const selections = resolveRoleModels(catalog, roleEfforts);
  const rendered = sources.map(({ filename, source }) => {
    const agent = parseClaudeAgent(filename, source);
    const model = selections[agent.name];
    if (model === undefined) {
      throw new Error(`${filename}: unresolved Codex model`);
    }
    return { filename: codexFilename(filename), content: renderCodexAgent(filename, source, model, root) };
  });
  const skillsProblem = skillsLinkProblem(root);
  if (skillsProblem !== null) {
    throw new Error(skillsProblem);
  }
  mkdirSync(agentPaths(root).codexAgents, { recursive: true });
  const expectedTargets = new Set(sourceFiles.map(codexFilename));

  for (const targetFilename of readdirSync(agentPaths(root).codexAgents).filter(isToml)) {
    if (!expectedTargets.has(targetFilename)) {
      unlinkSync(join(agentPaths(root).codexAgents, targetFilename));
    }
  }
  for (const target of rendered) {
    writeFileSync(join(agentPaths(root).codexAgents, target.filename), target.content);
  }
  return { roles: sourceFiles.length, fetchedAt: catalog.fetchedAt };
}

/** How many role manifests `--check` compared (the check's own receipt line). */
export function codexRoleCount(root = REPO_ROOT): number {
  return sourceFilenames(root).length;
}
