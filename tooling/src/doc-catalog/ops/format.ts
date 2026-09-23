// The docs formatter — the ONE writer of markdown style for the LIVING doc corpus (scope below).
// Law: docs/architecture/core/Core-Docs-Formatting-Law.md. The point: the architecture docs are read by
// AGENTS, not humans — alignment-padded GFM tables (cells padded with dozens-to-hundreds of spaces so
// pipes line up) are pure token waste. This emits COMPACT tables (single space around cell content,
// `| - |` delimiter rows, no pipe alignment), passes YAML frontmatter through verbatim, and preserves
// existing prose line breaks (no reflow — see the law doc).
//
// WIDENING STATUS (#2144, owner ruling — widen CHECK AND FORMAT to all tracked markdown, CLASS BY CLASS,
// each class its own reviewed diff so conventions are honoured rather than flattened): class 1 =
// `.claude/rules` + `.claude/agents` (#2161, landed); class 2 = `.claude/skills/**` + `tooling/**`
// (below); class 3 = the tracked markdown at the REPO ROOT (#2173, below) — the entry points every
// session loads, admitted by PATH so a third root file could not be missed by an enumeration.
// Every class is partitioned by AUTHORSHIP first, and the partition has FOUR questions, not three:
// hand-authored · vendored · generated · and IS THIS FILE A SOURCE FOR A GENERATOR. The fourth was paid
// for: `.claude/agents/*.md` is hand-authored AND the input `agents:sync` derives `.codex/agents/*.toml`
// from, so class 1's reformat left those mirrors stale and the REGISTERED `check:agents` stage red until
// it was repaired. Formatting a file something else DERIVES FROM is a coupled-site change.
//
// THE DEFAULT SCOPE IS THE LIVING DOC CORPUS, AND IT IS ONE POPULATION SERVING BOTH DOORS (#2059).
// `--check` (`pnpm check:docs`) and `--write` (`pnpm format:docs`) both resolve through `formatTargets`, so
// a tree missing here is missing from BOTH: it is neither checked nor formattable, and `pnpm format:docs`
// silently declines to touch it. That was the defect — the scope was `docs/architecture/**` alone, so
// `docs/design/**` and `docs/reviews/**` (the program guides and every review/ledger a lane writes) were
// outside both doors while reading exactly like docs the formatter owned.
//
// WHICH TREES, AND WHY THE TWO EXCLUSIONS ARE NOT LAZINESS:
//   · `docs/architecture/**` minus `proposed/` — in-flight drafts are never auto-touched (unchanged);
//   · `docs/design/**` and `docs/reviews/**` — LIVING law and live review output, written by lanes daily;
//   · NOT `docs/vendor/**` — vendored UPSTREAM bytes. Reformatting them would silently fork a copy we
//     re-sync, and the diff would be ours, not theirs;
//   · NOT the FROZEN archaeology trees — and there are TWO, which is the correction (owner ruling via
//     claude-b, 2026-09-12). `docs/history/**` (558) is excluded by omission, but
//     `docs/architecture/history/**` (70) nests INSIDE a living tree, so prefix-matching had admitted it
//     while this header claimed otherwise. Both now live in ONE named list, `FROZEN_TREES`, enforced at
//     BOTH doors. Documentation-Law §"Relocation & retirement": a frozen doc is a record of what was
//     written then, and reformatting it edits history to no reader's benefit.
// Measured 2026-09-12: those exclusions are 211 of the 349 unformatted files outside the old scope, and
// the archaeology correction takes the barrier's pending reformat from 215 files to ~145.
//
// The corpus is TRACKED files, the same source of truth the catalog uses (`ops/tree.ts#trackedDocs`) — an
// untracked draft is not a document, and a glob would sweep one in.
//
// THREE FIDELITY LAWS, ENFORCED AT `formatMarkdown` BELOW — the judgements live in `lib/format-fidelity.ts`
// (#2067, #2068, #2235). A formatter that is merely
// render-preserving is not enough for THIS corpus: the docs are law, agents enforce law by GREPPING it,
// and `pnpm format:docs` runs over the whole living tree unattended.
//   1. SEARCH FIDELITY (#2068) — a format must not change which literals the corpus contains. Measured
//      on the pre-widening tree (`91d9a2ab7^`): one pass added 369 backslash escapes, and 25 distinct
//      snake_case identifiers LOST grep hits (`NOT_FOUND` 6 → 0 as `NOT\_FOUND`). `dropInertEscapes`
//      below removes the escapes CommonMark provably cannot need; the predicate is stated there.
//   2. RENDER FIDELITY (#2067) — remark's own round trip is NOT total. Measured on the same tree: 10 of
//      350 files re-parse to a DIFFERENT tree after one pass, the destructive shape being a GFM table
//      whose body rows carry more cells than its header row (an unescaped `|` inside a code span inside
//      a cell is how they get there) — serialization sizes the delimiter row to the widest row and the
//      table GAINS columns. So every write is verified by re-parsing: a file whose tree moves is NOT
//      written and is REPORTED (`refused`), because silently rewriting what a law doc renders as is the
//      worst thing this tool could do. Fixing such a file is an authoring fix, never a formatter fix.
//   3. SOURCE FIDELITY (#2235) — the two laws above BOTH judge the render, and a loss that happened at
//      PARSE time is invisible to them by construction: they compare the damage to itself. The measured
//      instance is a code span split by a bare `|` inside a table cell, which comes back as literal
//      escaped backticks at exit 0 with no refusal at all. `escapeDeltaRefusal` (lib/format-fidelity.ts) is the third
//      comparison, and the only one whose right-hand side is the SOURCE BYTES.
import { readFileSync, writeFileSync } from "node:fs";
import { remark } from "remark";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import { REPO_ROOT } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { execNicedSync } from "../../_shared/proc.ts";
import type { MarkdownNode } from "../lib/format-fidelity.ts";
import { ambiguousTemplateLiteralRefusal, escapeDeltaRefusal, fidelityKey, overflowRefusal } from "../lib/format-fidelity.ts";

