// The instruction-layer text rules as pure functions (string in, findings out), so the whole check is
// unit-testable without a tree. The charter they enforce is `.claude/rules/writing.md`; the filesystem
// walk that feeds them is `ops/instructions.ts`.
//
// WHAT IS NOT PROSE: a fenced code block, an inline code span and an owner-voice section. Code and path
// literals quote the codebase exactly, and the owner's own words are exempt from the plain style. They
// are blanked to spaces (newlines kept) so a finding still reports its real line.

const FENCE_PATTERN = /^\s*(```|~~~)/u;
const INLINE_CODE_PATTERN = /(`+)([\s\S]*?[^`])\1(?!`)/gu;
const OWNER_VOICE_OPEN = "<!-- owner-voice -->";
const OWNER_VOICE_CLOSE = "<!-- /owner-voice -->";
const MARKDOWN_LINK_PATTERN = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/gu;

/** History markers and house slang the charter bans from prose. Each pattern names what it catches. */
const HISTORY_RULES: readonly { readonly label: string; readonly pattern: RegExp }[] = [
  { label: "a date", pattern: /\b(?:19|20)\d{2}-\d{2}-\d{2}\b/u },
  { label: "an issue or PR number", pattern: /(?<![\w&/#])#\d+\b/u },
  { label: '"used to"', pattern: /(?<!\b(?:is|are|be|been|being|get|gets|got)\s)\bused to\b/iu },
  { label: '"retired"', pattern: /\bretired\b/iu },
];

/** The banned house words (`.claude/rules/writing.md` rule 4). A word the `AGENTS.md` glossary defines is
 *  allowed, so the glossary, not this list, decides what counts as house vocabulary. */
export const BANNED_INSTRUCTION_WORDS: readonly string[] = ["load-bearing", "belt", "fence", "arm", "lens", "receipt", "rung"];

function blank(text: string): string {
  return text.replace(/[^\n]/gu, " ");
}

/** The file with every non-prose region blanked in place. Line numbers survive. */
export function proseOnly(source: string): string {
  const out: string[] = [];
  let inFence = false;
  let inOwnerVoice = false;
  for (const line of source.split("\n")) {
    if (line.includes(OWNER_VOICE_OPEN)) {
      inOwnerVoice = true;
    }
    if (inOwnerVoice) {
      if (line.includes(OWNER_VOICE_CLOSE)) {
        inOwnerVoice = false;
      }
      out.push(blank(line));
      continue;
    }
    if (FENCE_PATTERN.test(line)) {
      inFence = !inFence;
      out.push(blank(line));
      continue;
    }
    out.push(inFence ? blank(line) : line.replace(INLINE_CODE_PATTERN, (match) => blank(match)));
  }
  return out.join("\n");
}

/** The words the `AGENTS.md` "Glossary" table defines, lowercased. */
export function glossaryWords(claudeSource: string): ReadonlySet<string> {
  const words = new Set<string>();
  const start = claudeSource.search(/^## Glossary\s*$/mu);
  if (start < 0) {
    return words;
  }
  const section = claudeSource.slice(start).split("\n").slice(1);
  for (const line of section) {
    if (line.startsWith("## ")) {
      break;
    }
    const cell = /^\|\s*([^|]+?)\s*\|/u.exec(line)?.[1];
    if (cell !== undefined && cell !== "Word" && !/^-+$/u.test(cell)) {
      words.add(cell.toLowerCase());
    }
  }
  return words;
}

function wordPattern(word: string): RegExp {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`\\b${escaped}(?:s|es)?\\b`, "iu");
}

/** Every history marker and banned word in the prose of one file, as `path:line: what` strings. */
export function proseFindings(relPath: string, source: string, allowed: ReadonlySet<string>): readonly string[] {
  const banned = BANNED_INSTRUCTION_WORDS.filter((word) => !allowed.has(word)).map((word) => ({
    label: `banned word "${word}"`,
    pattern: wordPattern(word),
  }));
  const rules = [...HISTORY_RULES, ...banned];
  const findings: string[] = [];
  proseOnly(source)
    .split("\n")
    .forEach((line, index) => {
      for (const rule of rules) {
        const match = rule.pattern.exec(line);
        if (match !== null) {
          findings.push(`${relPath}:${index + 1}: ${rule.label} ("${match[0].trim()}")`);
        }
      }
    });
  return findings;
}

/** Relative markdown link targets (no scheme, no pure anchor), with any `#anchor` removed. */
export function markdownLinkTargets(source: string): readonly { readonly line: number; readonly target: string }[] {
  const targets: { line: number; target: string }[] = [];
  const masked = proseOnly(source).split("\n");
  masked.forEach((line, index) => {
    for (const match of line.matchAll(MARKDOWN_LINK_PATTERN)) {
      const raw = match[1] ?? "";
      if (raw.startsWith("#") || /^[a-z][a-z0-9+.-]*:/iu.test(raw)) {
        continue;
      }
      targets.push({ line: index + 1, target: raw.replace(/#.*$/u, "") });
    }
  });
  return targets;
}

/** Top-level directories whose backticked paths must exist. Other spans (commands, globs, runtime
 *  artifacts under `reports/`, relative module paths) are not repository paths. */
const REPO_PATH_ROOTS = ["packages/", "tooling/", "tests/", "docs/", "scripts/", ".claude/", ".codex/", ".agents/", ".github/"];
const NOT_A_PATH = /[\s*<>{}$?…|,;()[\]"'=]|\.\.\./u;

/** Backticked repository paths outside fenced blocks, with `:line` and `#anchor` suffixes removed. */
export function backtickedRepoPaths(source: string): readonly { readonly line: number; readonly path: string }[] {
  const paths: { line: number; path: string }[] = [];
  let inFence = false;
  source.split("\n").forEach((line, index) => {
    if (FENCE_PATTERN.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) {
      return;
    }
    for (const match of line.matchAll(INLINE_CODE_PATTERN)) {
      const span = (match[2] ?? "")
        .trim()
        .replace(/(?::\d+(?:[-,]\d+)*)+$/u, "")
        .replace(/#.*$/u, "");
      if (NOT_A_PATH.test(span) || !REPO_PATH_ROOTS.some((root) => span.startsWith(root))) {
        continue;
      }
      paths.push({ line: index + 1, path: span.replace(/\/$/u, "") });
    }
  });
  return paths;
}

/** Line count as an editor shows it: a trailing newline does not add a line. */
export function lineCount(source: string): number {
  if (source === "") {
    return 0;
  }
  return source.endsWith("\n") ? source.split("\n").length - 1 : source.split("\n").length;
}
