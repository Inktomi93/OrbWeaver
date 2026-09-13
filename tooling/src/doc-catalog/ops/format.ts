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
// THREE FIDELITY LAWS, ALL ENFORCED IN THIS FILE (#2067, #2068, #2235). A formatter that is merely
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
//      escaped backticks at exit 0 with no refusal at all. `escapeDeltaRefusal` below is the third
//      comparison, and the only one whose right-hand side is the SOURCE BYTES.
import { readFileSync, writeFileSync } from "node:fs";
import { remark } from "remark";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import { REPO_ROOT } from "../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { execNicedSync } from "../../_shared/proc.ts";

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
 * constitution cites as law (`GATE-AUTHORING.md`, `RULE-AUTHORING.md`, `TS-MORPH-CAPABILITIES.md`).
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
 * CLASS 3 (#2173): the tracked markdown at the REPO ROOT — the entry points every session loads. A PATH
 * rule, not an enumeration: the row named `CLAUDE.md` and `AGENTS.md`, but `README.md` is a third root
 * file matching the row's own description ("the last tracked hand-authored markdown outside `docs/`"),
 * and enumerating would have missed it exactly the way omission missed the second archaeology tree.
 *
 * `CLAUDE.md` opens with `@docs/architecture/core/AGENTS.md` — a harness DIRECTIVE the loader resolves,
 * not prose. It survives a format byte-for-byte (it is an ordinary paragraph to CommonMark, and nothing
 * in the serializer escapes a leading `@`), and the family test proves that against a file made dirty
 * ELSEWHERE rather than against today's happens-to-be-clean bytes.
 */
const CLASS_3_ROOT = /^[^/]+\.md$/u;

/**
 * ROOT `AGENTS.md` IS ADMITTED, and getting there is the point worth recording (#2173 follow-up).
 *
 * It was fenced out of this population because its lines 1-37 are a GENERATED BLOCK written by
 * `pnpm agents:sync`, whose array emitted no blank line at either marker seam — precisely the two blanks
 * this formatter inserts. Both sides are enforced stages (`check:docs` here; `check:agents` via
 * `sync.ts` → `package.json` → `verify/lib/registry.ts`), so the two could not be green in one tree and
 * the file's ~33 hand-authored lines went unchecked as the price.
 *
 * The fix was in the GENERATOR, not in a wider exclusion: `agent-sync/ops/sync.ts` now emits those two
 * blanks, so its output IS canonical markdown and the exclusion is gone rather than permanent. The rule
 * this leaves behind: when a formatter and a generator disagree about bytes, the generator is usually
 * the one that should move — an exclusion buys silence and costs coverage forever.
 */

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

/** The structural slice of an mdast node this comparison reads. `mdast`'s own types are a TRANSITIVE
 *  dependency of `remark`, not one `tooling/` declares, so the bare `mdast` specifier does not resolve. */
interface MarkdownPoint {
  readonly line?: number | undefined;
  readonly offset?: number | undefined;
}

interface MarkdownNode {
  readonly type: string;
  readonly value?: unknown;
  readonly children?: readonly MarkdownNode[];
  readonly position?: { readonly start?: MarkdownPoint | undefined; readonly end?: MarkdownPoint | undefined } | undefined;
}

/**
 * The comparison key for RENDER fidelity: the tree with source positions dropped, and with the TWO
 * differences that are true rendering equivalences normalized away.
 *
 *   · A LINE ENDING inside a `text` or `inlineCode` value. CommonMark renders a soft line break and a
 *     code-span line ending as a space, so a re-wrap there changes bytes and nothing else.
 *   · A SHORT TABLE ROW. GFM pads a row that carries fewer cells than its header, so a 2-cell row under a
 *     3-cell header already renders as three cells; the serializer writing the third one out changes
 *     bytes and nothing else. Modelling that here is what keeps the NARROW direction from reading as a
 *     render change — the direction rule in `overflowRefusal` and this padding are the same ruling seen
 *     from the write side and the compare side. Padding only, never truncation: an overflow row is
 *     refused before this runs, precisely because GFM DROPS that end instead of padding it.
 *
 * Every OTHER movement — a table gaining a cell, a code span swallowing its neighbour's whitespace, an
 * emphasis span changing extent — is a real render change and must refuse.
 */
function fidelityKey(tree: MarkdownNode): string {
  // JSON, not a delimiter-joined string: a separator character cheap enough to type is also a character
  // a doc can contain, and this comparison decides whether bytes get written.
  const parts: unknown[] = [];
  const walk = (node: MarkdownNode, padTo: number): void => {
    const value = typeof node.value === "string" ? node.value : "";
    const rendered = node.type === "text" || node.type === "inlineCode" ? value.replaceAll(/\r?\n/gu, " ") : value;
    parts.push([node.type, rendered]);
    const children = node.children ?? [];
    const rowWidth = node.type === "table" ? (children[0]?.children ?? []).length : 0;
    for (const child of children) {
      walk(child, rowWidth);
    }
    for (let missing = children.length; missing < padTo; missing += 1) {
      parts.push(["tableCell", ""], "/");
    }
    parts.push("/");
  };
  walk(tree, 0);
  return JSON.stringify(parts);
}

/** The flat text of a node, for the occupancy census (cells hold inline trees, not strings). */
function flatten(node: MarkdownNode): string {
  if (typeof node.value === "string") {
    return node.value;
  }
  return (node.children ?? []).map(flatten).join("");
}

function tablesOf(tree: MarkdownNode): readonly MarkdownNode[] {
  const found: MarkdownNode[] = [];
  const walk = (node: MarkdownNode): void => {
    if (node.type === "table") {
      found.push(node);
    }
    for (const child of node.children ?? []) {
      walk(child);
    }
  };
  walk(tree);
  return found;
}

/**
 * THE OVERFLOW-ROW REFUSAL (#2104). A GFM body row with MORE cells than its header row does not render
 * wide — the renderer DISCARDS the overflow, so that content is in the file, greppable, and invisible to
 * every reader. It is invisible to a rendered diff too, which is how it survives review.
 *
 * The formatter's untouched instinct is the worst possible answer: it sizes the delimiter row to the
 * WIDEST row, which widens the header, makes the dropped cells appear under a blank heading, and leaves
 * the table internally CONSISTENT — so no consistency check can ever see it again. Three law docs shipped
 * that way and one sat unread for months (#2067, repaired in #2104).
 *
 * DIRECTION IS THE WHOLE RULE, and only one direction is the defect. A row with FEWER cells than the
 * header is PADDED by GFM and renders exactly as written — never a finding. A row with MORE is dropped
 * content — always one.
 *
 * The message carries the per-column OCCUPANCY census, because the verdict alone is not actionable: a
 * column occupied by one row out of three hundred is a stray unescaped `|` in that row, while a column
 * occupied by several is genuinely dropped content that belongs somewhere. Those need opposite repairs.
 *
 * ITS CORPUS RECEIPT IS ZERO, DELIBERATELY. Measured 2026-09-12 over all 1106 tables in the living
 * corpus: 0 overflowing rows, and 0 rows in the harmless narrow direction either. This is a FORWARD
 * guard — the three live instances were repaired in #2104, and every older one was already NORMALIZED by
 * a past format run that widened its header, which is why a width check cannot see them (the roster
 * `Core-Enforcement-Active-Gates.md:74` is uniformly 7 wide, header and all 300 rows). The detector for
 * that residue is a TRAILING UNNAMED HEADER COLUMN, a separate arm with a 19-table blast radius that is
 * not this policy's to ship. So this arm's proof is a PLANTED control in its family test, never a corpus
 * count — a zero here means "nothing has gone wrong yet", never "I could not measure".
 */
function overflowRefusal(tree: MarkdownNode): string | null {
  const notes: string[] = [];
  for (const table of tablesOf(tree)) {
    const rows = table.children ?? [];
    const width = (rows[0]?.children ?? []).length;
    const overflowing = rows.slice(1).filter((row) => (row.children ?? []).length > width);
    if (overflowing.length === 0) {
      continue;
    }
    const widest = Math.max(...rows.map((row) => (row.children ?? []).length));
    const occupancy = Array.from(
      { length: widest },
      (_unused, column) => rows.slice(1).filter((row) => flatten((row.children ?? [])[column] ?? { type: "empty" }).trim() !== "").length,
    );
    notes.push(
      `table at line ${table.position?.start?.line ?? 0}: header declares ${width} column(s); ${overflowing.length} row(s) carry more, whose extra cells GFM DROPS (they render as nothing)`,
      ...overflowing.map((row) => `    line ${row.position?.start?.line ?? 0}: ${(row.children ?? []).length} cells vs header ${width}`),
      `    occupancy over ${rows.length - 1} body rows, by column: ${occupancy.join(" · ")} (a column occupied by ONE row is a stray unescaped \`|\` in that row; by several, it is content with no column)`,
    );
  }
  return notes.length > 0 ? notes.join("\n") : null;
}

/** Backticks in `text` that no backslash escapes — the spelling an author uses to OPEN a code span. */
function bareBacktickCount(text: string): number {
  let count = 0;
  let index = 0;
  while (index < text.length) {
    if (text[index] === "\\") {
      index += 2; // a backslash consumes the next character, whatever it is
      continue;
    }
    if (text[index] === "`") {
      count += 1;
    }
    index += 1;
  }
  return count;
}

/** Backticks the serializer wrote backslash-escaped — its spelling for a backtick that is LITERAL CONTENT. */
function escapedBacktickCount(text: string): number {
  let count = 0;
  let index = 0;
  while (index < text.length) {
    if (text[index] !== "\\") {
      index += 1;
      continue;
    }
    if (text[index + 1] === "`") {
      count += 1;
    }
    index += 2;
  }
  return count;
}

/**
 * Source lines whose `text` nodes carry a BARE backtick — the sites of the loss, read off the SOURCE.
 *
 * A backtick that reached a `text` node is a backtick CommonMark did not read as a delimiter: the span
 * the author wrote never formed. Reading it from the source slice rather than from the node VALUE is the
 * half that matters — a backtick the author already escaped also lands in a text node (with the escape
 * stripped from the value), and that one is a deliberate literal, not a lost span.
 */
function orphanBacktickLines(tree: MarkdownNode, source: string): readonly number[] {
  const lines = new Set<number>();
  const walk = (node: MarkdownNode): void => {
    if (node.type === "text" && typeof node.value === "string" && node.value.includes("`")) {
      const start = node.position?.start;
      const end = node.position?.end;
      const slice = start?.offset === undefined || end?.offset === undefined ? node.value : source.slice(start.offset, end.offset);
      if (bareBacktickCount(slice) > 0) {
        lines.add(start?.line ?? 0);
      }
    }
    for (const child of node.children ?? []) {
      walk(child);
    }
  };
  walk(tree);
  return [...lines].sort((a, b) => a - b);
}

/**
 * A JavaScript template literal cannot sit inside a single-backtick Markdown code span: its two inner
 * backticks close and reopen the Markdown span. Remark then sees two valid `inlineCode` nodes separated
 * by template content, so both the serialized bytes and the re-parsed tree are stable while the author's
 * intended outer span never exists. Detect that ambiguous source shape from the adjacent parsed nodes.
 * Source bytes cannot distinguish the malformed outer span from intentional adjacent code / template
 * substitution / code fragments, so the formatter conservatively refuses both and directs either author
 * to the unambiguous longer-delimiter spelling. The no-whitespace boundary keeps separated prose between
 * code spans valid.
 */
function ambiguousTemplateLiteralRefusal(tree: MarkdownNode, source: string): string | null {
  const lines = new Set<number>();
  const isSingleDelimitedCode = (node: MarkdownNode): boolean => {
    if (node.type !== "inlineCode") {
      return false;
    }
    const start = node.position?.start?.offset;
    const end = node.position?.end?.offset;
    if (start === undefined || end === undefined) {
      return false;
    }
    return /^`[^`\n]+`$/u.test(source.slice(start, end));
  };
  const ambiguousLine = (left: MarkdownNode | undefined, middle: MarkdownNode | undefined, right: MarkdownNode | undefined): number | undefined => {
    if (left === undefined || middle === undefined || right === undefined || !isSingleDelimitedCode(left) || !isSingleDelimitedCode(right)) {
      return;
    }
    const value = middle.type === "text" && typeof middle.value === "string" ? middle.value : "";
    const boundedByContent = value.length > 0 && !/^\s|\s$/u.test(value);
    return boundedByContent && /\$\{[^}\n]+\}/u.test(value) ? (left.position?.start?.line ?? 0) : undefined;
  };
  const walk = (node: MarkdownNode): void => {
    const children = node.children ?? [];
    for (let index = 0; index + 2 < children.length; index += 1) {
      const line = ambiguousLine(children[index], children[index + 1], children[index + 2]);
      if (line !== undefined) {
        lines.add(line);
      }
    }
    for (const child of children) {
      walk(child);
    }
  };
  walk(tree);
  return lines.size === 0
    ? null
    : [
        "single-backtick code delimiters contain a JavaScript template literal, so the inner backticks terminate the Markdown span (#2067)",
        ...[...lines]
          .toSorted((a, b) => a - b)
          .map((line) => `    line ${String(line)}: use longer backtick delimiters to make the intended span boundaries explicit`),
      ].join("\n");
}

/**
 * THE ESCAPE-DELTA REFUSAL (#2235). The formatter's worst failure mode is not a refusal it gets wrong —
 * it is a WRITE that looks like a cosmetic pass and is a silent content loss, because every later run
 * then launders the loss into "stable".
 *
 * THE SHAPE, measured: an author writes a code span inside a GFM table cell and the span contains a bare
 * `|`. The pipe is a CELL BOUNDARY before it is content, so the parse never forms the span — the
 * backticks land in `text` nodes as literal characters, split across the cells the pipe created. The
 * serializer, correctly for a literal backtick, escapes them: a cell reading (backtick) --theme (angle)
 * name | id | none (angle) (backtick) is written back with every one of those four characters
 * backslash-escaped. That is the exact byte shape #2145 was filed to repair on side-eye.md:170, and
 * `format --write` produced it at exit 0 with no refusal at all.
 *
 * WHY THE TWO STANDING GUARDS CANNOT SEE IT, and why the check could not be bolted onto either:
 *   · the overflow census (above) fires only when a body row out-widths its HEADER. In the measured
 *     instance the header was 5 wide and the split row was 5 wide, so there was nothing to count;
 *   · `fidelityKey` compares PARSE TREES, and the escape is render-identical. The loss had ALREADY
 *     happened at parse time, so a check against the render is a check against the damage — it can only
 *     ever agree with itself. THIS check therefore compares the output to the SOURCE BYTES, which is the
 *     one place the signal survives.
 *
 * THE PREDICATE, and it is a statable authoring contract rather than a heuristic: a backtick that was
 * BARE in the source and ESCAPED in the output is a code span the parse did not form. A backtick the
 * author genuinely means as literal content is written backslash-escaped in the SOURCE, whereupon the delta is zero
 * and the file formats normally — that is the second arm of the family test, and it is what stops this
 * being a blanket refusal.
 *
 * SCOPED TO BACKTICKS DELIBERATELY. The same run also escapes angle brackets, and folding those in was
 * REFUSED: an escape there has a real CommonMark justification (it can open an autolink or raw HTML), so
 * a delta there is not by itself evidence of a lost construct. A backtick has exactly one job.
 *
 * ITS CORPUS RECEIPT IS TWO, MEASURED, NOT ZERO (2026-09-12, over the 328-file living corpus at
 * `cf7e46d12`): 163 files would be rewritten by a `--write`, and exactly two of them would gain backtick
 * escapes — `docs/reviews/gate-runtime/v-fix-wave-4-2026-09-12.md` (+12) and
 * `refutation-ledger-2026-09-12.md` (+3). Both are the evidence documents carrying this defect, and both
 * were being silently cemented. So this arm has a real-tree positive AND the planted control beside it.
 */
function escapeDeltaRefusal(input: string, output: string, parsed: MarkdownNode): string | null {
  const delta = escapedBacktickCount(output) - escapedBacktickCount(input);
  if (delta <= 0) {
    return null;
  }
  const lines = orphanBacktickLines(parsed, input);
  return [
    `formatting it would escape ${String(delta)} backtick(s) that are BARE in the source — each one is a code span CommonMark did not form, and writing it back as a literal \\\` cements the loss (#2235)`,
    ...lines.map((line) => `    line ${String(line)}: a backtick reaching TEXT, not a code-span delimiter`),
    "    usual cause: a bare `|` inside a code span inside a table cell — the pipe ends the cell first, so the span never opens. Escape it as \\| inside the span.",
    "    if the backtick really is literal content, escape it in the SOURCE (\\`) and this stops firing.",
  ].join("\n");
}

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
