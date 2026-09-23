// Gate: d-citation-integrity — the D-ledger (`docs/adr/`, one decision per `NNNN-<slug>.md`) is the ONE
// home for standing rulings, and code plus the core doc set cite one as a bare `D<n>`. Makes the
// ledger↔citation link physics: every bare `D<n>` resolves against the LIVE ADR tree — a member file
// carries that number, or the number falls inside the RESERVED RANGE this gate owns as data. A citation
// with neither is DANGLING. An id is read from a FILE NAME, never from prose, so a decision that names
// another number in its text cannot mint it.
//
// THE RESERVED RANGE, D79–D105. The numbers belong to main-era rulings that rolled back with the retro
// burn-down while the code obeying them survived; that code still cites D79, D80, D81, D82, D85, D86, D91,
// D93 and D99 with their original main-era meanings. A reserved number is re-minted with its ORIGINAL
// number and meaning when the domain it governs comes back (D86 is one: `docs/adr/0086-*.md`); a NEW
// ruling is never minted into the window (`pnpm doc new adr` skips it). The range lived in the legacy
// registry's own note until the ledger split; it is this gate's data now because the gate is its only
// reader that judges, and a range read from prose reds every reserved citation on a rephrase.
//
// FAMILY: `text-citation`, the shared reader `lib/text-cite-scan.ts#scanTextCitations`, with
// `pd-citation-integrity` and `dangling-doc-cite`.
//
// POPULATION PORT (legacy SHA `50088b39b`, verified byte-identical to HEAD at conversion) — AND THE HALF
// THAT NEVER RAN. The legacy `inScope` admitted `packages/**` `.ts`/`.tsx` OR `docs/law/**`
// `.md`, and filtered `project.getSourceFiles()`. That project is `_shared/ts-workspace.ts#harnessGlobs`,
// which globs `.ts`/`.tsx` ONLY, so **no Markdown file was ever a member and the entire core-doc arm was
// dead code**. The conversion RESTORES it through the door the contract minted for exactly this
// (`contract/resource-tree.ts`: the `docs` tree id exists "so those policies can ADMIT the paths whose
// text they then demand through `authoredText`"). The ADR tree is a citer as well as the ledger: a
// decision citing a number nothing minted is the same drift as code doing it.
// The TS half declares `@product`: the legacy predicate was `rel.startsWith("packages/")` and
// `harnessGlobs` globs `packages/*/src/**`. The shipped-package classification admits showcase and
// default-content without duplicate roots.
//
// `D<n>+` IS A RANGE ANNOUNCEMENT, NOT A CITATION, and this is a subject rule rather than an exemption
// table. Prose announcing the next unminted id ("Next free number is D165+") uses a trailing `+` to mean
// "this number and up", which is a statement about numbers that do not exist yet — the exact opposite of a
// citation of a ruling that should. `mustPass[3]` is the row that dies without the fence.
//
// AUTHORITY IS `hard`, AND THAT IS A MEASURED RUNTIME FACT RATHER THAN A PREFERENCE. A `D<n>` citation
// lives in a COMMENT or in doc prose, and `lib/ordinary-waiver.ts#locateFinding` refuses an ordinary
// finding whose token does not survive comment blanking — *"points into comment trivia rather than
// authored code"*. The legacy runtime did bind a line-adjacent `@orb-gate-ignore` to a comment-resident
// finding (`lib/pass.ts#findingSuppressedAt`); the final runtime structurally cannot. The loss is empty in
// practice: no `@orb-gate-ignore d-citation-integrity` marker existed at the conversion commit, so the
// marker reconciliation closes at 0 legacy = 0 waives = 0 dead. The three remedies the message names are
// all repairs, never exemptions.
//
// WHERE A BROKEN RESOURCE REFUSES — not here. A declared resource that comes back
// missing/empty/unresolved/malformed makes `resolveResourceDeclarations` (`lib/resource-declaration.ts`)
// THROW during the POPULATION phase and the receipt phase withholds every consumer, both before
// `create`/`evaluate` run (guide §3's acquisition-refusal rule, `docs/law/resource-policy-contract.md` §4). The ADR tree
// is a `ledger` and NOT a `documents` member because it is an IDENTITY: with it absent — or holding no
// decision at all — every judgment here is INVERTED rather than merely uncertain, so it must refuse the
// whole run (`contract/resource-document.ts`). The citer corpus is the other door on purpose — a corpus
// tolerates a refused member. The refusal pins are in
// `tests/tooling/verify/gates/text-citation-family.suite.test.ts`.
//
// A CITER DOC ADMITTED BY THE TREE AND NOT SERVED BY THE TEXT DOOR IS A TOOL ERROR, NOT A SKIP. Dropping
// it would be absence, and absence is exactly how a citation policy reports a clean corpus it never read.
// The one exception is `empty`: a file with no text has no citation to judge, which is a verdict rather
// than a hole (`mustPass[4]`). DECLARED LIMIT — no proof row can reach the THROW: `missing` cannot occur
// for a path the tree just listed, and a symlinked member refuses `authored-tree:docs` one phase EARLIER,
// at population resolution. The construction attempted was a `links` fixture pointing a core-doc member
// outside the fixture root; its measured outcome is the population-phase refusal pinned in the family
// test, which is why this is guide §6.1's structurally-unfalsifiable classification rather than a missing row.
import { defineGate } from "../contract/policy.ts";
import type { MarkdownDocument } from "../contract/resource-document.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";
import { scanTextCitations } from "../lib/text-cite-scan.ts";

