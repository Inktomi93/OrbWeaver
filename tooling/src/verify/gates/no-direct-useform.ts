// Gate: no-direct-useform — TanStack Form's raw hooks are the shared toolkit's business alone.
// SCAN-AND-ALLOWLIST (GATE-AUTHORING.md §3, 2026-08-22): the toolkit home is SCANNED and exempted by a
// cited row + a RENAME TRIPWIRE, not scoped out of scanRoot — an excluded home follows its old path into
// the void on a move while the new path is judged by nobody. Comment posture: comment-SAFE (call nodes).
import { Node, SyntaxKind } from "ts-morph";
import type { ExemptionTable, GateDescriptor } from "../contract/gate.ts";
import { repoRel } from "../lib/pass.ts";
import { HOME_SWEEP_ANCHOR, reportUnresolvedHomes, sanctionedHome } from "../lib/sanctioned-home.ts";

const METHODS = new Set(["useForm", "createFormHook", "createFormHookContexts"]);

const GATE_SELF = "tooling/src/verify/gates/no-direct-useform.ts";

/** The ONE home allowed to touch TanStack Form directly — it is what `useAppForm` is built OUT of. */
const SANCTIONED_HOMES: ExemptionTable = {
  "packages/client/src/forms/": {
    why: "the shared form toolkit itself — `useAppForm`/`withForm`/`withFieldGroup` are built by calling `createFormHook`/`useForm` here, so the home cannot violate its own rule. Ends when the toolkit moves (the rename tripwire reds the row at its dead path)",
  },
};

export const gate: GateDescriptor = {
  name: "no-direct-useform",
  docRow: "UI-Lib-TanStack-Form.md",
  status: "active",
  scopeSafety: "incremental-safe",
  message:
    "Use `useAppForm` (and `withForm` / `withFieldGroup`) from `#forms` instead of TanStack Form's `useForm` / `createFormHook` / `createFormHookContexts` directly. The shared instance pre-binds the @orb/ui Field components; calling these directly bypasses the bound fields and drifts every editor surface apart. See docs/architecture/history/UI-Lib-TanStack-Form.md.",
  // SCANNED everywhere; the toolkit home passes on a cited row, never on an invisible scope decision.
  scanRoot: (_p) => true,
  kinds: [SyntaxKind.CallExpression],
  visit(node, sf, ctx): void {
    if (!Node.isCallExpression(node)) {
      return;
    }

    const expr = node.getExpression();
    if (!Node.isIdentifier(expr)) {
      return;
    }

    if (!METHODS.has(expr.getText())) {
      return;
    }
    if (sanctionedHome(SANCTIONED_HOMES, repoRel(ctx.root, sf.getFilePath())) !== undefined) {
      return;
    }
    ctx.report(node);
  },
  finalize: (ctx) => {
    reportUnresolvedHomes(ctx, SANCTIONED_HOMES, { gateSelf: GATE_SELF, what: "shared form toolkit" });
  },
  mustFlag: [
    {
      why: "useForm outside shared toolkit",
      files: {
        "src/features/some-feature/surface.tsx": `
          useForm(...)
        `,
      },
    },
    {
      expect: { count: 1, messageIncludes: "stale SANCTIONED-HOME row" },
      why: "THE RENAME TRIPWIRE (§4.4a mode B): the real-tree anchor is loaded but the toolkit home resolves to no file — under the old scanRoot-exclusion shape that move was silent and the toolkit's new path was judged by nobody",
      files: {
        [HOME_SWEEP_ANCHOR]: "export const schema = {};\n",
      },
    },
  ],
  mustPass: [
    {
      why: "useForm inside the shared toolkit — now SCANNED, and passing only because a cited SANCTIONED_HOMES row covers the path",
      files: {
        "packages/client/src/forms/use-app-form.ts": `
          useForm(...)
        `,
      },
    },
    {
      why: "the home is alive (the anchor is loaded AND the toolkit resolves), so the tripwire stays silent — the pass half of the mode-B arm",
      files: {
        [HOME_SWEEP_ANCHOR]: "export const schema = {};\n",
        "packages/client/src/forms/use-app-form.ts": "export const useAppForm = null;\n",
      },
    },
  ],
};
