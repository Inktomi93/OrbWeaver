// The SessionStart orchestrator-skill injection (.claude/hooks/orchestrator-inject.mjs): every registered part
// runs through the real hook, the parts rejoin to the exact skill body, each stays under the harness cap, and
// a subagent gets nothing.
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { expect, test } from "../support/tool-fixtures.ts";
import { scaledBudget } from "./_load-budget.ts";

const HOOK = fileURLToPath(new URL("../../.claude/hooks/orchestrator-inject.mjs", import.meta.url));
const SKILL = fileURLToPath(new URL("../../.claude/skills/orchestrator/SKILL.md", import.meta.url));
const SETTINGS = fileURLToPath(new URL("../../.claude/settings.json", import.meta.url));
// The harness replaces any additionalContext string longer than this with a file path and a preview.
const HARNESS_CAP = 10_000;
const LABEL_END = "\n\n";
// Well under the registered hook timeout; a hook that blocks (a FIFO transcript) fails here instead of hanging.
const HOOK_RUN_BASE_MS = 5000;

// The harness's SessionStart stdin. Computed keys because the wire vocabulary is the harness's snake_case.
const MAIN_PAYLOAD = {
  ["session_id"]: "s1",
  source: "compact",
  ["hook_event_name"]: "SessionStart",
  ["transcript_path"]: "/home/u/.claude/projects/p/s1.jsonl",
};
const SUBAGENT_PAYLOADS = [
  { ...MAIN_PAYLOAD, ["agent_id"]: "a1b2c3" },
  { ...MAIN_PAYLOAD, ["agent_type"]: "verifier" },
  { ...MAIN_PAYLOAD, ["transcript_path"]: "/home/u/.claude/projects/p/s1/subagents/agent-a1b2c3.jsonl" },
];

interface HookHandler {
  readonly args?: readonly string[];
}

/** The part numbers `.claude/settings.json` registers for this hook, in registration order. */
function registeredParts(): number[] {
  const settings = JSON.parse(readFileSync(SETTINGS, "utf8")) as { hooks: { ["SessionStart"]: { hooks: HookHandler[] }[] } };
  return settings.hooks["SessionStart"]
    .flatMap((group) => group.hooks)
    .filter((handler) => (handler.args ?? []).some((arg) => arg.endsWith("/.claude/hooks/orchestrator-inject.mjs")))
    .map((handler) => Number((handler.args ?? []).at(-1)));
}

function runHook(hook: string, part: number, payload: object): string {
  const run = spawnSync(process.execPath, [hook, String(part)], { input: JSON.stringify(payload), encoding: "utf8", timeout: scaledBudget(HOOK_RUN_BASE_MS) });
  expect(run.status, run.stderr).toBe(0);
  return run.stdout;
}

function injected(stdout: string): string {
  const output = JSON.parse(stdout) as { hookSpecificOutput: { hookEventName: string; additionalContext: string } };
  expect(output.hookSpecificOutput.hookEventName).toBe("SessionStart");
  return output.hookSpecificOutput.additionalContext;
}

/** The skill with its frontmatter removed: what a Skill-tool load puts in context. */
function skillBody(markdown: string): string {
  const closing = markdown.indexOf("\n---\n", 4);
  return markdown.slice(closing + "\n---\n".length).replace(/^\n+/, "");
}

function withoutLabel(context: string): string {
  return context.slice(context.indexOf(LABEL_END) + LABEL_END.length);
}

/** A copy of the hook in a scratch repo layout, so it reads a planted skill instead of the real one. */
function plantHook(scratch: string, skill: string | null): string {
  const hooks = join(scratch, ".claude", "hooks");
  mkdirSync(hooks, { recursive: true });
  copyFileSync(HOOK, join(hooks, "orchestrator-inject.mjs"));
  if (skill !== null) {
    mkdirSync(join(scratch, ".claude", "skills", "orchestrator"), { recursive: true });
    writeFileSync(join(scratch, ".claude", "skills", "orchestrator", "SKILL.md"), skill);
  }
  return join(hooks, "orchestrator-inject.mjs");
}

