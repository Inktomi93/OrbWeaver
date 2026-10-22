#!/usr/bin/env node
// PostToolUse reports file-scoped Biome findings as advisory context without changing files.
// Only registered worktrees of the repository containing this hook can supply code or executables.
import { spawnSync } from "node:child_process";
import { readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const TOOLS = new Set(["Edit", "Write", "MultiEdit"]);
const EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".jsonc",
  ".css",
  ".yml",
  ".yaml",
  ".html",
  ".svg",
  ".webmanifest",
]);
const CONTEXT_LIMIT = 8000;
const TIMEOUT_MS = 15_000;
const MAX_BUFFER = 65_536;

function report(message) {
  const context =
    message.length > CONTEXT_LIMIT ? `${message.slice(0, CONTEXT_LIMIT)}\n… output truncated; run Biome on the edited file for full diagnostics.` : message;
  process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: context } })}\n`);
}

function git(cwd, args) {
  const result = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8", timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER });
  if (result.error || result.status !== 0) {
    throw new Error(`Git could not resolve the edit checkout: ${result.error?.message ?? result.stderr.trim()}`);
  }
  return result.stdout;
}

function within(root, file) {
  const rel = path.relative(root, file);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function string(value) {
  return typeof value === "string" && value.length > 0;
}

function readInput() {
  const input = JSON.parse(readFileSync(0, "utf8"));
  if (!(object(input) && string(input.hook_event_name) && string(input.tool_name))) {
    throw new Error("Malformed hook input: expected hook_event_name and tool_name strings.");
  }
  if (input.hook_event_name !== "PostToolUse" || !TOOLS.has(input.tool_name)) {
    return null;
  }
  if (!(string(input.cwd) && object(input.tool_input) && string(input.tool_input.file_path))) {
    throw new Error("Malformed edit input: expected cwd and tool_input.file_path strings.");
  }
  return input;
}

function main() {
  const input = readInput();
  if (input === null) {
    return;
  }
  const file = path.resolve(input.cwd, input.tool_input.file_path);
  if (!EXTENSIONS.has(path.extname(file))) {
    return;
  }
  const hookRoot = path.resolve(import.meta.dirname, "../..");
  const roots = git(hookRoot, ["worktree", "list", "--porcelain", "-z"])
    .split("\0")
    .filter((field) => field.startsWith("worktree "))
    .map((field) => field.slice("worktree ".length))
    .sort((a, b) => b.length - a.length);
  const cwdRoot = git(input.cwd, ["rev-parse", "--show-toplevel"]).trim();
  if (!roots.includes(cwdRoot)) {
    throw new Error("Hook cwd is not a registered worktree of this repository.");
  }
  // Nested lane worktrees belong to their deepest registered root, not the enclosing main checkout.
  const root = roots.find((candidate) => within(candidate, file));
  if (!root) {
    throw new Error(`Edited file is outside this repository's registered worktrees: ${file}`);
  }
  const realFile = realpathSync(file);
  const realRoot = realpathSync(root);
  if (!within(realRoot, realFile) || roots.some((candidate) => candidate !== root && within(root, candidate) && within(candidate, realFile))) {
    throw new Error(`Edited file resolves outside its owning worktree: ${file}`);
  }
  if (!statSync(realFile).isFile()) {
    throw new Error(`Edited path is not a file: ${file}`);
  }
  if (git(path.dirname(realFile), ["rev-parse", "--show-toplevel"]).trim() !== root) {
    throw new Error(`Edited file belongs to an unregistered nested repository: ${file}`);
  }
  const result = spawnSync(
    process.execPath,
    [
      path.join(root, "node_modules/@biomejs/biome/bin/biome"),
      "check",
      `--config-path=${root}`,
      "--reporter=concise",
      "--colors=off",
      "--diagnostic-level=warn",
      "--error-on-warnings",
      "--max-diagnostics=20",
      `./${path.relative(root, file)}`,
    ],
    { cwd: root, encoding: "utf8", timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER },
  );
  if (result.error || result.signal || result.status === null) {
    throw new Error(`Biome did not complete: ${result.error?.message ?? result.signal}. Run a scoped Biome check.`);
  }
  if (result.status !== 0) {
    report(`edit-check: Biome reported findings or could not check ${path.relative(root, file)} (exit ${result.status}).\n${result.stderr}${result.stdout}`);
  }
}

try {
  main();
} catch (error) {
  report(`edit-check: Biome check was NOT completed. ${error instanceof Error ? error.message : String(error)}`);
}
