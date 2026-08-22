// Gate: client-cache-surgery-only-in-data (UI-Gates-and-Lessons.md §11.3) — imperative QueryClient calls
// belong to the central data/ seam. SCAN-AND-ALLOWLIST (GATE-AUTHORING.md §3, 2026-08-22): the seam's home
// is SCANNED and exempted by a cited row plus the shared RENAME TRIPWIRE, not scoped out of scanRoot; the
// test-file skip below stays a SCOPE decision (a zone, not a sanctioned home). Comment posture: comment-SAFE.
import { Node, SyntaxKind } from "ts-morph";
import type { ExemptionTable, GateDescriptor } from "../contract/gate.ts";
import { repoRel } from "../lib/pass.ts";
import { HOME_SWEEP_ANCHOR, reportUnresolvedHomes, sanctionedHome } from "../lib/sanctioned-home.ts";

const METHODS = new Set(["invalidateQueries", "setQueryData", "cancelQueries", "getQueryData", "removeQueries", "resetQueries"]);
const TEST_FILE_RE = /\.(test|spec)\.tsx?$/;
const GATE_SELF = "tooling/src/verify/gates/client-cache-surgery-only-in-data.ts";

/** The ONE home for imperative cache surgery. */
const SANCTIONED_HOMES: ExemptionTable = {
  "packages/client/src/data/": {
    why: "the central data seam — `invalidate(event)`/`invalidateFilters` and `createEntityMutation` ARE these calls, so the seam cannot violate its own rule. Ends when the seam moves: the rename tripwire reds the row at its dead path instead of exempting a directory that no longer exists",
  },
};

export const gate: GateDescriptor = {
  name: "client-cache-surgery-only-in-data",
  docRow: "UI-Gates-and-Lessons.md §11.3",
  status: "active",
  scopeSafety: "incremental-safe",
  message:
    "imperative QueryClient cache call outside client data/ — invalidation goes through the central seam (data/invalidation.ts invalidate(event)/invalidateFilters) and optimistic writes through createEntityMutation; a loose cache call here recreates neo's 81-site invalidation sprawl. See UI-Gates-and-Lessons.md §11.3.",
  scanRoot: (p) => {
    if (!p.includes("packages/client/src/")) {
      return false;
    }
    if (TEST_FILE_RE.test(p)) {
      return false;
    }
    return true;
  },
  kinds: [SyntaxKind.CallExpression],
  visit(node, sf, ctx): void {
    if (!Node.isCallExpression(node)) {
      return;
    }

    const expr = node.getExpression();
    if (!Node.isPropertyAccessExpression(expr)) {
      return;
    }

    const name = expr.getName();
    if (!METHODS.has(name)) {
      return;
    }
    if (sanctionedHome(SANCTIONED_HOMES, repoRel(ctx.root, sf.getFilePath())) !== undefined) {
      return;
    }
    ctx.report(expr.getNameNode());
  },
  finalize: (ctx) => {
    reportUnresolvedHomes(ctx, SANCTIONED_HOMES, { gateSelf: GATE_SELF, what: "client data seam" });
  },
  mustFlag: [
    {
      why: "imperative QueryClient cache call outside client data/",
      files: {
        "packages/client/src/features/some-feature/surface.tsx": `
          client.invalidateQueries();
        `,
      },
    },
    {
      expect: { count: 1, messageIncludes: "stale SANCTIONED-HOME row" },
      why: "THE RENAME TRIPWIRE (§4.4a mode B): the shared anchor is loaded but packages/client/src/data/ resolves to no file — the seam moved, and the old scanRoot exclusion would have kept exempting a dead path",
      files: {
        [HOME_SWEEP_ANCHOR]: "export const schema = {};\n",
        "packages/client/src/features/some-feature/surface.tsx": "export const s = 1;\n",
      },
    },
  ],
  mustPass: [
    {
      why: "THE ALLOWLIST ITSELF: the data seam is now SCANNED and its own imperative cache calls pass on a cited SANCTIONED_HOMES row",
      files: {
        "packages/client/src/data/some-file.ts": `
          client.invalidateQueries();
        `,
      },
    },
    {
      why: "other method call",
      files: {
        "packages/client/src/features/some-feature/surface.tsx": `
          client.someOtherMethod();
        `,
      },
    },
  ],
};
