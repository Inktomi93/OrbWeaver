// The instruction-layer check that `pnpm check:agents` runs beside the Codex mirror check. It keeps the
// always-on text small and every instruction file inside the charter in `.claude/rules/writing.md`:
//   1. `CLAUDE.md`, its `@` imports and every rule without list-form `paths:` stay under the line budget;
//   2. every `.claude/rules/*.md` has list-form `paths:` frontmatter;
//   3. no history marker or banned word in prose (`lib/instruction-text.ts` owns the rules);
//   4. every relative markdown link and backticked repository path resolves.
// Each check takes the repository root, so the tests run it on planted trees.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { parseRulePaths } from "../lib/frontmatter.ts";
import { backtickedRepoPaths, glossaryWords, lineCount, markdownLinkTargets, proseFindings } from "../lib/instruction-text.ts";

refuseDirectInvocation(import.meta.url, "pnpm check:agents");

/** `.claude/rules/writing.md` rule 12: always-on text stays under this many lines. */
export const ALWAYS_ON_LINE_BUDGET = 200;

/** Directories under `.claude/` that hold no authored instruction text: lane checkouts and the shared
 *  memory link. */
const SKIPPED_CLAUDE_DIRS = new Set(["worktrees", "agent-memory"]);
const IMPORT_LINE = /^@(\S+)\s*$/u;

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
  const top = ["CLAUDE.md", "AGENTS.md"].filter((name) => existsSync(join(root, name)));
  return [...top, ...markdownUnder(root, ".claude")].toSorted();
}

function read(root: string, rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

function ruleFiles(root: string): readonly string[] {
  return instructionFiles(root).filter((rel) => dirname(rel) === join(".claude", "rules"));
}

/** `CLAUDE.md` plus each file it imports with an `@path` line, plus every rule with no `paths:` list. */
export function alwaysOnLines(root: string): { readonly total: number; readonly parts: readonly string[] } {
  const parts: string[] = [];
  let total = 0;
  const claude = existsSync(join(root, "CLAUDE.md")) ? read(root, "CLAUDE.md") : "";
  total += lineCount(claude);
  parts.push(`CLAUDE.md ${lineCount(claude)}`);
  for (const line of claude.split("\n")) {
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

function pathsProblems(root: string): readonly string[] {
  return ruleFiles(root).flatMap((rel) => {
    const paths = parseRulePaths(read(root, rel));
    if (paths.kind === "list") {
      return [];
    }
    return [`${rel}: needs list-form \`paths:\` frontmatter (found ${paths.kind === "inline" ? "an inline value" : "none"})`];
  });
}

function referenceProblems(root: string, rel: string, source: string): readonly string[] {
  const problems: string[] = [];
  for (const { line, target } of markdownLinkTargets(source)) {
    if (target !== "" && !existsSync(join(root, dirname(rel), target))) {
      problems.push(`${rel}:${line}: link target does not exist: ${target}`);
    }
  }
  for (const { line, path } of backtickedRepoPaths(source)) {
    if (!existsSync(join(root, path))) {
      problems.push(`${rel}:${line}: path does not exist: ${path}`);
    }
  }
  return problems;
}

/** Every way the instruction layer breaks the charter, as operator-readable lines. Empty = clean. */
export function instructionLayerProblems(root: string): readonly string[] {
  const allowed = existsSync(join(root, "CLAUDE.md")) ? glossaryWords(read(root, "CLAUDE.md")) : new Set<string>();
  const perFile = instructionFiles(root).flatMap((rel) => {
    const source = read(root, rel);
    return [...proseFindings(rel, source, allowed), ...referenceProblems(root, rel, source)];
  });
  return [...budgetProblems(root), ...pathsProblems(root), ...perFile];
}

/** How many files the check read, for the check's own summary line. A zero is a broken walk. */
export function instructionFileCount(root: string): number {
  return instructionFiles(root).length;
}
