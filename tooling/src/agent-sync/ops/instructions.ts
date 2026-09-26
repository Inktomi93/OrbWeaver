// The instruction-layer check that `pnpm check:agents` runs beside the Codex mirror check. It keeps the
// always-on text small and every instruction file inside the charter in `.claude/rules/writing.md`:
//   1. `AGENTS.md`, its `@` imports and every rule without list-form `paths:` stay under the line budget;
//   2. `AGENTS.md` is the one always-on file: a root twin named for Claude Code is a second copy;
//   3. every `.claude/rules/*.md` has list-form `paths:` frontmatter, and `AGENTS.md` lists it with
//      exactly those globs (Codex has no path-scoped loading, so that list is how it finds a rule);
//   4. no history marker, inventory count or banned word in prose (`_shared/prose-rules.ts` owns the rules);
//   5. every relative markdown link and backticked repository path resolves (`_shared/prose-references.ts`).
// The docs tree has its own walk in `doc/ops/check.ts`, run from the same `--check` door. Each check takes
// the repository root, so the tests run it on planted trees.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { docFileCount, docLayerProblems } from "#doc";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { referenceProblems } from "../../_shared/prose-references.ts";
import { glossaryWords, lineCount, proseFindings } from "../../_shared/prose-rules.ts";
import type { RulePaths } from "../contract/types.ts";
import { parseRulePaths } from "../lib/frontmatter.ts";

refuseDirectInvocation(import.meta.url, "pnpm check:agents");

/** `.claude/rules/writing.md` rule 12: always-on text stays under this many lines. */
export const ALWAYS_ON_LINE_BUDGET = 200;

/** The always-on instruction file both Claude Code and Codex load from the repository root. */
const ALWAYS_ON_FILE = "AGENTS.md";

/** Directories under `.claude/` that hold no authored instruction text: lane checkouts. */
const SKIPPED_CLAUDE_DIRS = new Set(["worktrees"]);
const IMPORT_LINE = /^@(\S+)\s*$/u;
const RULE_LIST_LINE = /^- `(\.claude\/rules\/[^`]+)`:/u;

function markdownUnder(root: string, dir: string): readonly string[] {
  const abs = join(root, dir);
  if (!existsSync(abs)) {
    return [];
  }
  const found: string[] = [];
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    const rel = join(dir, entry.name);
    if (entry.isSymbolicLink()) {
      continue;
    }
    if (entry.isDirectory()) {
      if (!(dir === ".claude" && SKIPPED_CLAUDE_DIRS.has(entry.name))) {
        found.push(...markdownUnder(root, rel));
      }
    } else if (entry.name.endsWith(".md")) {
      found.push(rel);
    }
  }
  return found;
}

/** Every instruction file the charter governs, repo-relative and sorted. */
export function instructionFiles(root: string): readonly string[] {
  const top = [ALWAYS_ON_FILE].filter((name) => existsSync(join(root, name)));
  return [...top, ...markdownUnder(root, ".claude")].toSorted();
}

function read(root: string, rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function readAlwaysOn(root: string): string {
  return existsSync(join(root, ALWAYS_ON_FILE)) ? read(root, ALWAYS_ON_FILE) : "";
}

function ruleFiles(root: string): readonly string[] {
  return instructionFiles(root).filter((rel) => dirname(rel) === join(".claude", "rules"));
}

/** `AGENTS.md` plus each file it imports with an `@path` line, plus every rule with no `paths:` list. */
export function alwaysOnLines(root: string): { readonly total: number; readonly parts: readonly string[] } {
  const parts: string[] = [];
  let total = 0;
  const core = readAlwaysOn(root);
  total += lineCount(core);
  parts.push(`${ALWAYS_ON_FILE} ${lineCount(core)}`);
  for (const line of core.split(/\r?\n/u)) {
    const imported = IMPORT_LINE.exec(line)?.[1];
    if (imported !== undefined && existsSync(join(root, imported))) {
      const count = lineCount(read(root, imported));
      total += count;
      parts.push(`${imported} ${count} (imported)`);
    }
  }
  for (const rel of ruleFiles(root)) {
    if (parseRulePaths(read(root, rel)).kind !== "list") {
      const count = lineCount(read(root, rel));
      total += count;
      parts.push(`${rel} ${count} (no paths:)`);
    }
  }
  return { total, parts };
}

function budgetProblems(root: string): readonly string[] {
  const { total, parts } = alwaysOnLines(root);
  return total < ALWAYS_ON_LINE_BUDGET ? [] : [`always-on instruction text is ${total} lines (budget: under ${ALWAYS_ON_LINE_BUDGET}): ${parts.join(", ")}`];
}

function singleSourceProblems(root: string): readonly string[] {
  const problems: string[] = [];
  if (!existsSync(join(root, ALWAYS_ON_FILE))) {
    problems.push(`${ALWAYS_ON_FILE} is missing; it is the always-on instruction file`);
  }
  if (existsSync(join(root, "CLAUDE.md"))) {
    problems.push(`CLAUDE.md: ${ALWAYS_ON_FILE} is the one always-on file; move this text into it and delete CLAUDE.md`);
  }
  return problems;
}

function pathsProblems(root: string): readonly string[] {
  return ruleFiles(root).flatMap((rel) => {
    const paths = parseRulePaths(read(root, rel));
    if (paths.kind === "list") {
      return [];
    }
    return [`${rel}: needs list-form \`paths:\` frontmatter (found ${paths.kind === "inline" ? "an inline value" : "none"})`];
  });
}

