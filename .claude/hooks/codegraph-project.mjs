#!/usr/bin/env node
// PreToolUse on CodeGraph MCP tools: route a registered linked worktree to its own index. The hook
// grants an input update only after the caller and the installed script share Git repository identity.
import { spawnSync } from "node:child_process";
import { readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const INSTALLED_ROOT = path.resolve(path.dirname(realpathSync(fileURLToPath(import.meta.url))), "../..");
const INDEX_DB = path.join(".codegraph", "codegraph.db");
// Installed CodeGraph MCP tools all accept projectPath; new tools need an explicit routing decision.
const PROJECT_TOOLS = new Set(
  ["search", "callers", "callees", "impact", "node", "explore", "status", "files"].map((name) => `mcp__codegraph__codegraph_${name}`),
);

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function git(cwd, ...args) {
  const result = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

function canonical(target) {
  try {
    return realpathSync(target);
  } catch {
    return null;
  }
}

function inside(root, candidate) {
  const rel = path.relative(root, candidate);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

function registeredWorktree(cwd) {
  const trustedTop = git(INSTALLED_ROOT, "rev-parse", "--show-toplevel");
  const activeTop = git(cwd, "rev-parse", "--show-toplevel");
  if (trustedTop === null || activeTop === null) {
    return null;
  }
  const trusted = canonical(trustedTop);
  const active = canonical(activeTop);
  const trustedCommon = canonical(git(trustedTop, "rev-parse", "--path-format=absolute", "--git-common-dir"));
  const activeCommon = canonical(git(activeTop, "rev-parse", "--path-format=absolute", "--git-common-dir"));
  if (trusted === null || active === null || trustedCommon === null || activeCommon !== trustedCommon) {
    return null;
  }
  const listing = git(trusted, "worktree", "list", "--porcelain", "-z");
  if (listing === null) {
    return null;
  }
  const roots = listing
    .split("\0\0")
    .map((record) => record.split("\0")[0])
    .filter((line) => line.startsWith("worktree "))
    .map((line) => canonical(line.slice("worktree ".length)));
  const primary = roots[0];
  if (primary === null || primary === undefined || active === primary || !roots.includes(active)) {
    return null;
  }
  return active;
}

function hasLocalIndex(root) {
  const db = path.join(root, INDEX_DB);
  const index = canonical(db);
  if (index === null || !inside(root, index)) {
    return false;
  }
  try {
    return statSync(db).isFile();
  } catch {
    return false;
  }
}

let payload;
try {
  payload = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}
const input = isObject(payload) ? payload.tool_input : null;
if (
  !isObject(input) ||
  payload.hook_event_name !== "PreToolUse" ||
  typeof payload.tool_name !== "string" ||
  !PROJECT_TOOLS.has(payload.tool_name) ||
  typeof payload.cwd !== "string" ||
  Object.hasOwn(input, "projectPath")
) {
  process.exit(0);
}
const worktree = registeredWorktree(payload.cwd);
if (worktree !== null) {
  if (!hasLocalIndex(worktree)) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: `CodeGraph index is unavailable in this worktree (${worktree}); run codegraph index from that checkout before querying.`,
        },
      }),
    );
    process.exit(0);
  }
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        permissionDecisionReason: `codegraph: querying this worktree's index (${worktree})`,
        updatedInput: { ...input, projectPath: worktree },
      },
    }),
  );
}
