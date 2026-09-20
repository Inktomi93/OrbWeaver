// The PER-USER runtime-state root (inference program §8.4-2): `<USER_RUNTIME_DIR>/<ownerId>/<tool>/`, mode 0700,
// the directory every agent-sdk spawn for that user sets `CLAUDE_CONFIG_DIR`/`ANTHROPIC_CONFIG_DIR` to. One user's
// runtime writes (history, statsig, its own settings) never share a directory with another's — sharing one is
// the pipe the old env firewall existed to close. The owner segment rides the CAS's own path-segment rule.

import { mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import type { UserId } from "@orb/kit/ids";

const RUNTIME_TOOLS = ["claude"] as const;
export type RuntimeTool = (typeof RUNTIME_TOOLS)[number];

/** A TypeID (`user_…`) is `[a-z0-9_]+`; anything else could escape the root and is refused before a path is built. */
const OWNER_SEGMENT = /^[a-z0-9_]+$/;

function assertOwnerSegment(ownerId: string): void {
  if (!OWNER_SEGMENT.test(ownerId)) {
    throw new Error(`userRuntimeDir: refusing owner segment ${JSON.stringify(ownerId)}`);
  }
}

export interface UserRuntimeDirs {
  /** The path — created on first read (0700), so a spawn never races a missing directory. */
  readonly dirFor: (ownerId: UserId, tool: RuntimeTool) => string;
  /** Remove the user's whole tool dir — the credentials domain calls it when the row is deleted. */
  readonly remove: (ownerId: UserId, tool: RuntimeTool) => void;
}

export function createUserRuntimeDirs(root: string): UserRuntimeDirs {
  const base = resolve(root);
  const pathOf = (ownerId: UserId, tool: RuntimeTool): string => {
    assertOwnerSegment(ownerId);
    return join(base, ownerId, tool);
  };
  return {
    dirFor: (ownerId, tool): string => {
      const dir = pathOf(ownerId, tool);
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      return dir;
    },
    remove: (ownerId, tool): void => {
      rmSync(pathOf(ownerId, tool), { recursive: true, force: true });
    },
  };
}
