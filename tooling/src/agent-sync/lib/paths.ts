// The tree coordinates agent-sync reads and writes, plus the Claude→Codex role/model map. Pure
// constants + one pure filename derivation; every path anchors on the ONE repo root (_shared/artifacts).
import { join } from "node:path";
import { REPO_ROOT } from "../../_shared/artifacts.ts";
import type { AgentPaths, ModelFamily } from "../contract/types.ts";

/** Resolve the mirror inside the supplied checkout, including isolated test fixtures. */
export function agentPaths(root = REPO_ROOT): AgentPaths {
  return {
    claudeAgents: join(root, ".claude", "agents"),
    claudeSkills: join(root, ".claude", "skills"),
    codexAgents: join(root, ".codex", "agents"),
    codexSkills: join(root, ".agents", "skills"),
  };
}

/** Codex routing is explicit so an unmapped role cannot inherit the parent model. */
export const ROLE_FAMILIES: Readonly<Record<string, ModelFamily>> = {
  executor: "sol",
  forge: "astra",
  "mech-executor": "luna",
  "security-executor": "sol",
  "sonnet-executor": "luna",
  "side-eye": "sol",
  stickler: "astra",
  verifier: "sol",
};

/** Codex-only effort choices differ from Claude for these roles. Other roles inherit Claude effort. */
export const ROLE_EFFORT_OVERRIDES: Readonly<Record<string, "medium" | "high">> = {
  forge: "medium",
  "mech-executor": "high",
  stickler: "medium",
};

const MD_SUFFIX = ".md";

/** `.claude/agents/verifier.md` → `verifier.toml`. */
export function codexFilename(sourceFilename: string): string {
  return `${sourceFilename.slice(0, -MD_SUFFIX.length)}.toml`;
}

export function isMarkdown(filename: string): boolean {
  return filename.endsWith(MD_SUFFIX);
}

export function isToml(filename: string): boolean {
  return filename.endsWith(".toml");
}
