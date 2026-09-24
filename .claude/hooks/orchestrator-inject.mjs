#!/usr/bin/env node
// SessionStart hook (startup, resume, compact, clear): injects the orchestrator skill body into a MAIN
// session as `additionalContext`. An order to load the skill can be skipped after a compaction; injected
// text cannot. `.claude/skills/orchestrator/SKILL.md` stays the one home: this reads it on every run.
//
// SIZE CONTRACT. The harness caps each `additionalContext` string at 10,000 chars; past it the session gets
// a file path and a 2,000-char preview, and nothing prompts a read. The body is packed by `## ` section into
// parts that each fit, and `.claude/settings.json` registers one entry per part (argv[2] is the 1-based part
// number, REGISTERED_PARTS entries). A body that outgrows them makes the last registered part open with a
// notice naming the unread sections, inside the cap; tests/tooling/orchestrator-inject-hook.int.test.ts fails
// on that, on a part over the cap, and on drift between REGISTERED_PARTS and the registered entries.
//
// MAIN ONLY. A subagent, or a session launched with `--agent`, runs a role, not the orchestrator. The
// discriminators are those of `is_subagent()` in the user-level context-sentinel.py hook: the payload's
// agent fields, a `/subagents/` transcript path, and `isSidechain` on the transcript's latest entry.
import { closeSync, fstatSync, openSync, readFileSync, readSync, statSync } from "node:fs";
import process from "node:process";

const SKILL_PATH = new URL("../skills/orchestrator/SKILL.md", import.meta.url);
const SKILL_REPO_PATH = ".claude/skills/orchestrator/SKILL.md";
const CONTEXT_CAP = 10_000;
const REGISTERED_PARTS = 2;
const FRONTMATTER = /^---\n[\s\S]*?\n---\n+/;
// A lookahead split keeps each heading with its section, so the pieces rejoin to the exact body.
const SECTION_SPLIT = /(?=^## )/m;
const SECTION_HEADING = /^## .*$/gm;
// The transcript's newest entries sit at its end; the sentinel reads the same tail size.
const TRANSCRIPT_TAIL_BYTES = 2_000_000;

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

// The latest transcript entry that carries `isSidechain` decides. A missing or unreadable transcript is a
// fresh main session. The type is checked before `open`, because opening a FIFO blocks until a writer appears.
function isSidechainTranscript(path) {
  let fd;
  try {
    if (!statSync(path).isFile()) {
      return false;
    }
    fd = openSync(path, "r");
  } catch {
    return false;
  }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) {
      return false;
    }
    const size = stat.size;
    const length = Math.min(size, TRANSCRIPT_TAIL_BYTES);
    const buffer = Buffer.alloc(length);
    readSync(fd, buffer, 0, length, size - length);
    for (const line of buffer.toString("utf8").split("\n").reverse()) {
      try {
        const entry = JSON.parse(line);
        if (typeof entry.isSidechain === "boolean") {
          return entry.isSidechain;
        }
      } catch {
        // A partial first line of the tail, or a blank line, is not an entry.
      }
    }
    return false;
  } catch {
    return false;
  } finally {
    closeSync(fd);
  }
}

function isSubagent(payload) {
  const transcript = typeof payload.transcript_path === "string" ? payload.transcript_path : "";
  return Boolean(payload.agent_id || payload.agent_type || transcript.includes("/subagents/") || (transcript && isSidechainTranscript(transcript)));
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

function outgrewNotice(unreadSections) {
  const headings = unreadSections.join("").match(SECTION_HEADING) ?? [];
  return `The skill outgrew its injected parts. Read these sections of \`${SKILL_REPO_PATH}\` now: ${headings.join("; ")}.\n\n`;
}

// The notice leads the last registered part and is counted against the cap before any section is kept, so
// it can never be the text the harness cuts. Each section that does not fit moves into the notice.
function overflowPart(rest) {
  const sections = rest.split(SECTION_SPLIT);
  const label = partLabel(REGISTERED_PARTS, REGISTERED_PARTS);
  for (let kept = sections.length - 1; kept > 0; kept--) {
    const text = label + outgrewNotice(sections.slice(kept)) + sections.slice(0, kept).join("");
    if (text.length <= CONTEXT_CAP) {
      return text;
    }
  }
  return label + outgrewNotice(sections);
}

function context(index) {
  const parts = pack(readFileSync(SKILL_PATH, "utf8").replace(FRONTMATTER, ""));
  if (index > parts.length) {
    return null;
  }
  if (index === REGISTERED_PARTS && parts.length > REGISTERED_PARTS) {
    return overflowPart(parts.slice(REGISTERED_PARTS - 1).join(""));
  }
  return partLabel(index, Math.min(parts.length, REGISTERED_PARTS)) + parts[index - 1];
}

function emit(additionalContext) {
  process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext } })}\n`);
}

const requested = Number(process.argv[2]);
if (Number.isInteger(requested) && requested >= 1 && requested <= REGISTERED_PARTS) {
  try {
    const text = isSubagent(readPayload()) ? null : context(requested);
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
