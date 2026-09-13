// Gate: d-citation-integrity — the D-ledger (`Core-Path-Registry.md`) is the ONE home for standing
// rulings, and code plus the core doc set cite one as a bare `D<n>`. Makes the registry↔citation link
// physics: every bare `D<n>` resolves against the LIVE registry — it has an entry anchor
// `- **D<n>** —`, or it falls inside the RESERVED RANGE the registry's own note declares (main-era
// rulings that rolled back while the surviving code kept citing them). A citation with neither is
// DANGLING. Keyed off the registry's OWN anchors and its OWN note, never a hardcoded ceiling — that would
// be the path-keyed-gates-die-on-rename failure in number form.
//
// FAMILY: `text-citation`, the shared reader `lib/text-cite-scan.ts#scanTextCitations`, with
// `pd-citation-integrity` and `dangling-doc-cite`.
//
// POPULATION PORT (legacy SHA `50088b39b`, verified byte-identical to HEAD at conversion) — AND THE HALF
// THAT NEVER RAN. The legacy `inScope` admitted `packages/**` `.ts`/`.tsx` OR `docs/architecture/core/**`
// `.md`, and filtered `project.getSourceFiles()`. That project is `_shared/ts-workspace.ts#harnessGlobs`,
// which globs `.ts`/`.tsx` ONLY, so **no Markdown file was ever a member and the entire core-doc arm was
// dead code** — including the header claim that "the registry file itself IS scanned". The conversion
// RESTORES it through the door the contract minted for exactly this
// (`contract/resource-tree.ts`: the `docs` tree id exists "so those policies can ADMIT the paths whose
// text they then demand through `authoredText`"). Measured before landing: the restored arm finds ONE
// site over 36 core docs, and it is the registry's own `**Next free number is D161+.**` bookkeeping —
// fenced as a RANGE ANNOUNCEMENT below, not allowlisted. Live violations after the fence: 0 over both
// arms (3,387 package sources + 36 core docs; the same scan without the fence returns 1, which is the
// positive control that the scanner can fail).
// The TS half ports as `@packages` + `@showcase`: the legacy predicate was `rel.startsWith("packages/")`
// and `harnessGlobs` globs `packages/*/src/**`, which includes the showcase package that `@packages`
// deliberately does not.
//
// `D<n>+` IS A RANGE ANNOUNCEMENT, NOT A CITATION, and this is a subject rule rather than an exemption
// table. The registry's own prose announces the next unminted id ("Next free number is D161+", "reserved
// for a genuinely new ruling is D159+"): a trailing `+` means "this number and up", which is a statement
// about numbers that do not exist yet — the exact opposite of a citation of a ruling that should. Without
// the fence the registry dangles on its own bookkeeping the day a ruling is minted, forever. `mustPass[2]`
// is the row that dies without it.
//
// AUTHORITY IS `hard`, AND THAT IS A MEASURED RUNTIME FACT RATHER THAN A PREFERENCE. A `D<n>` citation
// lives in a COMMENT or in doc prose, and `lib/ordinary-waiver.ts#locateFinding` refuses an ordinary
// finding whose token does not survive comment blanking — *"points into comment trivia rather than
// authored code"* (measured 2026-09-12 on this family by running a comment-resident row under
// `authority: "ordinary"`). The legacy runtime did bind a line-adjacent `@orb-gate-ignore` to a
// comment-resident finding (`lib/pass.ts#findingSuppressedAt`); the final runtime structurally cannot.
// The loss is empty in practice: ZERO `@orb-gate-ignore d-citation-integrity` markers exist on the tree
// (measured repo-wide at the conversion commit), so the marker reconciliation closes at
// 0 legacy = 0 waives = 0 dead. The three remedies the message names are all repairs, never exemptions.
//
// WHERE A BROKEN RESOURCE REFUSES — not here. A declared resource that comes back
// missing/empty/unresolved/malformed makes `resolveResourceDeclarations` (`lib/resource-declaration.ts`)
// THROW during the POPULATION phase and the receipt phase withholds every consumer, both before
// `create`/`evaluate` run (guide §3's acquisition-refusal rule, `docs/design/resource-policy-contract.md` §4). The registry
// is a `ledger` and NOT a `documents` member because it is an IDENTITY: with it absent every judgment
// here is INVERTED rather than merely uncertain, so it must refuse the whole run
// (`contract/resource-document.ts`). The core-doc corpus is the other door on purpose — a corpus
// tolerates a refused member. The refusal pins are in
// `tests/tooling/verify/gates/text-citation-family.test.ts`.
//
// A CORE DOC ADMITTED BY THE TREE AND NOT SERVED BY THE TEXT DOOR IS A TOOL ERROR, NOT A SKIP. Dropping
// it would be absence, and absence is exactly how a citation policy reports a clean corpus it never read.
// The one exception is `empty`: a file with no text has no citation to judge, which is a verdict rather
// than a hole (`mustPass[3]`). DECLARED LIMIT — no proof row can reach the THROW: `missing` cannot occur
// for a path the tree just listed, and a symlinked member refuses `authored-tree:docs` one phase EARLIER,
// at population resolution. The construction attempted was a `links` fixture pointing a core-doc member
// outside the fixture root; its measured outcome is the population-phase refusal pinned in the family
// test, which is why this is guide §6.1's structurally-unfalsifiable classification rather than a missing row.
import { defineGate } from "../contract/policy.ts";
import type { MarkdownDocument } from "../contract/resource-document.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";
import { scanTextCitations } from "../lib/text-cite-scan.ts";

