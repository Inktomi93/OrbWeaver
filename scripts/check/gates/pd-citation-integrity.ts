// Gate: pd-citation-integrity — the Promotion/Relocation Debt registry (core/Audits-and-Debt.md) is the
// ONE home for "promote/relocate later" deferrals; code cites a row via `FLAG[PD-<n>]`. Concurrent leaf
// agents collided ids (two PD-19s; reused PD-1/2/3 for new items) — the registry built to PREVENT lost
// deferrals got corrupted by uncoordinated appends. This makes the registry↔code link PHYSICS:
//   (a) no PD id appears twice in the registry (the concurrent-append collision), and
//   (b) every `FLAG[PD-<n>]` in code resolves to a registry row (active or cleared) — no orphan citation.
// (A registry row with NO citation is allowed: future/blocked debt is registered before it has a code site.)
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SourceFile } from "ts-morph";
import type { Check, Violation } from "../harness.ts";

// The PD registry was split 2026-07-02: the ACTIVE flags stay in Core-Audits-and-Debt.md; the CLEARED
// (done) ledger moved to its own file. A PD id resolves if it has a row in EITHER — and must be unique
// across BOTH (a flag is active XOR cleared, never both).
const ACTIVE_REGISTRY = "docs/architecture/core/Core-Audits-and-Debt.md";
const REGISTRY_FILES = [
  ACTIVE_REGISTRY, // active registry
  "docs/architecture/core/Core-Debt-Cleared-Ledger.md", // cleared (done) ledger
];
const REGISTRY_LABEL = REGISTRY_FILES.join(" / ");
const ROW_RE = /^\|\s*PD-(\d+)\b/gmu; // a registry row (active table OR cleared table)
const CITE_RE = /FLAG\[PD-(\d+)\]/gu; // a code citation

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
        message: `FLAG[PD-${id}] cites a Promotion-Debt id with no row in the PD registry (${REGISTRY_LABEL}) — add the row, or fix the id.`,
      });
    }
  }
  return out;
}

export const pdCitationIntegrity: Check = {
  name: "pd-citation-integrity",
  run: ({ root, project }): Violation[] => {
    const violations: Violation[] = [];
    const { ids, dupes } = readRegistry(root);
    for (const [id, n] of dupes) {
      violations.push({
        file: ACTIVE_REGISTRY,
        line: 1,
        message: `PD-${id} appears ${n}× across the PD registry (${REGISTRY_LABEL}) — each PD id is unique (active XOR cleared; renumber or de-dupe).`,
      });
    }
    for (const sf of project.getSourceFiles()) {
      violations.push(...orphanCitesIn(sf, root, ids));
    }
    return violations;
  },
};