/** The doc trees whose prose is judged: the core law set and the ADR tree itself. `history/**` is outside
 *  on purpose — archaeology legitimately cites dead and renumbered entries (`mustPass[5]`). */
const CITER_DOC_TREES = ["docs/law/", "docs/adr/"] as const;
/** The number an ADR file name carries (`0086-<slug>.md` → 86). The ledger door serves members only, so
 *  this reads the id; it does not judge the grammar. */
const ADR_ID_RE = /^(\d+)-/u;
/** The reserved window, inclusive (header). */
const RESERVED_RULINGS = { lo: 79, hi: 105 } as const;
/** A bare `D<n>` citation. The non-`P`/non-word/non-hyphen left boundary is the measured false-positive
 *  control: it excludes `PD-<n>` (the sibling namespace `pd-citation-integrity` owns) and any
 *  `<word>D<n>` substring while still matching `D79`, `(D79`, ` D79`, `,D79`. The trailing `(?!\+)` is
 *  the range-announcement fence (header). */
const CITE_RE = /(?<![A-Za-z0-9-])(D\d+)\b(?!\+)/gu;
const RESERVED_LABEL = `the reserved range D${String(RESERVED_RULINGS.lo)}–D${String(RESERVED_RULINGS.hi)}`;

const MESSAGE =
  "a bare D<n> ledger citation resolves to nothing — no docs/adr/NNNN-<slug>.md carries the number and it is not inside the reserved range. A dangling D-citation is drift a reader cannot distinguish from a real ruling. The decisions are indexed by docs/adr/README.md.";

interface Cite {
  readonly path: string;
  readonly token: string;
  readonly line: number;
  readonly column: number;
}

function mintedIds(documents: readonly MarkdownDocument[]): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const document of documents) {
    const id = ADR_ID_RE.exec(document.path.slice(document.path.lastIndexOf("/") + 1))?.[1];
    if (id !== undefined) {
      ids.add(`D${String(Number(id))}`);
    }
  }
  return ids;
}

function resolves(token: string, ids: ReadonlySet<string>): boolean {
  const number = Number(token.slice(1));
  return ids.has(token) || (number >= RESERVED_RULINGS.lo && number <= RESERVED_RULINGS.hi);
}

