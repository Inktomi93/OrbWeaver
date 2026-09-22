// The Definition-of-Done engine — PURE (#923; docs/design/work-item-dod.md). A row's bar lives in TWO
// paired places: the command itself in a ```dod fenced block in the ISSUE BODY (GitHub keeps body edit
// history — the visible trace), and a sha256 stamp of that command in the Project's DoD text field,
// which only the red-first mint paths write. Both sides must agree before anything executes: an issue
// AUTHOR can plant a block (including an outside contributor on their own issue) but cannot write
// Project fields, so an unstamped or mismatched block is refused by name, never run.
//
// Normalization is shared by mint and read: GitHub returns bodies with \r\n, and a stamp computed over
// \n would false-mismatch every close.
import { createHash } from "node:crypto";
import { UsageError } from "../../_shared/run-tool.ts";

const DOD_FENCE_RE = /^```dod\n([\s\S]*?)\n```/gmu;
const DOD_HEADING = "### Definition of Done";
const STAMP_HEX_LENGTH = 16;
const TRIPLE_BACKTICK = "```";
/** `npx` strips both the workspace NODE_OPTIONS heap floor and the nice level (measured 2026-08-27,
 *  the lane skill) — a DoD spelled with it runs un-floored on every close. Word-boundary match so
 *  command SUBSTRINGS (`pnpm-npx-shim`) stay legal; a literal `npx` search term is the accepted cost. */
const NPX_RE = /(?:^|[\s;&|(])npx(?:\s|$)/u;

export function normalizeIssueBody(body: string): string {
  return body.replaceAll("\r\n", "\n");
}

/** Refuse an unusable bar at PARSE time (misuse, exit 3): empty, fence-breaking, or npx-spelled. */
export function validateDodCommand(raw: string): string {
  const command = raw.trim();
  if (command === "") {
    throw new UsageError("a DoD command must not be empty");
  }
  if (command.includes(TRIPLE_BACKTICK)) {
    throw new UsageError("a DoD command must not contain ``` — it is embedded in a fenced block in the issue body");
  }
  if (NPX_RE.test(command)) {
    throw new UsageError(
      "a DoD command must not invoke npx (it drops the workspace heap floor and the nice level) — spell it with the named pnpm script or pnpm exec",
    );
  }
  return command;
}

/** `sha256:<16hex>` over the exact command text — the Project-side pairing stamp. */
export function dodStamp(command: string): string {
  return `sha256:${createHash("sha256").update(command, "utf8").digest("hex").slice(0, STAMP_HEX_LENGTH)}`;
}

export function buildDodBlock(command: string): string {
  return `${DOD_HEADING}\n\n\`\`\`dod\n${command}\n\`\`\``;
}

export function appendDodBlock(body: string, command: string): string {
  const base = normalizeIssueBody(body).trimEnd();
  return base === "" ? buildDodBlock(command) : `${base}\n\n${buildDodBlock(command)}`;
}

/** GitHub's marker for an optional issue-form field left blank. A `render: dod` textarea (the form
 *  ingress, #923 P5) would fence it — treat that block as ABSENT, or every form-filed row with an
 *  empty DoD field would be unclosable. A hand-authored EMPTY block still refuses loudly below. */
const FORM_EMPTY_RESPONSE = "_No response_";
const AMBIGUOUS_BAR = "the issue body carries more than one ```dod block — an ambiguous bar; keep exactly one";

/** The one bar, or null. TWO blocks is an ambiguous bar — refused loudly, never first-match-wins. */
export function extractDod(body: string): string | null {
  const matches = [...normalizeIssueBody(body).matchAll(DOD_FENCE_RE)];
  if (matches.length === 0) {
    return null;
  }
  if (matches.length > 1) {
    throw new Error(AMBIGUOUS_BAR);
  }
  const command = (matches[0]?.[1] ?? "").trim();
  if (command === FORM_EMPTY_RESPONSE) {
    return null;
  }
  if (command === "") {
    throw new Error("the issue body's ```dod block is empty — not a runnable bar; re-mint it or remove the block");
  }
  return command;
}

/** Replace the existing block's fence in place (the re-mint path — body edit history is the trace), or
 *  append a fresh block when none exists. Keyed on FENCE presence, not on extractDod: a form-emitted
 *  `_No response_` fence reads as an absent BAR but is still the fence to replace — and an empty or
 *  stale block is exactly what a re-mint repairs, so neither refuses here. */
export function upsertDodBlock(body: string, command: string): string {
  const normalized = normalizeIssueBody(body);
  const fences = [...normalized.matchAll(DOD_FENCE_RE)];
  if (fences.length > 1) {
    throw new Error(AMBIGUOUS_BAR);
  }
  if (fences.length === 0) {
    return appendDodBlock(normalized, command);
  }
  return normalized.replace(DOD_FENCE_RE, `\`\`\`dod\n${command}\n\`\`\``);
}
