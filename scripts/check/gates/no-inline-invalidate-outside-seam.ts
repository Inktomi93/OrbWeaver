// Gate: no-inline-invalidate-outside-seam (UI-Gates-and-Lessons.md §11.3 — "the central invalidation
// seam"). neo's real sprawl was INVALIDATION: 81 `invalidateQueries` across 40 files, no map. orbweaver
// routes ALL invalidation through ONE chokepoint — `data/invalidation.ts` owns the exhaustive
// event→`queryFilter()` maps and the sole `queryClient.invalidateQueries` call; everything else calls
// `invalidate(event)` / `invalidateUser(event)` or hands `invalidates` filters to `createEntityMutation`
// (which routes them back through `invalidateFilters`). A loose `invalidateQueries(` anywhere else
// recreates the sprawl the seam exists to kill.
//
// WHAT IT FLAGS: a `.invalidateQueries(` method call (AST — comments/strings don't count) in
// packages/client/src/** OUTSIDE `data/invalidation.ts`. TIGHTER than the Layer-2 grit
// `client-cache-surgery-only-in-data` (which allows all of `data/`) — this pins the seam to the ONE
// file, so an `invalidateQueries` that drifts into a sibling data/ module (a mutation factory, a bus
// adapter) is still RED.
//
// WHAT IT DELIBERATELY DOES NOT FLAG: the ONE sanctioned call in `data/invalidation.ts`
// (`invalidateFilters` → `deps.queryClient.invalidateQueries(filter)`); `.cancelQueries(` /
// `.setQueryData(` (createEntityMutation's optimistic flow — a different concern, the grit's job); and
// the `.queryKey`/`.queryFilter` proxy reads (not `invalidateQueries`).
import type { SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";
import type { Check, Violation } from "../harness.ts";

const CLIENT_SRC = "/packages/client/src/";

/** The ONE file that owns `invalidateQueries` — the central seam (UI-Gates-and-Lessons.md §11.3). */
const SEAM_FILE = "packages/client/src/data/invalidation.ts";

const MESSAGE =
  "inline invalidateQueries outside the central seam — route invalidation through data/invalidation.ts " +
  "(invalidate(event)/invalidateUser(event)), or pass `invalidates` filters to createEntityMutation. A " +
  "loose call recreates neo's 81-site invalidation sprawl (UI-Gates-and-Lessons.md §11.3).";

function clientRel(path: string): string | undefined {
  const idx = path.indexOf(CLIENT_SRC);
  if (idx === -1) {
    return;
  }
  return `packages/client/src/${path.slice(idx + CLIENT_SRC.length)}`;
}

function violationsIn(sf: SourceFile, rel: string): Violation[] {
  const out: Violation[] = [];
  for (const access of sf.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)) {
    if (access.getName() !== "invalidateQueries") {
      continue;
    }
    // Only a genuine CALL (`x.invalidateQueries(...)`) — a bare `.invalidateQueries` reference (the
    // seam's own type shapes) isn't the sprawl.
    if (Node.isCallExpression(access.getParent())) {
      out.push({ file: rel, line: access.getStartLineNumber(), message: MESSAGE });
    }
  }
  return out;
}

export const noInlineInvalidateOutsideSeam: Check = {
  name: "no-inline-invalidate-outside-seam",
  run: ({ project }): Violation[] => {
    const violations: Violation[] = [];
    for (const sf of project.getSourceFiles()) {
      const rel = clientRel(sf.getFilePath());
      if (rel === undefined || rel === SEAM_FILE) {
        continue;
      }
      violations.push(...violationsIn(sf, rel));
    }
    return violations;
  },
};

// ── SINGLE-PASS CONTRACT FORM (§1.2, §8.1 batch (a)) ──────────────────────────────────────────────
// The legacy predicate as a PropertyAccessExpression subscription: a `.invalidateQueries(` CALL in
// client-src outside the ONE seam file. scanRoot mirrors the legacy clientRel filter minus the seam file
// (the parity oracle). Per-occurrence (each loose invalidateQueries call). Kept ALONGSIDE the legacy Check.
export const gate: GateDescriptor = {
  name: "no-inline-invalidate-outside-seam",
  docRow: "UI-Gates-and-Lessons.md §11.3",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: "route invalidation through data/invalidation.ts (invalidate(event)/invalidateUser(event)), or pass `invalidates` filters to createEntityMutation.",
  scanRoot: (p) => p.includes("packages/client/src/") && p !== SEAM_FILE,
  kinds: [SyntaxKind.PropertyAccessExpression],
  visit: (node, _sf, ctx) => {
    if (!Node.isPropertyAccessExpression(node) || node.getName() !== "invalidateQueries") {
      return;
    }
    // Only a genuine CALL (`x.invalidateQueries(...)`) — a bare `.invalidateQueries` reference isn't sprawl.
    if (Node.isCallExpression(node.getParent())) {
      ctx.report(node, { token: "invalidateQueries", offset: 0 });
    }
  },
  mustFlag: [
    {
      files:
        "export function f(qc: { invalidateQueries: (x?: unknown) => void }) {\n  qc.invalidateQueries();\n}\n",
      at: "packages/client/src/features/a/mutation.ts",
      why: "a loose invalidateQueries call outside the seam — the neo 81-site sprawl reborn",
    },
  ],
  mustPass: [
    {
      files:
        "export function f(qc: { cancelQueries: (x?: unknown) => void }) {\n  qc.cancelQueries();\n}\n",
      at: "packages/client/src/features/a/mutation2.ts",
      why: ".cancelQueries (createEntityMutation's optimistic flow) is a different concern — not flagged",
    },
  ],
};