export const gate = defineGate({
  id: "d-citation-integrity",
  family: "text-citation",
  authority: "hard",
  severity: "error",
  population: "@product",
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [{ kind: "ledger", id: "d-ledger" }, { kind: "authored-tree", id: "docs" }, { kind: "authored-text" }],
  message: MESSAGE,
  fix: "mint the decision with `pnpm doc new adr <slug>`, fix the number to an existing decision, or drop the citation. A reserved-range number resolves as-is until it is re-minted.",
  create: (ctx) => {
    const cites: Cite[] = [];
    const collect = (path: string, text: string): void => {
      for (const hit of scanTextCitations(text, CITE_RE)) {
        cites.push({ path, token: hit.token, line: hit.line, column: hit.column });
      }
    };
    return {
      visitFile: (sourceFile) => collect(ctx.relativePath(sourceFile), sourceFile.getFullText()),
      evaluate: () => {
        const ledger = readyResourceValue(ctx.resources.ledger("d-ledger"));
        const ids = mintedIds(ledger.documents);
        const citerPaths = readyResourceValue(ctx.resources.authoredTree("docs"))
          .filter((entry) => entry.kind === "file" && entry.path.endsWith(".md") && CITER_DOC_TREES.some((tree) => entry.path.startsWith(tree)))
          .map((entry) => entry.path);
        const corpus = readyResourceValue(ctx.resources.authoredText(citerPaths));
        for (const refusal of corpus.refusals) {
          if (refusal.status !== "empty") {
            throw new Error(`citer doc ${refusal.path} was admitted by the docs tree and refused by the text door (${refusal.status}): ${refusal.reason}`);
          }
        }
        for (const file of corpus.files) {
          collect(file.path, file.text);
        }
        for (const cite of cites) {
          if (!resolves(cite.token, ids)) {
            ctx.report.file(cite.path, {
              line: cite.line,
              column: cite.column,
              token: cite.token,
              message: `${cite.token} cites a D-ledger decision no docs/adr/ file carries, outside ${RESERVED_LABEL} — mint the decision, fix the number, or drop the citation (docs/adr/README.md).`,
            });
          }
        }
        // A receipt states what the run MEASURED, never what it FOUND (guide §3): the ledger
        // documents read and the citer docs served. A census can legitimately be zero, and a zero receipt
        // is a REFUSAL (`lib/policy-pass.ts` receiptFailures, `count === 0`).
        ctx.receipt({ kind: "population", source: "d-ledger-documents", members: ledger.documents.length });
        ctx.receipt({ kind: "population", source: "citer-docs", members: corpus.files.length });
      },
    };
  },
  mustFlag: [
    {
      mode: "resource",
      files: {
        "docs/adr/0001-an-entry.md": "# An entry\n",
        "packages/contracts/src/x.ts": "// per D999 — a dangling citation, no decision, above the ceiling.\nexport const x = 1;\n",
      },
      expect: { count: 1, line: 1, token: "D999" },
      why: "the founding F2 defect: a bare D999 no ADR file carries and above the reserved range, reported at the exact authored citation",
    },
    {
      mode: "resource",
      files: {
        "docs/adr/0001-an-entry.md": "# An entry\n",
        "docs/law/Some-Law.md": "---\nkind: law\n---\n\nThe ruling is D777, which nothing minted.\n",
        "packages/contracts/src/ok.ts": "// per D1 — minted.\nexport const x = 1;\n",
      },
      expect: { count: 1, line: 5, token: "D777" },
      why: "THE RESTORED ARM: a dangling citation in a CORE DOC. The legacy descriptor claimed this scope and could never reach it — Markdown is not in the ts-morph project — so this row is the successor proof for the half that never ran",
    },
    {
      mode: "resource",
      files: {
        "docs/adr/0001-an-entry.md": "# An entry\n",
        "docs/adr/0005-Not_A_Slug.md": "# D5 outside the slug grammar\n",
        "docs/adr/README.md": "| D5 | an index row |\n",
        "packages/contracts/src/x.ts": "// per D5 — no member file name carries it.\nexport const x = 1;\n",
      },
      expect: { count: 3, token: "D5" },
      why: "THE NARROWING ROW for the member grammar: only a `NNNN-<slug>.md` name (lowercase hyphenated slug) mints an id, so `0005-Not_A_Slug.md` mints nothing. Both non-members are still citers (the ADR tree is judged), so the code cite and the two prose cites are three findings; admit that name as a member and all three resolve",
    },
    {
      mode: "resource",
      files: {
        "docs/adr/0001-an-entry.md": "# An entry\n",
        "packages/contracts/src/x.ts": "// D106 is one past the reserved ceiling and has no decision.\nexport const x = 1;\n",
      },
      expect: { count: 1, token: "D106" },
      why: "the reserved range is INCLUSIVE and bounded — the first number past its ceiling is dangling, which is the boundary a `>= lo` test alone would get wrong",
    },
    {
      mode: "resource",
      files: {
        "docs/adr/0001-an-entry.md": "# An entry\n\n## Decision\n\nAmends main's **D777 = a rolled-back ruling**.\n",
        "packages/contracts/src/x.ts": "// per D777 — the number is named in a decision's PROSE, never minted as a file.\nexport const x = 1;\n",
      },
      expect: { count: 2, token: "D777" },
      why: "TWO findings on purpose — the ADR tree is itself a citer, so a decision's own prose mention is a citation too, and a `count: 1` here would be a row that had not read its own corpus. It is also the row that proves prose never mints: an id comes from a file name, so the bold D777 in the text resolves nothing",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: {
        // A directory whose NAME ends in `.md`. The tree walk lists it as a `directory` entry, and without
        // the `entry.kind === "file"` fence it is demanded as TEXT — the reader refuses (EISDIR) and the
        // policy's own refusal turns the run into a tool error rather than a verdict.
        "docs/adr/0001-an-entry.md": "# An entry\n",
        "docs/law/weird.md/inner.md": "no citation here.\n",
        "packages/contracts/src/ok.ts": "// per D1 — minted.\nexport const x = 1;\n",
      },
      why: 'THE NARROWING ROW for `entry.kind === "file"` in the citer filter, recorded as UNFALSIFIABLE by an earlier draft and falsified by a constructed fixture: a DIRECTORY named `*.md` exists the moment a fixture puts a file inside one',
    },
    {
      mode: "resource",
      files: {
        "docs/adr/0001-an-entry.md": "# An entry\n",
        "docs/adr/0066-a-padded-id.md": "# A padded id\n",
        "docs/adr/0164-a-later-decision.md": "# A later decision\n",
        "packages/contracts/src/y.ts":
          "// per D1, D66 and D164 (zero-padded file numbers), D99 (reserved), FLAG[PD-17] (sibling namespace).\nexport const y = 1;\n",
      },
      why: "zero-padded file numbers resolve to their bare ids, a reserved-range number resolves as-is, and the non-`P` left boundary keeps PD-17 out; drop the lookbehind and `D-17` reds",
    },
    {
      mode: "resource",
      files: {
        "docs/adr/0001-an-entry.md": "# An entry\n",
        "packages/contracts/src/z.ts": "// ADD777 and a hyphenated X-D777 are substrings, not citations.\nexport const z = 1;\n",
      },
      why: "THE NARROWING ROW for the left boundary: drop the lookbehind and `ADD777`/`X-D777` read as dangling citations. The numbers are deliberately UNMINTED — an earlier draft used `D1`, which resolves, so the row passed with the fence cut and discriminated nothing",
    },
    {
      mode: "resource",
      files: {
        "docs/adr/0001-an-entry.md": "# An entry\n\nThe next free number is D165+.\n",
        "packages/contracts/src/ok.ts": "// per D1 — minted.\nexport const x = 1;\n",
      },
      why: "THE NARROWING ROW for the range-announcement fence: `D165+` announces the next UNMINTED id, so it must not dangle on its own bookkeeping. Drop `(?!\\+)` and this row reds",
    },
    {
      mode: "resource",
      files: {
        "docs/adr/0001-an-entry.md": "# An entry\n",
        "docs/law/Empty-Doc.md": "",
        "packages/contracts/src/ok.ts": "// per D1 — minted.\nexport const x = 1;\n",
      },
      why: "an EMPTY citer doc is a verdict, not a hole: the text door refuses it as `empty`, it carries no citation to judge, and the policy must not turn that into the tool error it raises for every OTHER refusal status",
    },
    {
      mode: "resource",
      files: {
        "docs/adr/0001-an-entry.md": "# An entry\n",
        "docs/architecture/history/Archaeology.md": "---\nkind: history\n---\n\nMain-era D777 and D888 are cited here as archaeology.\n",
        "packages/contracts/src/ok.ts": "// per D1 — minted.\nexport const x = 1;\n",
      },
      why: "THE NARROWING ROW for the citer-tree prefixes: `history/**` legitimately cites dead and renumbered entries, so widening the corpus filter to the whole docs tree reds this row",
    },
  ],
});