refuseDirectInvocation(import.meta.url, "pnpm check:docs (node tooling/src/doc-catalog/cli.ts <verb>)");

/** The LIVING trees this formatter owns. Prefix-matched against repo-relative tracked paths. */
const LIVING_TREES = ["docs/architecture/", "docs/design/", "docs/reviews/"] as const;
/** In-flight drafts inside a living tree — never auto-touched. `docs/vendor/**` is excluded by simply
 *  not being a living tree; the FROZEN trees need their own list, below, because one of them nests
 *  INSIDE a living tree and so cannot be excluded by omission. */
const EXCLUDED = /^docs\/architecture\/proposed\//u;

/**
 * THE FROZEN ARCHAEOLOGY TREES — ONE named list, because there are TWO of them and the second hides
 * (owner ruling via claude-b, 2026-09-12; found by this lane while measuring the barrier's blast radius).
 *
 * `docs/history/**` (558 files) is excluded by omission — it is not a living tree. But
 * `docs/architecture/history/**` (70 files) sits INSIDE `docs/architecture/`, so prefix-matching admitted
 * it, and the header claimed frozen archaeology was excluded while 70 frozen files were in the
 * population. That is the shape the list exists to prevent: the next tree someone freezes has one
 * obvious home and cannot be added to one door while being forgotten in the other.
 *
 * BOTH DOORS, and this is the half that is easy to get wrong: a frozen file is excluded from being
 * REWRITTEN and from being JUDGED. The width and fidelity guards do not run on it either — a check that
 * reds forever on a file nobody may edit is not a check, it is a permanent false alarm. So the fence
 * lives in `formatDocs` as well as in the population, which is what makes it hold for a file named
 * EXPLICITLY on the command line rather than resolved from the default set.
 *
 * The #2144 widening covers LIVING trees only. A frozen doc is a record of what was written then;
 * reformatting it edits history to no reader's benefit (Documentation-Law §"Relocation & retirement").
 */
const FROZEN_TREES = ["docs/history/", "docs/architecture/history/"] as const;

