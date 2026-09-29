#!/usr/bin/env node
// PreToolUse on CodeGraph MCP tools: point a worktree caller at its own index. Every subagent shares the
// main session's MCP connection, which `.mcp.json` pins to main, so without `projectPath` a lane reads
// main's index and never sees its own edits. Inert when the caller is not in an indexed worktree.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const WORKTREES_SEGMENT = `${path.sep}.claude${path.sep}worktrees${path.sep}`;
// worktree-setup.sh builds this before the lane starts, and removes it if the build fails.
const INDEX_DB = path.join(".codegraph", "codegraph.db");

function worktreeRoot(cwd) {
  const at = cwd.indexOf(WORKTREES_SEGMENT);
  if (at === -1) {
    return null;
  }
  const name = cwd.slice(at + WORKTREES_SEGMENT.length).split(path.sep)[0];
  if (!name) {
    return null;
  }
  return cwd.slice(0, at + WORKTREES_SEGMENT.length) + name;
}

const payload = JSON.parse(readFileSync(0, "utf8"));
const input = payload.tool_input ?? {};
const root = typeof payload.cwd === "string" ? worktreeRoot(payload.cwd) : null;

if (root !== null && input.projectPath === undefined && existsSync(path.join(root, INDEX_DB))) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        permissionDecisionReason: `codegraph: querying this worktree's index (${root})`,
        updatedInput: { ...input, projectPath: root },
      },
    }),
  );
}
