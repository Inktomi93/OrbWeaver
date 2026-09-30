#!/usr/bin/env node
// Adapt Codex apply_patch events to the shared edit checker. PostToolUse feedback is advisory context:
// blocking here would reject a nested code-mode promise after its edit has already taken effect.
import { spawnSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const installedRoot = path.resolve(path.dirname(realpathSync(fileURLToPath(import.meta.url))), "../..");
const checker = path.join(installedRoot, ".claude", "hooks", "biome-check.mjs");

function context(message) {
  process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: message } })}\n`);
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function failedResponse(response) {
  if (isObject(response)) {
    return response.isError === true || response.success === false || (typeof response.exit_code === "number" && response.exit_code !== 0);
  }
  return typeof response === "string" && /^(apply_patch verification failed|Failed|Error:|Invalid patch)/u.test(response);
}

function changedPaths(patch) {
  const lines = patch.trim().split(/\r?\n/u);
  if (lines[0] !== "*** Begin Patch" || lines.at(-1) !== "*** End Patch") {
    return null;
  }
  const paths = new Map();
  let movedFrom = null;
  for (const line of lines) {
    const header = /^\*\*\* (Add|Update|Delete) File: (.+)$/u.exec(line);
    if (header !== null) {
      const [, kind, file] = header;
      if (kind === "Delete") {
        paths.set(file, "deleted");
        movedFrom = null;
      } else {
        paths.set(file, "present");
        movedFrom = kind === "Update" ? file : null;
      }
      continue;
    }
    const move = /^\*\*\* Move to: (.+)$/u.exec(line);
    if (move !== null) {
      if (movedFrom === null) {
        return null;
      }
      paths.set(movedFrom, "deleted");
      paths.set(move[1], "present");
      movedFrom = null;
    }
  }
  return paths.size > 0 ? paths : null;
}

function main() {
  let input;
  try {
    input = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    context("Edit advisory was NOT completed: Codex hook input is malformed.");
    return;
  }
  if (!isObject(input) || input.hook_event_name !== "PostToolUse" || input.tool_name !== "apply_patch") {
    return;
  }
  if (failedResponse(input.tool_response)) {
    return;
  }
  if (typeof input.cwd !== "string" || input.cwd === "" || !isObject(input.tool_input) || typeof input.tool_input.command !== "string") {
    context("Edit advisory was NOT completed: Codex patch event lacks cwd or tool_input.command.");
    return;
  }
  const paths = changedPaths(input.tool_input.command);
  if (paths === null) {
    context("Edit advisory was NOT completed: patch file headers could not be read.");
    return;
  }
  const payload = Object.fromEntries([
    ["hook_event_name", "PostToolUse"],
    ["tool_name", "CodexPatch"],
    ["cwd", input.cwd],
    ["tool_input", { subjects: [...paths].map(([file, status]) => ({ file, status })) }],
  ]);
  const result = spawnSync(process.execPath, [checker], {
    encoding: "utf8",
    input: JSON.stringify(payload),
    env: { ...process.env, ["CLAUDE_PROJECT_DIR"]: installedRoot },
    maxBuffer: 10 * 1024 * 1024,
  });
  const messages = [];
  if (result.error !== undefined) {
    messages.push(`Edit advisory was NOT completed: ${result.error.message}`);
  } else if (result.status === 2) {
    messages.push(result.stderr.trim() || "Edit advisory was NOT completed: checker returned no diagnostics.");
  } else if (result.status !== 0 || result.stderr !== "") {
    messages.push(`Edit advisory was NOT completed: checker exited ${String(result.status)}. ${result.stderr.trim()}`);
  }
  if (messages.length > 0) {
    context(messages.join("\n\n"));
  }
}

main();