/** True for a tracked path inside a frozen archaeology tree: never formatted, never judged. */
function isFrozenDoc(path: string): boolean {
  return FROZEN_TREES.some((tree) => path.startsWith(tree));
}

/**
 * CLASS 1 of the population widening (#2161; owner ruling on #2144, 2026-09-12: widen CHECK AND FORMAT
 * to all tracked markdown, CLASS BY CLASS, each class its own reviewed diff so conventions are honoured
 * rather than flattened). These are the instruction files every lane auto-loads and every dispatch
 * reads, and they sat outside BOTH doors — neither checked nor formattable — while reading exactly like
 * documents this tool owned. They are the highest-read-count markdown in the repo, so a lost character
 * here degrades every future dispatch silently and nothing would notice.
 *
 * ONE DOOR, NOT TWO: this widens the FORMAT population only. The CATALOG population is a separate
 * derivation (`ops/tree.ts#trackedDocs`, pathspec `docs`), so these files are admitted to formatting and
 * remain OUTSIDE the catalog — which is the correct answer to their frontmatter, because an agent file
 * carries the `agent-authoring` 17-field schema and the catalog would demand `kind`/`status`/`updated`
 * of it. No exemption row is needed for that; the two doors simply do not share a population. Their YAML
 * frontmatter passes through verbatim either way (`remarkFrontmatter`), so the schema is never rewritten.
 *
 * Matched at DEPTH ONE only: a nested directory under these roots is a different class, and this row is
 * scoped to the two flat sets. Classes 2-4 (skills, `tooling/**`, the root constitution files) are
 * separate rows by the same ruling.
 */
const INSTRUCTION_DIRS = [".claude/rules/", ".claude/agents/"] as const;

/** True for a tracked path directly inside one of the class-1 directories (no nested files). */
function isInstructionFile(path: string): boolean {
  return INSTRUCTION_DIRS.some((dir) => path.startsWith(dir) && !path.slice(dir.length).includes("/"));
}

/**
 * CLASS 2 of the widening (#2144): the SKILLS a role loads on demand, and the `tooling/` guides the
 * constitution cites as law (`tooling/src/verify/gates/GATE-AUTHORING.md`, `tooling/src/ui-audit/ops/walker/RULE-AUTHORING.md`, `tooling/src/verify/gates/TS-MORPH-CAPABILITIES.md`).
 * Recursive, unlike class 1 — both trees nest `reference/` material that is read exactly like its parent.
 *
 * TWO EXCLUSIONS, AND NEITHER IS LAZINESS — both are the `docs/vendor/**` rule applied to a new tree:
 * bytes this repo does not AUTHOR are not this formatter's to restyle.
 */
const CLASS_2_TREES = [".claude/skills/", "tooling/"] as const;

/**
 * VENDORED: the pinned DevTools frontend closure. Its bytes are upstream AND hash-validated — the
 * `devtools-frontend-assets` gate reds with "hash/size mismatch" the moment a manifest member's bytes
 * change, so formatting a markdown file in there would break a gate rather than tidy a doc. Measured
 * 2026-09-12: exactly one `.md` under it (`…/panels/whats_new/resources/WNDT.md`), currently canonical
 * by luck, which is precisely why the fence is a PATH rule and not a "it's clean today" observation.
 */
const VENDORED = /^tooling\/src\/snap\/lib\/devtools-frontend\//u;

