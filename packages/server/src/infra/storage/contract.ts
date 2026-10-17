// infra/storage's type home (§7.4). The per-user runtime-root vocabulary lives here rather than beside its
// executor so the shape has ONE home the barrel and the executor both read: `RUNTIME_TOOLS` is the closed set
// of tools that get a `<USER_RUNTIME_DIR>/<ownerId>/<tool>/` root, and every path builder is keyed on it.

import type { UserId } from "@orb/kit/ids";

/** The tools that own a per-user runtime root (inference program §8.4-2). One member today: the agent-sdk's
 *  `claude` CLI, whose `CLAUDE_CONFIG_DIR`/`ANTHROPIC_CONFIG_DIR` point at that directory. */
const RUNTIME_TOOLS = ["claude"] as const;
export type RuntimeTool = (typeof RUNTIME_TOOLS)[number];

export interface UserRuntimeDirs {
  /** The path — created on first read (0700), so a spawn never races a missing directory. */
  readonly dirFor: (ownerId: UserId, tool: RuntimeTool) => string;
  /** Remove the user's whole tool dir — the credentials domain calls it when the row is deleted. */
  readonly remove: (ownerId: UserId, tool: RuntimeTool) => void;
}
