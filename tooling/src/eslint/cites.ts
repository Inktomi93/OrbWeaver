// The cite grammar `.claude/rules/comments.md` states: how a comment or a law file names a repo path, a decision, a pnpm
// script, a lint rule or a symbol, and the sentence shape that claims a checker enforces something. It is the one
// implementation: `tests/tooling/doc/comment-path-citations.repo.int.test.ts` resolves every cite it finds, and
// `orb/enforcement-claim-cites-checker` refuses a claim that carries none. This file finds cites; it never resolves one,
// because a lint rule cannot read the composed configs a rule id resolves against.

export const CITED_EXT = "(?:md|tsx?|[cm]?js|css|json|ya?ml|sh)";
// A repo-rooted path. The lookbehind keeps a URL's own segment and a relative path's tail out; the lookahead drops a
// directory or a glob, whose next character continues the path.
export const ROOTED = new RegExp(
  String.raw`(?<![\w./*@-])(?:docs|packages|tooling|tests|scripts|docker|\.claude|\.github)\/[\w./+@-]*\w\.${CITED_EXT}(?![\w*{/-])`,
  "gu",
);
// A repo-rooted directory, written with its trailing slash (`tests/server/infra/plugin-host/`): it cites the tracked
// files below it.
export const ROOTED_DIR = /(?<![\w./*@-])(?:docs|packages|tooling|tests|scripts|docker|\.claude|\.github)\/(?:[\w.+@-]+\/)*(?![\w*{-])/gu;
// An install or build output directory is gitignored by design, so naming one cites no tracked file.
const BUILD_OUTPUT = /(?:^|\/)(?:node_modules|dist)\//u;
// A relative path, resolved against the citing file.
export const RELATIVE = new RegExp(String.raw`(?<![\w./*@-])\.{1,2}\/[\w./+@-]*\w\.${CITED_EXT}(?![\w*{/-])`, "gu");
// A bare doc or source file name: the house idiom for citing one without its directory. It opens on a word character,
// so a `-model.ts` suffix pattern stays prose, and a `.d.ts` name is a package's published types, not a repo file.
export const BARE = /(?<![\w./*@-])[A-Za-z0-9_][\w-]*(?:\.[\w-]+)*(?:\.md|(?<!\.d)\.tsx?)(?![\w*{/-])/gu;
export const URL_RE = /\bhttps?:\/\/\S+/gu;
// A glob, brace, placeholder or elision is a prose pattern, never a literal cite.
export const NON_LITERAL = /[*{}<>…]|\.\.\.|NNNN/u;

// A decision is a bare `D<n>`. The left boundary keeps `PD-<n>` and a `2D` out; a trailing `+` announces a range of
// numbers not yet minted ("D165+"), which cites nothing.
export const DECISION = /(?<![A-Za-z0-9-])D(\d+)\b(?!\+)/gu;

// A pnpm command is a name the next characters do not continue into a word, a glob or a placeholder (`pnpm sdk:*`); a
// sentence stop after it is not part of it. In prose only a backticked span names one, so "pnpm and its workers" stays
// English.
export const PNPM_NAME = String.raw`([a-z](?:[\w:.-]*\w)?)(?![\w*<{]|[:.-][\w*<{])`;
export const SCRIPT = new RegExp(String.raw`\x60(?:\$ )?pnpm\s+${PNPM_NAME}[^\x60\n]*\x60`, "gu");
// A script named without `pnpm`, in the `<family>:<name>` spelling the tree writes (`check:boot-chunk`, `test:ct`), with
// or without backticks. Only a family a script name opens with counts, so `node:fs` and a URL scheme stay out.
const SCRIPT_FAMILY = "(?:biome|build|check|ci|depcruise|e2e|format|knip|lint|snap|surface|test|typecheck)";
export const SCRIPT_NAME = new RegExp(String.raw`(?<![\w/@.:-])(${SCRIPT_FAMILY}(?::[a-z0-9][\w-]*)+)(?![\w:/*<{-])`, "gu");
// A command that runs a whole suite or every check, so it names no one checker a claim could point at.
export const WHOLE_SUITE_SCRIPTS: ReadonlySet<string> = new Set(["test", "test:ct", "test:tools", "test:e2e", "e2e", "verify", "lint", "check"]);

// A namespaced lint rule id in backticks: `orb/closed-vocabulary`, `@typescript-eslint/no-deprecated`, and Biome's
// `lint/<group>/<rule>`. The same shape spells a directory (`domain/chat`), so the resolver keeps only a namespace the
// composed config loads.
export const RULE_ID = /\x60((?:@[a-z][\w-]*\/[a-z][\w-]*|[a-z][\w-]*\/[a-zA-Z][\w-]*)(?:\/[a-zA-Z][\w-]*)?)\x60/gu;
// The house namespace needs no backticks: `orb/` opens no path and no package (`@orb/` is the package scope). A
// backticked one is a `RULE_ID`.
export const ORB_RULE = /(?<![\w@/.\x60-])orb\/[a-z0-9]+(?:-[a-z0-9]+)*(?![\w/-])/gu;
// A Biome rule named alone, in backticks: every Biome rule opens with `no` or `use`.
export const BIOME_NAME = /\x60((?:no|use)[A-Z][A-Za-z0-9]*)\x60/gu;
// A checker named alone, in backticks: a dependency-cruiser rule, an ESLint rule without its namespace or a test file's
// stem. Each carries a hyphen, which keeps a bare word or an identifier out.
export const CHECK_NAME = /\x60([a-z0-9]+(?:-[a-z0-9]+)+)\x60/gu;

// A TSDoc link target: a symbol, a dotted member or a URL. A wrapped block comment can put the leading `*` before it.
export const LINK = /\{@link(?:code|plain)?\s+(?:\*\s+)?([^}\s|]+)/gu;

// ── enforcement claims ──────────────────────────────────────────────────────────────────────────────────────────────

// The checker nouns. `rule`, `gate`, `check` and `guard` are left out: product code uses them for automation rules,
// runtime gates and guards, so only a word that names tooling marks a claim.
// The claim patterns run on a sentence whose whitespace is folded to single spaces, so a word gap is one literal space.
// A noun and its verb agree in number, so a compound noun is no claim: "the CT pin" names a pin, "the CT pins" claims.
const ONE_CHECKER =
  "(?:test|CT|e2e(?: run)?|suite|lint(?: rule)?|ESLint(?: rule)?|Biome(?: rule)?|stylelint(?: rule)?|dependency-cruiser(?: rule)?|dep-cruiser|depcruise|knip|ratchet|typecheck|tsc)";
const MANY_CHECKERS = "(?:tests|CTs|suites|lint rules|ESLint rules|Biome rules|stylelint rules|dependency-cruiser rules|ratchets)";
const CHECKER = `(?:${MANY_CHECKERS}|${ONE_CHECKER})`;
const DETERMINER_WORDS = "a|an|the|its|our|this|that|these|those|their|one|each|every";
const DETERMINER = `(?:${DETERMINER_WORDS})`;
// A word that opens a clause or negates one cannot modify the checker noun: in "if the test fails" or "no lint rule
// refuses it" the noun is not the subject of a claim.
const FUNCTION_WORD = String.raw`(?:${DETERMINER_WORDS}|no|not|never|for|so|what|lets?|whether|until|before|after|when|if|unless|once|claims?|says?|states?|which|who)\b`;
// Up to three words between the determiner and the noun: "the integration test", "the corpus artifact CT".
const MODIFIERS = String.raw`(?:(?!${FUNCTION_WORD})[\w\x60/.:-]+ ){0,3}?`;
const BASE_VERB = "(?:hold|pin|enforce|refuse|reject|fail|red|catch|guard|assert|prove|lock|ban|bar|forbid|flag|cover|verify|police)";
const THIRD_PERSON_VERB =
  "(?:holds|pins|enforces|refuses|rejects|fails|reds|catches|guards|asserts|proves|locks|bans|bars|forbids|flags|covers|verifies|polices)";
// "also", "still" or "separately" before the verb, or "will" before its base form, keeps the claim.
const ADVERB = "(?:(?:also|still|separately) )?";
const ONE_VERB = `${ADVERB}(?:${THIRD_PERSON_VERB}|will ${BASE_VERB})`;
const MANY_VERB = `${ADVERB}(?:will )?${BASE_VERB}`;
// A verb whose clause ends on a stranded preposition, or that shares its object with a second verb, describes what a
// checker reads, not what it holds: "the item a test asserts on.", "values a test asserts or sends".
// "ESLint guards for how tests are authored" is a heading: "guards" followed by "for" or "that" is a noun.
const NOT_DESCRIBED = String.raw`\b(?! (?:on|against|about|with)(?:[.,;:)]|$))(?! (?:or|and) [a-z]+s\b)(?!(?<=guards) (?:for|that)\b)`;
const PASSIVE =
  "(?:enforced|pinned|held|guarded|caught|asserted|locked|covered|proven|proved|verified|refused|rejected|banned|barred|forbidden|flagged|policed|blocked)";
const TOOL = "(?:ESLint|Biome|stylelint|dependency-cruiser|dep-cruiser|depcruise|knip|typecheck|tsc)";
// A tool named as the subject takes a third-person verb; "ESLint guards" as a noun phrase is a heading, not a claim.
const TOOL_ACTIVE = "(?:refuses|rejects|bans|bars|forbids|flags|fails|reds|blocks|catches|enforces)";
// A purpose, a condition or reported speech names a checker without claiming one exists: "so a test can pin it", "if
// the test fails", "a comment that claims a test pins it".
const NOT_CLAIMED = String.raw`(?<!\b(?:for|so|what|lets?|whether|until|before|after|when|if|unless|once|claims?|says?|states?) )`;
// A denial or a hypothesis is no claim: "it cannot be pinned by a test", "it would be caught by the lint"; "will" states
// a claim. A hyphenated compound ("probe-verified") is an adjective, not a passive.
const NOT_ASSERTED = String.raw`(?<!\b(?:not|never|cannot|can't|can|could|would|should|must|may|might) be )(?<!-)`;
// The subject opens on a determiner, or stands bare at the start of the sentence: "Tests pin the order", "Lint refuses".
const SUBJECT_START = `(?:^|${NOT_CLAIMED}\\b${DETERMINER} )`;
// A claim states that a checker holds a fact: "a test pins the order", "refused by the lint", "dependency-cruiser bans
// the edge". "A test must pin it" is an instruction to the author, so a modal other than "will" is no claim. A
// relative clause ("suites that prove a boot step take the grant") describes a checker without claiming one exists.
const CLAIM = new RegExp(
  [
    `${SUBJECT_START}${MODIFIERS}${ONE_CHECKER} ${ONE_VERB}${NOT_DESCRIBED}`,
    `${SUBJECT_START}${MODIFIERS}${MANY_CHECKERS} ${MANY_VERB}${NOT_DESCRIBED}`,
    String.raw`${NOT_ASSERTED}\b${PASSIVE} (?:by|in) (?:${DETERMINER} )?${MODIFIERS}${CHECKER}\b`,
    String.raw`\b${TOOL} ${TOOL_ACTIVE}\b`,
    // A script named as the subject: "check:boot-chunk separately enforces the ceiling".
    String.raw`(?<![\w/@.:-])\x60?${SCRIPT_FAMILY}(?::[a-z0-9][\w-]*)+\x60? ${ONE_VERB}${NOT_DESCRIBED}`,
  ].join("|"),
  "iu",
);
// A claim about the file it sits in cites that file: "this test pins", "these tests hold".
const SELF_NOUN = String.raw`(?:[\w-]+ ){0,2}?(?:tests?|suites?|rules?|lint(?: rule)?|CTs?|files?|cases?)`;
const SELF = new RegExp(String.raw`\b(?:this|these) ${SELF_NOUN}\b`, "iu");
const CHECKER_SOURCE = /^(?:tests\/|tooling\/src\/eslint\/)|\.(?:test|spec|ct)\.[cm]?[jt]sx?$/u;
/** A test or a lint rule source, whose comments describe the checker they sit in. */
export const isCheckerSource = (path: string): boolean => CHECKER_SOURCE.test(path);
// Inside a test or a rule source, "the test" and "the rule" are the file itself.
// A qualified "the node suite" may name another file; "the hover-twin test above" names one in this file.
const SELF_IN_CHECKER = new RegExp(
  String.raw`\bthe (?:tests?|suites?|rules?|lint(?: rule)?|CTs?|cases?)\b|\b(?:this|these) ${SELF_NOUN}\b|\bthe ${SELF_NOUN} (?:above|below)\b`,
  "iu",
);
// A quoted sentence is an example or a message, not the comment's own claim.
const QUOTED = /"[^"\n]*"|“[^“”\n]*”/gu;
const COMMENT_MARKER = /^[ \t]*(?:\/{2,}|\/\*+|\*+\/?)/gmu;
// A sentence ends at a stop followed by space; a stop inside a path or a version (`a.ts`, `1.2`) has none.
const SENTENCE_END = /(?<=[.;!?])\s+/gu;

const CITE_KINDS = ["path", "directory", "decision", "script", "task", "rule", "biome", "name", "link"] as const;
export type CiteKind = (typeof CITE_KINDS)[number];

export interface Cite {
  readonly kind: CiteKind;
  readonly token: string;
}

const tokens = (text: string, pattern: RegExp, kind: CiteKind, group = 0): Cite[] =>
  [...text.matchAll(pattern)].flatMap((match) => {
    const token = match[group] ?? "";
    return token === "" || NON_LITERAL.test(token) || BUILD_OUTPUT.test(token) ? [] : [{ kind, token }];
  });

/** Every cite a piece of comment or law text carries, in the grammar's spellings. A path is returned as written; a
 *  relative path resolves against its file, which only the caller knows. */
export function citesIn(text: string): Cite[] {
  const line = text.replaceAll(URL_RE, " ");
  return [
    ...tokens(line, ROOTED, "path"),
    ...tokens(line, ROOTED_DIR, "directory"),
    ...tokens(line, RELATIVE, "path"),
    ...tokens(line, BARE, "path"),
    ...tokens(line, DECISION, "decision"),
    ...tokens(line, SCRIPT, "script", 1),
    ...tokens(line, SCRIPT_NAME, "task", 1),
    ...tokens(line, RULE_ID, "rule", 1),
    ...tokens(line, ORB_RULE, "rule"),
    ...tokens(line, BIOME_NAME, "biome", 1),
    ...tokens(line, CHECK_NAME, "name", 1),
    ...tokens(text, LINK, "link", 1),
  ];
}

// A file a checker lives in: a test, a lint rule source, or a native tool's config.
const CHECKER_FILE =
  /(?:^|\/)(?:tests\/|tooling\/src\/eslint\/|tooling\/src\/biome-config\/)|\.(?:test|spec|ct)(?:-d)?\.[cm]?[jt]sx?$|(?:^|\/)(?:eslint\.config\.ts|stylelint\.config\.ts|\.dependency-cruiser\.ts|knip\.ts)$/u;

/** Whether a cite points at one checker. A decision or a symbol names a ruling or code; a source file that is not a
 *  checker, and a command that runs a whole suite, name no checker a reader could open. */
function namesChecker({ kind, token }: Cite): boolean {
  switch (kind) {
    case "path":
    case "directory":
      return CHECKER_FILE.test(token);
    case "script":
    case "task":
      return !WHOLE_SUITE_SCRIPTS.has(token);
    case "rule":
    case "biome":
    case "name":
      return true;
    case "decision":
    case "link":
      return false;
  }
}

/** The cites in a sentence that point at one checker: a test or rule file, a single-check script, or a rule's name. */
export const checkerCites = (sentence: string): Cite[] => citesIn(sentence).filter(namesChecker);

/** One comment's text, markers included, and the 1-based line it starts on. */
export interface CommentSpan {
  readonly line: number;
  readonly text: string;
}

const LINE_COMMENT = "//";

/** Folds a run of `//` comments on consecutive lines into one span. A parser reports each `//` line as its own
 *  comment, so a sentence that wraps across lines would otherwise be read in halves. */
export function foldLineComments(spans: readonly CommentSpan[]): CommentSpan[] {
  const folded: CommentSpan[] = [];
  for (const span of spans.toSorted((left, right) => left.line - right.line)) {
    const last = folded.at(-1);
    const next = last === undefined ? 0 : last.line + last.text.split("\n").length;
    if (last !== undefined && span.line === next && last.text.startsWith(LINE_COMMENT) && span.text.startsWith(LINE_COMMENT)) {
      folded[folded.length - 1] = { line: last.line, text: `${last.text}\n${span.text}` };
    } else {
      folded.push(span);
    }
  }
  return folded;
}

export interface Claim {
  /** The sentence, with comment markers and line breaks folded to single spaces. */
  readonly sentence: string;
  /** The 0-based line of the comment the sentence starts on. */
  readonly line: number;
}

/** Every sentence in a comment's text that claims a checker enforces something and does not name the file it sits in.
 *  @param inChecker - the comment sits in a test or a rule source, where "the test" is that file. */
export function enforcementClaims(comment: string, inChecker: boolean): Claim[] {
  const self = inChecker ? SELF_IN_CHECKER : SELF;
  // Markers become spaces of the same length, so an offset in the folded text is an offset in the comment.
  const text = comment.replaceAll(COMMENT_MARKER, (marker) => " ".repeat(marker.length));
  const ends = [...text.matchAll(SENTENCE_END)].map(({ index, 0: gap }) => ({ index, next: index + gap.length }));
  const bounds = [{ index: 0, next: 0 }, ...ends, { index: text.length, next: text.length }];
  return bounds.slice(1).flatMap(({ index }, at) => {
    const raw = text.slice(bounds[at]?.next ?? 0, index);
    const sentence = raw.replaceAll(/\s+/gu, " ").trim();
    const stated = sentence.replaceAll(QUOTED, " ").replaceAll(/ {2,}/gu, " ");
    if (!CLAIM.test(stated) || self.test(stated)) {
      return [];
    }
    const start = index - raw.trimStart().length;
    return [{ sentence, line: text.slice(0, start).split("\n").length - 1 }];
  });
}