test("the registered parts rejoin to the exact skill body, each under the harness cap", () => {
  const parts = registeredParts();
  expect(parts.length, "settings.json registers no orchestrator-inject.mjs entry").toBeGreaterThan(0);
  expect(parts, "register parts 1..N in order").toEqual(parts.map((_, index) => index + 1));

  const contexts = parts.map((part) => injected(runHook(HOOK, part, MAIN_PAYLOAD)));
  for (const context of contexts) {
    expect(context.length).toBeLessThan(HARNESS_CAP);
  }
  expect(contexts.map(withoutLabel).join("")).toBe(skillBody(readFileSync(SKILL, "utf8")));
  expect(runHook(HOOK, parts.length + 1, MAIN_PAYLOAD), "a part past the registered entries is dropped by the harness").toBe("");
});

test("a subagent, or a session launched as a role agent, gets no injection", () => {
  const parts = registeredParts();
  expect(parts.length, "settings.json registers no orchestrator-inject.mjs entry").toBeGreaterThan(0);
  for (const payload of SUBAGENT_PAYLOADS) {
    for (const part of parts) {
      expect(runHook(HOOK, part, payload), JSON.stringify(payload)).toBe("");
    }
  }
});

test("a sidechain transcript gets no injection even without a subagent path", ({ scratch }) => {
  const transcript = join(scratch, "s1.jsonl");
  writeFileSync(transcript, `${JSON.stringify({ type: "user", isSidechain: false })}\n${JSON.stringify({ type: "assistant", isSidechain: true })}\n`);

  for (const part of registeredParts()) {
    expect(runHook(HOOK, part, { ...MAIN_PAYLOAD, ["transcript_path"]: transcript })).toBe("");
  }
});

test("a transcript path that is not a regular file still injects, and never blocks", ({ scratch }) => {
  const fifo = join(scratch, "fifo.jsonl");
  const made = spawnSync("mkfifo", [fifo]);
  expect(made.status, "mkfifo").toBe(0);

  for (const transcript of [scratch, fifo]) {
    for (const part of registeredParts()) {
      expect(injected(runHook(HOOK, part, { ...MAIN_PAYLOAD, ["transcript_path"]: transcript })), transcript).toMatch(/^Orchestrator skill, part /);
    }
  }
});

/** A section of exactly `size` chars, heading included. */
function sizedSection(name: string, size: number): string {
  const heading = `## ${name}\n\n`;
  return `${heading}${"x".repeat(size - heading.length - 1)}\n`;
}

test("a skill that outgrows the registered parts makes the last part name the unread sections, within the cap", ({ scratch }) => {
  const intro = "# Orchestrator\n\n";
  const loose = [1, 2, 3, 4, 5].map((n) => sizedSection(`Loose${n}`, 4511)).join("");
  // Parts 1 and 2 each fill the packing budget exactly, so the notice has no room unless it is reserved.
  const tight = `${intro}${sizedSection("A", 9874 - intro.length)}${sizedSection("B", 9874)}${sizedSection("C", 200)}`;

  for (const [body, unread] of [
    [tight, "## C"],
    [`${intro}${loose}`, "## Loose5"],
  ] as const) {
    const hook = plantHook(join(scratch, unread.slice(3)), `---\nname: orchestrator\n---\n\n${body}`);
    const parts = registeredParts();
    const contexts = parts.map((part) => injected(runHook(hook, part, MAIN_PAYLOAD)));
    for (const [index, context] of contexts.entries()) {
      expect(context.length, unread).toBeLessThanOrEqual(HARNESS_CAP);
      expect(context.startsWith(`Orchestrator skill, part ${index + 1} of ${parts.length},`), "every label counts the delivered parts").toBe(true);
    }
    const last = withoutLabel(contexts.at(-1) ?? "");
    expect(last.startsWith("The skill outgrew its injected parts."), "the notice leads the last part").toBe(true);
    expect(last.split("\n\n")[0]).toContain(unread);
  }
});

test("an unreadable skill tells the session to load it, never injects nothing", ({ scratch }) => {
  const hook = plantHook(scratch, null);

  expect(injected(runHook(hook, 1, MAIN_PAYLOAD))).toContain("Load the orchestrator skill with the Skill tool");
});
