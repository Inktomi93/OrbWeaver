// Gate: no-inline-invalidate-outside-seam (UI-Gates-and-Lessons.md §11.3 — "the central invalidation
// seam"). All invalidation routes through ONE chokepoint — `data/invalidation.ts` owns the exhaustive
// event→`queryFilter()` maps and the sole `queryClient.invalidateQueries` call; everything else calls
// `invalidate(event)`/`invalidateUser(event)` or hands filters to `createEntityMutation`. Flags a
// `.invalidateQueries(` call anywhere in packages/client/src/** outside that one file. Does not flag `.cancelQueries(`/`.setQueryData(` (a different concern).
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

/** The ONE file that owns `invalidateQueries` — the central seam (UI-Gates-and-Lessons.md §11.3). */
const SEAM_FILE = "packages/client/src/data/invalidation.ts";

const MESSAGE =
  "inline invalidateQueries outside the central seam — route invalidation through data/invalidation.ts " +
  "(invalidate(event)/invalidateUser(event)), or pass `invalidates` filters to createEntityMutation. A " +
  "loose call recreates neo's 81-site invalidation sprawl (UI-Gates-and-Lessons.md §11.3).";
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
      files: "export function f(qc: { invalidateQueries: (x?: unknown) => void }) {\n  qc.invalidateQueries();\n}\n",
      at: "packages/client/src/features/a/mutation.ts",
      why: "a loose invalidateQueries call outside the seam — the neo 81-site sprawl reborn",
    },
  ],
  mustPass: [
    {
      files: "export function f(qc: { cancelQueries: (x?: unknown) => void }) {\n  qc.cancelQueries();\n}\n",
      at: "packages/client/src/features/a/mutation2.ts",
      why: ".cancelQueries (createEntityMutation's optimistic flow) is a different concern — not flagged",
    },
    {
      files: "export function f(qc: { invalidateQueries: (x?: unknown) => void }) {\n  qc.invalidateQueries();\n}\n",
      at: "packages/client/src/data/invalidation.ts",
      why: "the ONE sanctioned invalidateQueries call — the seam file itself is scanRoot-excluded, passes",
    },
  ],
};