/**
 * THE GENERATED INDEX IS ADMITTED, and the route there is the durable part (#2178, closing the #2144
 * widening). `.claude/skills/snap-driving/reference/flags.md` is DERIVED
 * (`verify/ops/gen/snap-flags-index.ts`) and ratcheted by `ledgers:fresh`, and it was fenced out of this
 * population because four of its 123 rows were not canonical — so `check:docs` and `check:ledgers-fresh`
 * could not both be green.
 *
 * TWO WAYS TO CLOSE THAT, AND ONLY ONE IS ALLOWED. Letting the generator emit what this formatter wants
 * was measured and REFUSED: `__orb` went 2 grep hits to 0 and `path[,path]` 2 to 0, in the document a lane
 * reads to LEARN the snap vocabulary, while `git grep -l '__orb'` on `main` is 255 tracked files. Escaping
 * is render-identical and grep-fatal; when a formatter's canonical form and a generated law file's
 * SEARCHABILITY conflict, the searchability wins. The fix went to the SOURCE instead — the four registry
 * summaries now carry CODE SPANS (`snap/ops/flags-metadata.ts`), inside which `_` and `[` are literal, so
 * the emitted markdown is canonical with no escaping at all and every grep hit survives.
 *
 * The property outlives this note: `tests/tooling/verify/ops/gen/snap-flags-index.test.ts` asserts the
 * derived index still CONTAINS those literals, so the refused arm cannot arrive later by accident.
 */
/** True for a tracked path this formatter owns under class 2. */
function isClass2File(path: string): boolean {
  return CLASS_2_TREES.some((tree) => path.startsWith(tree)) && !VENDORED.test(path);
}

/**
 * CLASS 3 (#2173): the tracked markdown at the REPO ROOT — the entry points every session loads
 * (`AGENTS.md`, `README.md`). A PATH rule, not an enumeration, so a new root file is owned from birth.
 *
 * A root entry point may carry an `@path` import line — a harness DIRECTIVE the loader resolves, not
 * prose. It survives a format byte-for-byte (it is an ordinary paragraph to CommonMark, and nothing in the
 * serializer escapes a leading `@`), and the family test proves that against a file made dirty ELSEWHERE.
 *
 * Root `AGENTS.md` is also read by `check:agents` (its rule list and line budget). Both stages accept the
 * same bytes because the file is hand-written canonical markdown; when a formatter and a generator
 * disagree about bytes, move the generator — an exclusion buys silence and costs coverage forever.
 */
const CLASS_3_ROOT = /^[^/]+\.md$/u;

/** True for the root entry-point markdown this formatter owns. */
function isClass3File(path: string): boolean {
  return CLASS_3_ROOT.test(path);
}

/** A character a CommonMark delimiter run may not treat as punctuation or whitespace. */
const WORD = /[\p{L}\p{N}]/u;

/** The character a READER sees at `index` — the escaped one when an escape starts there, else the byte. */
function visibleAt(text: string, index: number): string {
  if (text[index] === "\\" && index + 1 < text.length) {
    return text[index + 1] ?? "";
  }
  return text[index] ?? "";
}

/**
 * THE PREDICATE (#2068). `mdast-util-to-markdown`'s `safe()` escapes every character that COULD begin a
 * construct anywhere, ignoring the neighbours that decide whether it can begin one HERE. Two of those
 * escapes are provably inert in this corpus's serializer settings, and both land inside identifiers,
 * which is precisely what breaks a grep:
 *
 *   · `_` BETWEEN TWO WORD CHARACTERS. CommonMark §6.2: a `_` run that is both left- and right-flanking
 *     can open emphasis only when preceded by punctuation, so an intraword `_` can neither open nor
 *     close one. `NOT_FOUND` is text; `NOT\_FOUND` is the same text spelled so that nothing finds it.
 *   · `~` WITH NO `~` NEIGHBOUR. `singleTilde: false` (below) means only a `~~` run is strikethrough, so
 *     a lone tilde — `HEAD~1`, `<sha>~N` — is never a delimiter.
 *
 * Everything else keeps its escape: `[` depends on a matching `]` and on reference definitions anywhere
 * in the document, while hash, asterisk and backtick depend on block position. This is the PROVABLE set and
 * not the observed one. `fidelityKey` is the backstop either way.
 *
 * It runs in the `text` handler, so an inline-code or fenced-code value cannot reach it: a `\_` inside a
 * code span is a LITERAL backslash (`Core-Docs-Formatting-Law.md` §"Backslash escapes" documents exactly
 * that spelling) and removing it would be the lossy edit this function exists to prevent.
 *
 * `edge` is `info.before`/`info.after` — the output characters on either side of THIS node, which the
 * node's own value cannot show. Without them the first character of a text node has no left neighbour
 * and the rule misreads it: measured on `refutation-ledger-2026-09-12.md`, a `delete` node opening with
 * `\~110` un-escaped to `~110` directly after the `~~` the parent had just emitted, and `~~~110` re-parsed
 * as something else. That refusal is the reason this function takes an edge at all.
 */