/** The line `AGENTS.md` carries for one rule. A rule without list-form `paths:` has no expected line;
 *  `pathsProblems` already reports it. */
export function ruleListLine(rel: string, paths: RulePaths): string | null {
  if (paths.kind !== "list") {
    return null;
  }
  return `- \`${rel}\`: ${paths.globs.map((glob) => `\`${glob}\``).join(", ")}`;
}

/** The hand-written rule list in `AGENTS.md` against the rule files: one line per rule, with the rule's
 *  own globs, and no line for a rule that does not exist. */
function ruleListProblems(root: string): readonly string[] {
  const listed = new Map<string, { readonly line: number; readonly text: string }>();
  readAlwaysOn(root)
    .split(/\r?\n/u)
    .forEach((text, index) => {
      const rel = RULE_LIST_LINE.exec(text)?.[1];
      if (rel !== undefined) {
        listed.set(rel, { line: index + 1, text });
      }
    });
  const problems: string[] = [];
  const rules = new Set(ruleFiles(root));
  for (const rel of rules) {
    const entry = listed.get(rel);
    if (entry === undefined) {
      problems.push(`${ALWAYS_ON_FILE}: the path-rule list has no line for ${rel}`);
      continue;
    }
    const expected = ruleListLine(rel, parseRulePaths(read(root, rel)));
    if (expected !== null && entry.text !== expected) {
      problems.push(`${ALWAYS_ON_FILE}:${entry.line}: the line for ${rel} does not match its \`paths:\`; expected: ${expected}`);
    }
  }
  for (const [rel, entry] of listed) {
    if (!rules.has(rel)) {
      problems.push(`${ALWAYS_ON_FILE}:${entry.line}: the path-rule list names ${rel}, which is not a rule file`);
    }
  }
  return problems;
}

/** Every way the instruction layer breaks the charter, as operator-readable lines. Empty = clean. */
export function instructionLayerProblems(root: string): readonly string[] {
  const allowed = glossaryWords(readAlwaysOn(root));
  const perFile = instructionFiles(root).flatMap((rel) => {
    const source = read(root, rel);
    return [...proseFindings(rel, source, allowed), ...referenceProblems(root, rel, source)];
  });
  return [...singleSourceProblems(root), ...budgetProblems(root), ...pathsProblems(root), ...ruleListProblems(root), ...perFile];
}

/** How many files the check read, for the check's own summary line. A zero is a broken walk. */
export function instructionFileCount(root: string): number {
  return instructionFiles(root).length;
}

/** The whole `--check` verdict: the instruction layer plus the governed docs tree (`doc/ops/check.ts`),
 *  one list so a red in either reads the same way. */
export function checkedLayerProblems(root: string): readonly string[] {
  return [...instructionLayerProblems(root), ...docLayerProblems(root)];
}

export function checkedDocCount(root: string): number {
  return docFileCount(root);
}