const CORE_DOCS = "docs/architecture/core/";
/** A registry ENTRY anchor. Both authored forms — `- **D66 — title.**` and `- **D67** — …` — end the
 *  digits on a `\b`, and the `^- ` prefix pins it to a list item so the reserved note's own prose can
 *  never register as an entry. */
const ANCHOR_RE = /^- \*\*D(\d+)\b/gmu;
/** The reserved-range note, machine-anchored on its own authored literal rather than on a hardcoded
 *  79..105 pair, so the range moves with the note. A rephrase reds every reserved citation LOUDLY, which
 *  is the intended failure: the reserved range is load-bearing and a silent drift is not acceptable. */
const RESERVED_RE = /\*\*RESERVED RANGE\s*[—-]\s*D(\d+)[–-]D(\d+)/u;
/** A bare `D<n>` citation. The non-`P`/non-word/non-hyphen left boundary is the measured false-positive
 *  control: it excludes `PD-<n>` (the sibling namespace `pd-citation-integrity` owns) and any
 *  `<word>D<n>` substring while still matching `D79`, `(D79`, ` D79`, `,D79`. The trailing `(?!\+)` is
 *  the range-announcement fence (header). */
const CITE_RE = /(?<![A-Za-z0-9-])(D\d+)\b(?!\+)/gu;

const MESSAGE =
  "a bare D<n> ledger citation resolves to nothing — it has no `- **D<n>** —` anchor in Core-Path-Registry.md and is not inside the reserved range. A dangling D-citation is drift a reader cannot distinguish from a real ruling. See Core-Path-Registry.md.";

interface Registry {
  readonly ids: ReadonlySet<string>;
  readonly reserved: { readonly lo: number; readonly hi: number } | undefined;
}

interface Cite {
  readonly path: string;
  readonly token: string;
  readonly line: number;
  readonly column: number;
}

function readRegistry(documents: readonly MarkdownDocument[]): Registry {
  const ids = new Set<string>();
  let reserved: { readonly lo: number; readonly hi: number } | undefined;
  for (const document of documents) {
    for (const match of document.text.matchAll(ANCHOR_RE)) {
      ids.add(`D${String(match[1])}`);
    }
    const note = RESERVED_RE.exec(document.text);
    if (reserved === undefined && note?.[1] !== undefined && note[2] !== undefined) {
      reserved = { lo: Number(note[1]), hi: Number(note[2]) };
    }
  }
  return { ids, reserved };
}

function resolves(token: string, registry: Registry): boolean {
  if (registry.ids.has(token)) {
    return true;
  }
  const number = Number(token.slice(1));
  return registry.reserved !== undefined && number >= registry.reserved.lo && number <= registry.reserved.hi;
}

function reservedLabel(registry: Registry): string {
  return registry.reserved === undefined
    ? "no reserved range is declared in the registry's own note"
    : `the reserved range D${String(registry.reserved.lo)}–D${String(registry.reserved.hi)}`;
}

