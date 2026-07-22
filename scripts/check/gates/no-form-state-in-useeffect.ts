import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

function isFormStateReference(node: Node): boolean {
  if (!Node.isPropertyAccessExpression(node)) {
    return false;
  }

  const text = node.getText();
  if (text === "form.state.values" || text === "form.store") {
    return true;
  }

  // matches any $_.state.values or $_.store
  if (text.endsWith(".state.values") || text.endsWith(".store")) {
    const exprText = node.getExpression().getText();
    if (exprText.endsWith(".state") && text.endsWith(".state.values")) {
      return true;
    }
    if (text.endsWith(".store")) {
      return true;
    }
  }
  return false;
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
      why: "reading other state in deps",
      files: {
        "src/some-component.tsx": `
          useEffect(() => {}, [otherState]);
        `,
      },
    },
  ],
};