function dropInertEscapes(serialized: string, edge: { readonly before: string; readonly after: string }): string {
  let out = "";
  let index = 0;
  while (index < serialized.length) {
    const char = serialized[index] ?? "";
    if (char !== "\\" || index + 1 >= serialized.length) {
      out += char;
      index += 1;
      continue;
    }
    const escaped = serialized[index + 1] ?? "";
    const before = out.at(-1) ?? edge.before.at(-1) ?? "";
    const after = index + 2 < serialized.length ? visibleAt(serialized, index + 2) : (edge.after.at(0) ?? "");
    const inert = (escaped === "_" && WORD.test(before) && WORD.test(after)) || (escaped === "~" && before !== "~" && after !== "~");
    out += inert ? escaped : `${char}${escaped}`;
    index += 2;
  }
  return out;
}

function isAdjacentTemplateEndpoint(node: MarkdownNode, parent: MarkdownNode | undefined): boolean {
  const children = parent?.children ?? [];
  const index = children.indexOf(node);
  const isTriple = (left: MarkdownNode | undefined, middle: MarkdownNode | undefined, right: MarkdownNode | undefined): boolean =>
    left?.type === "inlineCode" &&
    right?.type === "inlineCode" &&
    middle?.type === "text" &&
    typeof middle.value === "string" &&
    /^\$\{[^}\n]+\}$/u.test(middle.value);
  return isTriple(children[index], children[index + 1], children[index + 2]) || isTriple(children[index - 2], children[index - 1], children[index]);
}

const LineFeedCode = 10;
const CarriageReturnCode = 13;

const processor = remark()
  .use(remarkFrontmatter, ["yaml"])
  // singleTilde:false matches the render pipeline pin (ui markdown.tsx §11.6): `10~20°C` is prose, not
  // strikethrough. tablePipeAlign:false is the whole reason this formatter exists.
  .use(remarkGfm, { tableCellPadding: true, tablePipeAlign: false, singleTilde: false })
  .use({
    settings: {
      bullet: "-",
      emphasis: "*",
      strong: "*",
      fence: "`",
      rule: "-",
      handlers: {
        /** Remark normally chooses the shortest legal code delimiter. This is its installed inline-code
         * handler plus GFM's table escape, with one changed decision: the two actual endpoint nodes of an
         * accepted code / `${…}` / code triple keep a minimum two-tick delimiter. */
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: mirrors the installed upstream handler; splitting its stateful scan would obscure parity.
        inlineCode: (node, parent, state) => {
          const nodeValue: unknown = node.value;
          let value = typeof nodeValue === "string" ? nodeValue : "";
          let sequence = isAdjacentTemplateEndpoint(node, parent) ? "``" : "`";
          while (new RegExp(`(^|[^\`])${sequence}([^\`]|$)`, "u").test(value)) {
            sequence += "`";
          }
          if (/[^ \r\n]/u.test(value) && ((/^[ \r\n]/u.test(value) && /[ \r\n]$/u.test(value)) || /^`|`$/u.test(value))) {
            value = ` ${value} `;
          }
          for (const pattern of state.unsafe) {
            if (pattern.atBreak !== true) {
              continue;
            }
            const expression = state.compilePattern(pattern);
            let match = expression.exec(value);
            while (match !== null) {
              let position = match.index;
              if (value.charCodeAt(position) === LineFeedCode && value.charCodeAt(position - 1) === CarriageReturnCode) {
                position -= 1;
              }
              value = `${value.slice(0, position)} ${value.slice(match.index + 1)}`;
              match = expression.exec(value);
            }
          }
          const serialized = `${sequence}${value}${sequence}`;
          return state.stack.includes("tableCell") ? serialized.replaceAll("|", "\\|") : serialized;
        },
        text: (node, _parent, state, info) => dropInertEscapes(state.safe(node.value, info), info),
      },
    },
  });

