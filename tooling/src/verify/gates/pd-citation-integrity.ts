// Gate: pd-citation-integrity — the Promotion/Relocation Debt registry is the ONE home for
// "promote/relocate later" deferrals; code cites a row as `FLAG[PD-<n>]`. Makes the registry↔code link
// physics: (a) no PD id appears twice across the registry, and (b) every `FLAG[PD-<n>]` in the authored
// corpus resolves to a registry row. A registry row with no citation is ALLOWED — future or blocked debt
// is legitimately registered before it has a code site.
//
// FAMILY: `text-citation`, the shared reader `lib/text-cite-scan.ts#scanTextCitations`. Three members
// (`d-citation-integrity`, this, `dangling-doc-cite`) judge a lexeme found by scanning RAW TEXT, so none
// has a node to report and all three need the same offset→authored-position answer.
//
// AUTHORITY IS `hard`, AND THAT IS A MEASURED RUNTIME FACT RATHER THAN A PREFERENCE. A `FLAG[PD-n]`
// citation lives in a COMMENT — that is what a citation is here — and `lib/ordinary-waiver.ts#locateFinding`
// refuses an ordinary finding whose token does not survive comment blanking: *"ordinary finding
// <file>:<line>:<col> points into comment trivia rather than authored code"* (measured 2026-09-12 by
// running this module's own orphan row under `authority: "ordinary"`). So no ordinary door exists for
// this policy's dominant arm, and a policy has ONE authority. The legacy runtime did bind a line-adjacent
// `@orb-gate-ignore` to a comment-resident finding (`lib/pass.ts#findingSuppressedAt`); the final runtime
// structurally cannot, which is a capability the conversion loses and says so rather than shipping a door
// that alarms on first use. The loss is empty in practice: the tree carries ZERO
// `@orb-gate-ignore pd-citation-integrity` markers (measured repo-wide at the conversion commit), so the
// per-file marker reconciliation closes at 0 legacy = 0 waives = 0 dead.
//
// POPULATION PORT (legacy SHA `50088b39b`, verified byte-identical to HEAD at conversion). The legacy
// descriptor walked `project.getSourceFiles()` — the harness corpus, `_shared/ts-workspace.ts#harnessGlobs`
// — and subtracted `tooling/src/verify/gates/`. `@authored` now includes the shipped showcase and
// default-content packages, so it carries the complete package reach without duplicate roots. The
// st-goldens captured runtime needs no `notUnder`: it is excluded from the PROJECT, and a
// policy's candidates are the project's own files (`lib/policy-pass.ts:402`).
//
// THE GATE-CORPUS SUBTRACTION IS A POPULATION FENCE, NOT AN EXEMPTION TABLE: a gate module's
// `FLAG[PD-n]` EXAMPLE strings are proof fixtures, never citations. It stays a `notUnder` because that is
// exactly what the legacy subtraction was, and `mustPass[1]` is the row that dies without it.
//
// WHERE A BROKEN RESOURCE REFUSES — not here. A declared resource that comes back
// missing/empty/unresolved/malformed makes `resolveResourceDeclarations` (`lib/resource-declaration.ts`)
// THROW during the POPULATION phase and the receipt phase withholds every consumer, both before
// `create`/`evaluate` run (guide §3's acquisition-refusal rule, `docs/design/resource-policy-contract.md` §4). This module
// owns no not-ready branch: it reads the ledger through `readyResourceValue`, whose throw is an assertion
// that the runtime's own refusal already held. The registry is a `ledger` and not a `documents` member
// precisely because it is an IDENTITY: reading half of it is how a LIVE id reads as an orphan cite, so an
// absent member must refuse rather than yield a smaller row set (`contract/resource-document.ts`). The
// refusal pins are in `tests/tooling/verify/gates/text-citation-family.suite.test.ts`.
//
// ANCHOR MOVE (guide §6.4's ANCHOR MOVE classification, receipted). The legacy duplicate-id finding anchored at the ACTIVE
// registry's line 1; it now anchors on the SECOND authored occurrence of the id — the collision site.
// With zero markers on the tree nothing can be orphaned by the move.
//
// DECLARED LIMIT: the registry files are also members of the living-document corpus, but this policy
// reads them ONLY through the `ledger` identity door, so a `FLAG[PD-n]` written in a doc rather than in
// code is not a citation here. That is the legacy scope (the scan was over the ts-morph project), and
// `mustPass[4]` holds the prose half of it.
import { defineGate } from "../contract/policy.ts";
import type { MarkdownDocument } from "../contract/resource-document.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";
import { scanTextCitations } from "../lib/text-cite-scan.ts";

const GATES_DIR = "tooling/src/verify/gates/**";
/** A registry row in either half. Group 1 is the id itself — the exact authored token to anchor on. */
const ROW_RE = /^\|\s*(PD-\d+)\b/gmu;
/** A code citation. Group 1 is the id INSIDE the bracketed form, so the anchor is the id's own position. */
const CITE_RE = /FLAG\[(PD-\d+)\]/gu;

