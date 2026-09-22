// agent-sync's programmatic front door (`pnpm agents:sync` / `pnpm check:agents`) — the Claude role
// manifests in `.claude/agents/` are the SOURCE; `.codex/agents/*.toml` is a generated mirror, and the
// check arm is what keeps a Codex session from dispatching a role body that no longer exists.
export type { ClaudeAgent, RulePaths } from "./contract/types.ts";
export { parseClaudeAgent, parseFrontmatter, parseRulePaths } from "./lib/frontmatter.ts";
export { BANNED_INSTRUCTION_WORDS, backtickedRepoPaths, glossaryWords, markdownLinkTargets, proseFindings, proseOnly } from "./lib/instruction-text.ts";
export { codexFilename, ROLE_MODELS, RULE_GUIDANCE_PATTERN } from "./lib/paths.ts";
export { ALWAYS_ON_LINE_BUDGET, alwaysOnLines, instructionFileCount, instructionFiles, instructionLayerProblems } from "./ops/instructions.ts";
export { renderCodexAgent } from "./ops/render.ts";
export type { SyncCounts } from "./ops/sync.ts";
export { codexAgentSyncProblems, codexRoleCount, syncCodexAgents } from "./ops/sync.ts";