/** A file the formatter declined to write, and the reason a reader can act on. */
export interface FormatRefusal {
  readonly file: string;
  readonly reason: string;
}

export interface FormatOutcome {
  readonly scanned: number;
  readonly dirty: readonly string[];
  /** Files the formatter declined to write — never written, always reported. */
  readonly refused: readonly FormatRefusal[];
}

/** Resolve the file set: explicit args win; otherwise every TRACKED `.md` in a living tree minus the
 *  in-flight drafts. ONE resolution for both doors — see the scope note in the header. */
export function formatTargets(explicit: readonly string[]): readonly string[] {
  if (explicit.length > 0) {
    return [...explicit];
  }
  return execNicedSync("git", ["ls-files", "-z", "--", "docs", ...INSTRUCTION_DIRS, ...CLASS_2_TREES, "*.md"], { cwd: REPO_ROOT })
    .split("\0")
    .filter(
      (path) =>
        path.endsWith(".md") &&
        !isFrozenDoc(path) &&
        ((LIVING_TREES.some((tree) => path.startsWith(tree)) && !EXCLUDED.test(path)) || isInstructionFile(path) || isClass2File(path) || isClass3File(path)),
    )
    .sort();
}

/** The formatted bytes for one document, plus the reason it must not be written (null = write it).
 *  EXPORTED so a test can hold the fidelity laws without going through the filesystem. */
export function formatMarkdown(input: string): { readonly output: string; readonly refusal: string | null } {
  const parsed = processor.parse(input);
  const ambiguousTemplate = ambiguousTemplateLiteralRefusal(parsed, input);
  if (ambiguousTemplate !== null) {
    return { output: input, refusal: ambiguousTemplate };
  }
  // Order matters: the overflow census is a SPECIFIC diagnosis of a defect the generic re-parse guard
  // would also catch, but would report only as "the tree moved". Name the cause when we know it.
  const overflow = overflowRefusal(parsed);
  if (overflow !== null) {
    return { output: input, refusal: overflow };
  }
  const output = String(processor.processSync(input));
  // Before the generic re-parse guard, for the same reason the overflow census runs before it: the
  // escape delta is a SPECIFIC diagnosis with a named site and a named repair. It is also the only one
  // of the three that compares against the SOURCE — the re-parse guard structurally cannot see a loss
  // that happened at parse time, so it would report this file as clean, not as "the tree moved".
  const escapes = escapeDeltaRefusal(input, output, parsed);
  if (escapes !== null) {
    return { output: input, refusal: escapes };
  }
  if (fidelityKey(processor.parse(output)) !== fidelityKey(parsed)) {
    return { output: input, refusal: "formatting it would re-parse to a DIFFERENT tree — repair the markdown, not the formatter" };
  }
  return { output, refusal: null };
}

/** Format the targets; `write` lands the formatted bytes, otherwise nothing is touched and the dirty
 *  list IS the verdict. A file whose formatted bytes would RENDER differently is refused rather than
 *  written, in both modes — see the two fidelity laws in the header. */
export function formatDocs(files: readonly string[], write: boolean): FormatOutcome {
  const dirty: string[] = [];
  const refused: FormatRefusal[] = [];
  for (const file of files) {
    // THE SECOND DOOR for the frozen fence. `formatTargets` already keeps archaeology out of the DEFAULT
    // population, but an explicit argument bypasses that resolution entirely, so the fence is repeated
    // here — before the read, which is what makes "never judged" true and not merely "never written".
    if (isFrozenDoc(file)) {
      continue;
    }
    const input = readFileSync(file, "utf8");
    const { output, refusal } = formatMarkdown(input);
    if (refusal !== null) {
      refused.push({ file, reason: refusal });
      continue;
    }
    if (output === input) {
      continue;
    }
    dirty.push(file);
    if (write) {
      writeFileSync(file, output);
    }
  }
  return { scanned: files.length, dirty, refused };
}
