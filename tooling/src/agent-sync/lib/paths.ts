// The tree coordinates agent-sync reads and writes, plus the Claude→Codex role/model map. Pure
// constants + one pure filename derivation; every path anchors on the ONE repo root (_shared/artifacts).
import { join } from "node:path";
import { REPO_ROOT } from "../../_shared/artifacts.ts";

export const CLAUDE_AGENTS_DIR = join(REPO_ROOT, ".claude", "agents");
export const CLAUDE_SKILLS_DIR = join(REPO_ROOT, ".claude", "skills");
export const CODEX_AGENTS_DIR = join(REPO_ROOT, ".codex", "agents");
export const CODEX_SKILLS_DIR = join(REPO_ROOT, ".agents", "skills");

/** Owner ruling 2026-08-20: every Codex project role runs `gpt-5.6-sol`; reasoning effort stays the
 *  per-role axis (read from the Claude manifest's `effort`). An unmapped role name is a hard error —
 *  `model` defaults to `inherit` in Codex, which makes routing unverifiable. */
export const ROLE_MODELS: Readonly<Record<string, string>> = {
  executor: "gpt-5.6-sol",
  forge: "gpt-5.6-sol",
  "mech-executor": "gpt-5.6-sol",
  "security-executor": "gpt-5.6-sol",
  "side-eye": "gpt-5.6-sol",
  stickler: "gpt-5.6-sol",
  verifier: "gpt-5.6-sol",
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
