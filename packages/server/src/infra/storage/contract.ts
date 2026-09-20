// infra/storage's type home (§7.4). The per-user runtime-root vocabulary lives here rather than beside its
// executor so the shape has ONE home the barrel and the executor both read: `RUNTIME_TOOLS` is the closed set
// of tools that get a `<USER_RUNTIME_DIR>/<ownerId>/<tool>/` root, and every path builder is keyed on it.

/** The tools that own a per-user runtime root (inference program §8.4-2). One member today: the agent-sdk's
 *  `claude` CLI, whose `CLAUDE_CONFIG_DIR`/`ANTHROPIC_CONFIG_DIR` point at that directory. */
const RUNTIME_TOOLS = ["claude"] as const;
export type RuntimeTool = (typeof RUNTIME_TOOLS)[number];