export const gate = defineGate({
  id: "d-citation-integrity",
  family: "text-citation",
  authority: "hard",
  severity: "error",
  population: { in: ["@packages", "@showcase"] },
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [{ kind: "ledger", id: "core-path-registry" }, { kind: "authored-tree", id: "docs" }, { kind: "authored-text" }],
  message: MESSAGE,
  fix: "mint the entry in Core-Path-Registry.md (the registry states its own next free number), fix the number to an existing entry, or drop the citation. A reserved-range number resolves as-is until it is re-minted.",
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
        const ledger = readyResourceValue(ctx.resources.ledger("core-path-registry"));
        const registry = readRegistry(ledger.documents);
        const corePaths = readyResourceValue(ctx.resources.authoredTree("docs"))
          .filter((entry) => entry.kind === "file" && entry.path.startsWith(CORE_DOCS) && entry.path.endsWith(".md"))
          .map((entry) => entry.path);
        const corpus = readyResourceValue(ctx.resources.authoredText(corePaths));
        for (const refusal of corpus.refusals) {
          if (refusal.status !== "empty") {
            throw new Error(`core doc ${refusal.path} was admitted by the docs tree and refused by the text door (${refusal.status}): ${refusal.reason}`);
          }
        }
        for (const file of corpus.files) {
          collect(file.path, file.text);
        }
        for (const cite of cites) {
          if (!resolves(cite.token, registry)) {
            ctx.report.file(cite.path, {
              line: cite.line,
              column: cite.column,
              token: cite.token,
              message: `${cite.token} cites a D-ledger entry with no anchor and outside ${reservedLabel(registry)} — mint the entry, fix the number, or drop the citation. See Core-Path-Registry.md.`,
            });
          }
        }
        // A receipt states what the run MEASURED, never what it FOUND (guide §3): the ledger
        // documents read and the core docs served. A census can legitimately be zero, and a zero receipt
        // is a REFUSAL (`lib/policy-pass.ts` receiptFailures, `count === 0`) — a ledger with no anchors
        // would turn its own honest verdict into a tool error.
        ctx.receipt({ kind: "population", source: "d-ledger-documents", members: ledger.documents.length });
        ctx.receipt({ kind: "population", source: "core-doc-citers", members: corpus.files.length });
      },
    };
  },
  mustFlag: [
    {
      mode: "resource",
      files: {
        "docs/architecture/core/Core-Path-Registry.md": "- **D1** — an entry.\n> **RESERVED RANGE — D79–D105:** reserved for main-era rulings.\n",
        "packages/contracts/src/x.ts": "// per D999 — a dangling citation, no anchor, above the ceiling.\nexport const x = 1;\n",
      },
      expect: { count: 1, line: 1, token: "D999", messageIncludes: "outside the reserved range D79–D105" },
      why: "the founding F2 defect: a bare D999 with no registry anchor and above the reserved range, reported at the exact authored citation",
    },
    {
      mode: "resource",
      files: {
        "docs/architecture/core/Core-Path-Registry.md": "- **D1** — an entry.\n> **RESERVED RANGE — D79–D105:** reserved for main-era rulings.\n",
        "docs/architecture/core/Some-Law.md": "---\nkind: law\n---\n\nThe ruling is D777, which nothing minted.\n",
        "packages/contracts/src/ok.ts": "// per D1 — anchored.\nexport const x = 1;\n",
      },
      expect: { count: 1, line: 5, token: "D777", messageIncludes: "outside the reserved range D79–D105" },
      why: "THE RESTORED ARM: a dangling citation in a CORE DOC. The legacy descriptor claimed this scope and could never reach it — Markdown is not in the ts-morph project — so this row is the successor proof for the half that never ran",
    },
    {
      mode: "resource",
      files: {
        "docs/architecture/core/Core-Path-Registry.md": "- **D1** — an entry.\n> Nothing here declares a reserved range.\n",
        "packages/contracts/src/x.ts": "// per D99 — reserved on the real tree, unresolvable with no note.\nexport const x = 1;\n",
      },
      expect: { count: 1, token: "D99", messageIncludes: "no reserved range is declared" },
      why: "THE NARROWING ROW for keying the range off the registry's OWN note: with the note absent every reserved citation reds LOUDLY rather than resolving against a hardcoded 79..105 pair the registry no longer states",
    },
    {
      mode: "resource",
      files: {
        "docs/architecture/core/Core-Path-Registry.md": "- **D1** — an entry.\n> **RESERVED RANGE — D79–D105:** reserved for main-era rulings.\n",
        "packages/contracts/src/x.ts": "// D106 is one past the reserved ceiling and has no anchor.\nexport const x = 1;\n",
      },
      expect: { count: 1, token: "D106", messageIncludes: "outside the reserved range D79–D105" },
      why: "the reserved range is INCLUSIVE and bounded — the first number past its ceiling is dangling, which is the boundary a `>= lo` test alone would get wrong",
    },
    {
      mode: "resource",
      files: {
        "docs/architecture/core/Core-Path-Registry.md":
          "- **D1** — an entry.\n> **RESERVED RANGE — D79–D105:** reserved for main-era rulings, e.g. main's **D777 = a rolled-back ruling**.\n",
        "packages/contracts/src/x.ts": "// per D777 — the number is named in the registry's PROSE, never minted as an entry.\nexport const x = 1;\n",
      },
      expect: { count: 2, token: "D777", messageIncludes: "outside the reserved range D79–D105" },
      why: "TWO findings on purpose — the registry is itself a core doc, so its own prose mention is a citation too, and a `count: 1` here would be a row that had not read its own corpus. THE ROW THE `^- ` ANCHOR PIN TURNS GREEN WHEN CUT (§4.1's wrong-direction class — opening a fence makes this policy flag FEWER): the reserved note's own prose names D-numbers in bold, and without the list-item pin each one registers as a minted ENTRY and silently resolves every citation of it",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: {
        // A directory whose NAME ends in `.md`. The tree walk lists it as a `directory` entry, and without
        // the `entry.kind === "file"` fence it is demanded as TEXT — the reader refuses (EISDIR) and the
        // policy's own refusal turns the run into a tool error rather than a verdict.
        "docs/architecture/core/Core-Path-Registry.md": "- **D1** — an entry.\n> **RESERVED RANGE — D79–D105:** reserved for main-era rulings.\n",
        "docs/architecture/core/weird.md/inner.md": "no citation here.\n",
        "packages/contracts/src/ok.ts": "// per D1 — anchored.\nexport const x = 1;\n",
      },
      why: 'THE NARROWING ROW for `entry.kind === "file"` in the core-doc filter, recorded as UNFALSIFIABLE by an earlier draft and falsified by a constructed fixture: a DIRECTORY named `*.md` exists the moment a fixture puts a file inside one',
    },
    {
      mode: "resource",
      files: {
        "docs/architecture/core/Core-Path-Registry.md":
          "- **D1** — an entry.\n- **D66 — an em-dash-inside-the-bold entry.**\n> **RESERVED RANGE — D79–D105:** reserved for main-era rulings.\n",
        "packages/contracts/src/y.ts":
          "// per D1 (anchored), D66 (the other anchor form), D99 (reserved), FLAG[PD-17] (sibling namespace).\nexport const y = 1;\n",
      },
      why: "both authored anchor forms, a reserved-range number, and the PD sibling namespace — every citation resolves and the non-`P` left boundary keeps PD-17 out; drop the lookbehind and `D-17` reds",
    },
    {
      mode: "resource",
      files: {
        "docs/architecture/core/Core-Path-Registry.md": "- **D1** — an entry.\n> **RESERVED RANGE — D79–D105:** reserved for main-era rulings.\n",
        "packages/contracts/src/z.ts": "// ADD777 and a hyphenated X-D777 are substrings, not citations.\nexport const z = 1;\n",
      },
      why: "THE NARROWING ROW for the left boundary: drop the lookbehind and `ADD777`/`X-D777` read as dangling citations. The numbers are deliberately UNMINTED — an earlier draft used `D1`, which resolves, so the row passed with the fence cut and discriminated nothing",
    },
    {
      mode: "resource",
      files: {
        "docs/architecture/core/Core-Path-Registry.md":
          "- **D1** — an entry.\n> **RESERVED RANGE — D79–D105:** reserved for main-era rulings. **Next free number is D161+.**\n",
        "packages/contracts/src/ok.ts": "// per D1 — anchored.\nexport const x = 1;\n",
      },
      why: "THE NARROWING ROW for the range-announcement fence: `D161+` is the registry announcing its next UNMINTED id, so it must not dangle on its own bookkeeping. Drop `(?!\\+)` and this row reds — it is also the live shape on the real tree",
    },
    {
      mode: "resource",
      files: {
        "docs/architecture/core/Core-Path-Registry.md": "- **D1** — an entry.\n> **RESERVED RANGE — D79–D105:** reserved for main-era rulings.\n",
        "docs/architecture/core/Empty-Doc.md": "",
        "packages/contracts/src/ok.ts": "// per D1 — anchored.\nexport const x = 1;\n",
      },
      why: "an EMPTY core doc is a verdict, not a hole: the text door refuses it as `empty`, it carries no citation to judge, and the policy must not turn that into the tool error it raises for every OTHER refusal status",
    },
    {
      mode: "resource",
      files: {
        "docs/architecture/core/Core-Path-Registry.md": "- **D1** — an entry.\n> **RESERVED RANGE — D79–D105:** reserved for main-era rulings.\n",
        "docs/architecture/history/Archaeology.md": "---\nkind: history\n---\n\nMain-era D777 and D888 are cited here as archaeology.\n",
        "packages/contracts/src/ok.ts": "// per D1 — anchored.\nexport const x = 1;\n",
      },
      why: "THE NARROWING ROW for the `docs/architecture/core/` prefix: `history/**` legitimately cites dead and renumbered entries, so widening the corpus filter to the whole docs tree reds this row",
    },
  ],
});
