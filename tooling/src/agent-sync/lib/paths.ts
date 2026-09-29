// The tree coordinates agent-sync reads and writes, plus the Claude→Codex role/model map. Pure
// constants + one pure filename derivation; every path anchors on the ONE repo root (_shared/artifacts).
import { join } from "node:path";
import { REPO_ROOT } from "../../_shared/artifacts.ts";

export const CLAUDE_AGENTS_DIR = join(REPO_ROOT, ".claude", "agents");
export const CLAUDE_SKILLS_DIR = join(REPO_ROOT, ".claude", "skills");
export const CODEX_AGENTS_DIR = join(REPO_ROOT, ".codex", "agents");
export const CODEX_SKILLS_DIR = join(REPO_ROOT, ".agents", "skills");

/** Codex routing is explicit so an unmapped role cannot inherit the parent model. */
export const ROLE_MODELS: Readonly<Record<string, string>> = {
  executor: "gpt-6-sol",
  forge: "gpt-6-astra",
  "mech-executor": "gpt-6-luna",
  "security-executor": "gpt-6-sol",
  "side-eye": "gpt-6-sol",
  stickler: "gpt-6-astra",
  verifier: "gpt-6-sol",
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
