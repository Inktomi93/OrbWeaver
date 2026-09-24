#!/usr/bin/env node
// SessionStart hook (startup, resume, compact, clear): injects the orchestrator skill body into a MAIN
// session as `additionalContext`. An order to load the skill can be skipped after a compaction; injected
// text cannot. `.claude/skills/orchestrator/SKILL.md` stays the one home: this reads it on every run.
//
// SIZE CONTRACT. The harness caps each `additionalContext` string at 10,000 chars; past it the session gets
// a file path and a 2,000-char preview, and nothing prompts a read. The body is packed by `## ` section into
// parts that each fit, and `.claude/settings.json` registers one entry per part (argv[2] is the 1-based part
// number, REGISTERED_PARTS entries). A body that outgrows them makes the last part name the unread sections;
// tests/tooling/orchestrator-inject-hook.int.test.ts fails on that, on a part over the cap, and on drift
// between REGISTERED_PARTS and the registered entries.
//
// MAIN ONLY. A subagent, or a session launched with `--agent`, runs a role, not the orchestrator. The
// discriminators match `is_subagent()` in the user-level context-sentinel.py hook.
import { readFileSync } from "node:fs";
import process from "node:process";

const SKILL_PATH = new URL("../skills/orchestrator/SKILL.md", import.meta.url);
const SKILL_REPO_PATH = ".claude/skills/orchestrator/SKILL.md";
const CONTEXT_CAP = 10_000;
const REGISTERED_PARTS = 2;
const FRONTMATTER = /^---\n[\s\S]*?\n---\n+/;
// A lookahead split keeps each heading with its section, so the pieces rejoin to the exact body.
const SECTION_SPLIT = /(?=^## )/m;
const SECTION_HEADING = /^## .*$/gm;

function readPayload() {
  if (process.stdin.isTTY) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return {};
  }
}

function isSubagent(payload) {
  const transcript = typeof payload.transcript_path === "string" ? payload.transcript_path : "";
  return Boolean(payload.agent_id || payload.agent_type || transcript.includes("/subagents/"));
}

function partLabel(index, total) {
  return `Orchestrator skill, part ${index} of ${total}, injected from \`${SKILL_REPO_PATH}\`. It is loaded; do not load it again.\n\n`;
}

// Greedy packing in reading order, so a part never cuts a section. The label is measured at its widest
// (two-digit part numbers) so a part that fits here still fits once labelled.
function pack(body) {
  const budget = CONTEXT_CAP - partLabel(99, 99).length;
  const parts = [];
  for (const section of body.split(SECTION_SPLIT)) {
    const last = parts.length - 1;
    if (last >= 0 && parts[last].length + section.length <= budget) {
      parts[last] += section;
    } else {
      parts.push(section);
    }
  }
  return parts;
}

function context(index) {
  const parts = pack(readFileSync(SKILL_PATH, "utf8").replace(FRONTMATTER, ""));
  if (index > parts.length) {
    return null;
  }
  let text = partLabel(index, parts.length) + parts[index - 1];
  if (index === REGISTERED_PARTS && parts.length > REGISTERED_PARTS) {
    const unread = parts.slice(REGISTERED_PARTS).join("").match(SECTION_HEADING) ?? [];
    text += `\n\nThe skill outgrew its injected parts. Read these sections of \`${SKILL_REPO_PATH}\` now: ${unread.join("; ")}.`;
  }
  return text;
}

function emit(additionalContext) {
  process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext } })}\n`);
}

const requested = Number(process.argv[2]);
if (!isSubagent(readPayload()) && Number.isInteger(requested) && requested >= 1 && requested <= REGISTERED_PARTS) {
  try {
    const text = context(requested);
    if (text !== null) {
      emit(text);
    }
  } catch (error) {
    // A silent failure here recreates the skipped-skill defect, so the session is told to load it itself.
    emit(
      `The orchestrator skill injection failed (${error instanceof Error ? error.message : String(error)}). Load the orchestrator skill with the Skill tool before any lane, merge, bridge note or worktree action.`,
    );
  }
}
