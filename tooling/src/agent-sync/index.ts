// agent-sync's programmatic front door (`pnpm agents:sync` / `pnpm check:agents`) — the Claude role
// manifests in `.claude/agents/` are the SOURCE; `.codex/agents/*.toml` is a generated mirror, and the
// check arm is what keeps a Codex session from dispatching a role body that no longer exists.
export type { ClaudeAgent } from "./contract/types.ts";
export { parseClaudeAgent, parseFrontmatter } from "./lib/frontmatter.ts";
export { codexFilename, ROLE_MODELS } from "./lib/paths.ts";
export { renderCodexAgent } from "./ops/render.ts";
export type { SyncCounts } from "./ops/sync.ts";
export { codexAgentSyncProblems, codexRoleCount, syncCodexAgents } from "./ops/sync.ts";