const MESSAGE =
  "the PD-registry↔code link is broken — either a PD id appears twice in the registry (a concurrent-append collision) or a FLAG[PD-n] citation resolves to no registry row (an orphan). See Core-Audits-and-Debt.md.";

interface Occurrence {
  readonly path: string;
  readonly line: number;
  readonly column: number;
}

type Cite = Occurrence & { readonly id: string };

function registryRows(documents: readonly MarkdownDocument[]): ReadonlyMap<string, readonly Occurrence[]> {
  const rows = new Map<string, Occurrence[]>();
  for (const document of documents) {
    for (const row of scanTextCitations(document.text, ROW_RE)) {
      const occurrences = rows.get(row.token) ?? [];
      occurrences.push({ path: document.path, line: row.line, column: row.column });
      rows.set(row.token, occurrences);
    }
  }
  return rows;
}

export const gate = defineGate({
  id: "pd-citation-integrity",
  family: "text-citation",
  authority: "hard",
  severity: "error",
  population: { in: ["@authored"], notUnder: [GATES_DIR] },
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [{ kind: "ledger", id: "core-audits-debt" }],
  message: MESSAGE,
  fix: "add the missing row in Core-Audits-and-Debt.md, fix the citation id, or de-dupe the PD id (each is unique — active XOR cleared).",
  create: (ctx) => {
    const cites: Cite[] = [];
    const reportDuplicates = (rows: ReadonlyMap<string, readonly Occurrence[]>, label: string): void => {
      for (const [id, occurrences] of rows) {
        const collision = occurrences[1];
        if (collision !== undefined) {
          ctx.report.file(collision.path, {
            line: collision.line,
            column: collision.column,
            token: id,
            message: `${id} appears ${String(occurrences.length)}× across the PD registry (${label}) — each PD id is unique (active XOR cleared; renumber or de-dupe). See Core-Audits-and-Debt.md.`,
          });
        }
      }
    };
    const reportOrphans = (rows: ReadonlyMap<string, readonly Occurrence[]>, label: string): void => {
      for (const cite of cites) {
        if (!rows.has(cite.id)) {
          ctx.report.file(cite.path, {
            line: cite.line,
            column: cite.column,
            token: cite.id,
            message: `FLAG[${cite.id}] cites a Promotion-Debt id with no row in the PD registry (${label}) — add the row in Core-Audits-and-Debt.md, or fix the id.`,
          });
        }
      }
    };
    return {
      visitFile: (sourceFile) => {
        const path = ctx.relativePath(sourceFile);
        for (const hit of scanTextCitations(sourceFile.getFullText(), CITE_RE)) {
          cites.push({ path, id: hit.token, line: hit.line, column: hit.column });
        }
      },
      evaluate: () => {
        const ledger = readyResourceValue(ctx.resources.ledger("core-audits-debt"));
        const label = ledger.documents.map(({ path }) => path).join(" / ");
        const rows = registryRows(ledger.documents);
        reportDuplicates(rows, label);
        reportOrphans(rows, label);
        // What the run MEASURED — the ledger documents read — never the row census it FOUND. A registry
        // with zero rows is a verdict, and a zero receipt would turn it into a refusal instead
        // (`lib/policy-pass.ts` receiptFailures, `count === 0`; guide §3).
        ctx.receipt({ kind: "population", source: "pd-registry-documents", members: ledger.documents.length });
      },
    };
  },
  mustFlag: [
    {
      mode: "resource",
      files: {
        "docs/law/Core-Audits-and-Debt.md": "| PD-1 | something |\n",
        "docs/law/Core-Debt-Cleared-Ledger.md": "| PD-2 | cleared |\n",
        "packages/server/src/x.ts": "// FLAG[PD-999] an orphan citation\nexport const x = 1;\n",
      },
      expect: { count: 1, line: 1, token: "PD-999", messageIncludes: "no row in the PD registry" },
      why: "the founding orphan: a FLAG[PD-999] citation with no matching registry row, reported at the exact authored id rather than at the statement",
    },
    {
      mode: "resource",
      files: {
        "docs/law/Core-Audits-and-Debt.md": "| PD-7 | active debt |\n| PD-7 | a second row with the same id |\n",
        "docs/law/Core-Debt-Cleared-Ledger.md": "| PD-2 | cleared |\n",
        "packages/server/src/x.ts": "export const x = 1;\n",
      },
      expect: { count: 1, line: 2, token: "PD-7", messageIncludes: "appears 2× across the PD registry" },
      why: "the concurrent-append dupe arm, anchored on the SECOND occurrence — the collision site, which is where a reader has to look",
    },
    {
      mode: "resource",
      files: {
        "docs/law/Core-Audits-and-Debt.md": "| PD-7 | active debt |\n",
        "docs/law/Core-Debt-Cleared-Ledger.md": "| PD-7 | the same id, cleared |\n",
        "packages/server/src/x.ts": "export const x = 1;\n",
      },
      expect: { count: 1, token: "PD-7", messageIncludes: "appears 2× across the PD registry" },
      why: "active XOR cleared — the id is unique across BOTH halves, which is why the two files are ONE ledger identity and not two resources; a per-file uniqueness check passes this",
    },
    {
      mode: "resource",
      files: {
        "docs/law/Core-Audits-and-Debt.md": "| PD-1 | something |\n",
        "docs/law/Core-Debt-Cleared-Ledger.md": "| PD-2 | cleared |\n",
        "tests/tooling/x.ts": "// FLAG[PD-998] an orphan in the test corpus\nexport const x = 1;\n",
      },
      expect: { count: 1, token: "PD-998", messageIncludes: "no row in the PD registry" },
      why: "the population is the whole AUTHORED corpus, not packages — `@tests` is in it, so a conversion that had declared `@packages` would lose this site silently",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: {
        "docs/law/Core-Audits-and-Debt.md": "| PD-1 | something |\n",
        "docs/law/Core-Debt-Cleared-Ledger.md": "| PD-2 | cleared |\n",
        "packages/server/src/x.ts": "// FLAG[PD-1] active, FLAG[PD-2] cleared — both resolve.\nexport const x = 1;\n",
      },
      why: "a citation resolving through EITHER half of the ledger identity — the link is intact",
    },
    {
      mode: "resource",
      files: {
        "docs/law/Core-Audits-and-Debt.md": "| PD-1 | something |\n",
        "docs/law/Core-Debt-Cleared-Ledger.md": "| PD-2 | cleared |\n",
        "packages/server/src/ok.ts": "export const ok = 1;\n",
        "tooling/src/verify/gates/example-policy.ts": 'export const proof = { files: { "x.ts": "// FLAG[PD-999]" } };\n',
      },
      why: "THE NARROWING ROW for `notUnder: tooling/src/verify/gates/**` — the identical orphan citation inside a gate module is a proof FIXTURE, not a citation; delete the fence and this row reds",
    },
    {
      mode: "resource",
      files: {
        "docs/law/Core-Audits-and-Debt.md": "| PD-1 | something |\n| PD-10 | a longer id that must not collide with PD-1 |\n",
        "docs/law/Core-Debt-Cleared-Ledger.md": "| PD-2 | cleared |\n",
        "packages/server/src/x.ts": "// FLAG[PD-10] resolves to its own row, not to PD-1's.\nexport const x = 1;\n",
      },
      why: "a longer id beside a shorter one — greedy `\\d+` already keeps `PD-10` and `PD-1` distinct, so this row passes with the `\\b` cut and is honest about that. mustPass[3] is the row the `\\b` actually holds",
    },
    {
      mode: "resource",
      files: {
        "docs/law/Core-Audits-and-Debt.md": "| PD-1 | the one real row |\n| PD-1x | a table cell that is NOT a PD id |\n",
        "docs/law/Core-Debt-Cleared-Ledger.md": "| PD-2 | cleared |\n",
        "packages/server/src/x.ts": "// FLAG[PD-1] resolves to the single PD-1 row.\nexport const x = 1;\n",
      },
      why: "THE NARROWING ROW for the `\\b` in `^\\|\\s*(PD-\\d+)\\b`: without it the `PD-1x` cell registers as a SECOND `PD-1` row and the registry reads as duplicated. Measured — the obvious `PD-10` fixture does not discriminate, because greedy `\\d+` never stops early",
    },
    {
      mode: "resource",
      files: {
        "docs/law/Core-Audits-and-Debt.md": "| PD-1 | something |\n",
        "docs/law/Core-Debt-Cleared-Ledger.md": "| PD-2 | cleared |\n",
        "packages/server/src/prose.ts":
          "// PD-999 is discussed in prose here, and a table row | PD-999 | in a code sample is not a registry row.\nexport const x = 1;\n",
      },
      why: "THE NARROWING ROW for both patterns at once: a citation is the bracketed FLAG[...] form and a registry row is a `^|`-anchored table row in the LEDGER, so prose naming a PD id in a source file is neither. Drop `FLAG\\[` and this row reds as an orphan",
    },
    {
      mode: "resource",
      files: {
        "docs/law/Core-Audits-and-Debt.md": "| PD-1 | something |\n",
        "docs/law/Core-Debt-Cleared-Ledger.md": "| PD-2 | cleared |\n",
        "packages/server/src/x.ts": "export const x = 1;\n",
      },
      why: "a registry row with no citation is legitimate — future or blocked debt registered before it has a code site; the reconciliation is one-sided BY DESIGN and a two-sided one would red the whole registry",
    },
  ],
});
