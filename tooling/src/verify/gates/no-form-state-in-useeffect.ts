// The subject is the READ, not its spelling: `form.state.values` and `form["state"]["values"]` are the
// same dependency and the same re-render-per-keystroke defect, so the member chain is resolved through
// `lib/symbol-reference.ts` rather than off `PropertyAccessExpression.getText()` (#1506 — the bracket
// spelling produced ZERO findings while the dotted one flagged).
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract/gate.ts";
import { readMemberAccess } from "../lib/symbol-reference.ts";

/** The member chain a node reads, innermost-last: `a.b["c"]` → ["c", "b"]. Stops at the first link that is
 *  not a member access, so the receiver's own text never enters the comparison. */
function memberChain(node: Node): readonly string[] {
  const chain: string[] = [];
  let current: Node = node;
  for (let read = readMemberAccess(current); read !== undefined; read = readMemberAccess(current)) {
    chain.push(read.name);
    current = read.receiver;
  }
  return chain;
}

/** `<x>.state.values` or `<x>.store`, in ANY member spelling — the two pre-listener reads. */
function isFormStateReference(node: Node): boolean {
  const [last, previous] = memberChain(node);
  if (last === undefined) {
    return false;
  }
  return last === "store" || (last === "values" && previous === "state");
}

export const gate: GateDescriptor = {
  name: "no-form-state-in-useeffect",
  docRow: "UI-Lib-TanStack-Form.md",
  status: "active",
  scopeSafety: "incremental-safe",
  message:
    "`useEffect` reading `form.state.values` / `form.store` in its dep array is the pre-listener anti-pattern: re-renders the whole component on every keystroke and can clobber unsaved typing on a refetch. Use form-level `listeners.onChange` with `onChangeDebounceMs` (see docs/architecture/history/UI-Lib-TanStack-Form.md, listeners) — it knows which field changed and runs in the form lifecycle, not the render cycle. For UI-only reactivity, use `form.Subscribe` (same doc, Subscribe).",
  scanRoot: () => true,
  kinds: [SyntaxKind.CallExpression],
  visit(node, _sf, ctx): void {
    if (!Node.isCallExpression(node)) {
      return;
    }

    const expr = node.getExpression();
    if (!Node.isIdentifier(expr) || expr.getText() !== "useEffect") {
      return;
    }

    const args = node.getArguments();
    if (args.length !== 2) {
      return;
    }

    const deps = args[1];
    if (!Node.isArrayLiteralExpression(deps)) {
      return;
    }

    deps.forEachDescendant((descendant) => {
      if (isFormStateReference(descendant)) {
        ctx.report(node);
      }
    });
  },
  mustFlag: [
    {
      why: "reading form.state.values in deps",
      files: {
        "src/some-component.tsx": `
          useEffect(() => {}, [form.state.values]);
        `,
      },
    },
    {
      why: '#1506: the BRACKET spelling of the same read — `form["state"]["values"]` is the same dependency and the same per-keystroke re-render; it produced ZERO findings before the shared member reader',
      files: {
        "src/some-component.tsx": `
          useEffect(() => {}, [form["state"]["values"]]);
        `,
      },
    },
    {
      why: "#1506: the mixed spelling — one dotted link, one bracket link",
      files: {
        "src/some-component.tsx": `
          useEffect(() => {}, [form.state["values"]]);
        `,
      },
    },
    {
      why: "reading myForm.store in deps",
      files: {
        "src/some-component.tsx": `
          useEffect(() => {}, [myForm.store]);
        `,
      },
    },
  ],
  mustPass: [
    {
      why: "#1506's NEGATIVE control: a `.values` read that is NOT under `.state` is somebody else's object",
      files: {
        "src/some-component.tsx": `
          useEffect(() => {}, [lookup["values"]]);
        `,
      },
    },
    {
      why: "reading other state in deps",
      files: {
        "src/some-component.tsx": `
          useEffect(() => {}, [otherState]);
        `,
      },
    },
  ],
};
