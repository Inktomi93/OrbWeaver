// Gate: pd-citation-integrity — the Promotion/Relocation Debt registry (core/Audits-and-Debt.md) is the
// ONE home for "promote/relocate later" deferrals; code cites a row via `FLAG[PD-<n>]`. Makes the
// registry↔code link physics: (a) no PD id appears twice in the registry, and (b) every `FLAG[PD-<n>]`
// in code resolves to a registry row. A registry row with no citation is allowed (future/blocked debt registered before it has a code site).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Project, SourceFile } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";
import type { Violation } from "../harness.ts";

// The PD registry was split 2026-07-02: the ACTIVE flags stay in Core-Audits-and-Debt.md; the CLEARED
// (done) ledger moved to its own file. A PD id resolves if it has a row in EITHER — and must be unique
// across BOTH (a flag is active XOR cleared, never both).
const ACTIVE_REGISTRY = "docs/architecture/core/Core-Audits-and-Debt.md";
const REGISTRY_FILES = [
  ACTIVE_REGISTRY, // active registry
  "docs/architecture/history/Core-Debt-Cleared-Ledger.md", // cleared (done) ledger
];
const REGISTRY_LABEL = REGISTRY_FILES.join(" / ");
const ROW_RE = /^\|\s*PD-(\d+)\b/gmu; // a registry row (active table OR cleared table)
const CITE_RE = /FLAG\[PD-(\d+)\]/gu; // a code citation
// The §2.2 fold-in pins this scanner to packages+tests: the workspace now globs the gate corpus too, but
// a gate file's FLAG[PD-n] EXAMPLE strings are fixtures, not real citations — exclude them.
const GATES_DIR_REL = "scripts/check/gates";

function relPath(root: string, abs: string): string {
  return abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
}

/** Registry ids (unioned across the active + cleared files) + the dupes among them. */
function readRegistry(root: string): { ids: Set<string>; dupes: Map<string, number> } {
  const ids = new Set<string>();
  const counts = new Map<string, number>();
  for (const rel of REGISTRY_FILES) {
    const path = join(root, rel);
    if (!existsSync(path)) {
      continue;
    }
    const text = readFileSync(path, "utf8");
    for (const m of text.matchAll(ROW_RE)) {
      const id = m[1];
      if (id !== undefined) {
        ids.add(id);
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
  }
  const dupes = new Map([...counts].filter(([, n]) => n > 1));
  return { ids, dupes };
}

/** Orphan `FLAG[PD-n]` citations in one file (id has no registry row). */
function orphanCitesIn(sf: SourceFile, root: string, ids: Set<string>): Violation[] {
  const out: Violation[] = [];
  const text = sf.getFullText();
  for (const m of text.matchAll(CITE_RE)) {
    const id = m[1];
    if (id !== undefined && !ids.has(id) && m.index !== undefined) {
      out.push({
        file: relPath(root, sf.getFilePath()),
        line: sf.getLineAndColumnAtPos(m.index).line,
        message: `FLAG[PD-${id}] cites a Promotion-Debt id with no row in the PD registry (${REGISTRY_LABEL}) — add the row in Core-Audits-and-Debt.md, or fix the id.`,
      });
    }
  }
  return out;
}

/** The whole-tree reconciliation shared by the legacy Check and the single-pass `run` descriptor: the PD
 *  registry (read from the .md files via fs) vs FLAG[PD-n] citations in the project source. */
function reconcilePdCitations(root: string, project: Project): Violation[] {
  const violations: Violation[] = [];
  const { ids, dupes } = readRegistry(root);
  for (const [id, n] of dupes) {
    violations.push({
      file: ACTIVE_REGISTRY,
      line: 1,
      message: `PD-${id} appears ${n}× across the PD registry (${REGISTRY_LABEL}) — each PD id is unique (active XOR cleared; renumber or de-dupe). See Core-Audits-and-Debt.md.`,
    });
  }
  for (const sf of project.getSourceFiles()) {
    // Pin to packages+tests (the §2.2 fold-in caveat): the workspace now also globs
    // scripts/check/gates/**, but a gate file's own FLAG[PD-n] EXAMPLE strings (a mustFlag fixture) are
    // not real code citations — excluding the gate corpus keeps this scanner's findings byte-identical
    // to before the fold-in. The legacy harness project never loaded gate files, so this is a no-op there.
    if (relPath(root, sf.getFilePath()).startsWith(`${GATES_DIR_REL}/`)) {
      continue;
    }
    violations.push(...orphanCitesIn(sf, root, ids));
  }
  return violations;
}

export const gate: GateDescriptor = {
  name: "pd-citation-integrity",
  docRow: "core/Audits-and-Debt.md",
  status: "active",
  scopeSafety: "whole-project",
  fsBacked: true,
  message:
    "the PD-registry↔code link is broken — either a PD id appears twice in the registry (a concurrent-append collision) or a FLAG[PD-n] citation resolves to no registry row (an orphan). See Core-Audits-and-Debt.md.",
  fix: "de-dupe the PD id (each is unique, active XOR cleared), or add the missing registry row in Core-Audits-and-Debt.md / fix the citation id.",
  run: (ctx) => {
    for (const v of reconcilePdCitations(ctx.root, ctx.project)) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
  },
  mustFlag: [
    {
      files: {
        "docs/architecture/core/Core-Audits-and-Debt.md": "| PD-1 | something |\n",
        "packages/server/src/x.ts": "// FLAG[PD-999] an orphan citation\nexport const x = 1;\n",
      },
      expect: { messageIncludes: "no row in the PD registry" },
      why: "a FLAG[PD-999] citation with no matching registry row — an orphan (the link must be physics)",
    },
    {
      files: {
        "docs/architecture/core/Core-Audits-and-Debt.md": "| PD-7 | active debt |\n| PD-7 | a second row with the same id |\n",
      },
      expect: { messageIncludes: "appears 2× across the PD registry" },
      why: "the same PD-7 row twice in the registry — the concurrent-append dupe arm (distinct message + code path)",
    },
  ],
  mustPass: [
    {
      files: {
        "docs/architecture/core/Core-Audits-and-Debt.md": "| PD-1 | something |\n",
        "packages/server/src/x.ts": "// FLAG[PD-1] a resolved citation\nexport const x = 1;\n",
      },
      why: "a FLAG[PD-1] citation that resolves to a registry row — the link is intact, passes",
    },
  ],
};
