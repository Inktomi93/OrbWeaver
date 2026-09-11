// Gate: no-form-state-in-useeffect (UI-Lib-TanStack-Form.md) — `useEffect` reading `form.state.values` /
// `form.store` in its dep array is the pre-listener anti-pattern: re-renders the whole component on every
// keystroke and can clobber unsaved typing on a refetch. Use form-level `listeners.onChange` with
// `onChangeDebounceMs`, or `form.Subscribe` for UI-only reactivity (docs/architecture/history/
// UI-Lib-TanStack-Form.md).
//
// THE SUBJECT IS THE READ, NOT ITS SPELLING (#1506): `form.state.values` and `form["state"]["values"]` are
// the same dependency and the same defect, so the member chain is read through `lib/symbol-reference.ts`
// (`readMemberAccess`), never `PropertyAccessExpression.getText()`.
//
// THE SANCTIONED INVERSION: the legacy shape visited `useEffect(...)` calls and then `deps.forEachDescendant`
// over the second-argument array literal — a private descendant walk the final query boundary forbids. The
// final walk subscribes directly to `MEMBER_ACCESS_KINDS` (the SAME shared dispatch every gate rides) and
// climbs each occurrence's OWN ancestor chain to ask whether it sits inside a `useEffect(fn, deps)`
// second-argument array literal — an ancestor check, not a descendant walk, and it needs no module state.
import type { Node } from "ts-morph";
import { Node as MorphNode, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { MEMBER_ACCESS_KINDS, readMemberAccess } from "../lib/symbol-reference.ts";

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

/** Does this occurrence sit inside the second-argument array literal of a `useEffect(fn, deps)` call, at
 *  ANY nesting depth? An ancestor climb, never a descendant walk. */
function isInUseEffectDeps(node: Node): boolean {
  for (const ancestor of node.getAncestors()) {
    if (!MorphNode.isArrayLiteralExpression(ancestor)) {
      continue;
    }
    const call = ancestor.getParentIfKind(SyntaxKind.CallExpression);
    if (call === undefined) {
      continue;
    }
    const args = call.getArguments();
    if (args.length !== 2 || args[1] !== ancestor) {
      continue;
    }
    const callee = call.getExpression();
    if (MorphNode.isIdentifier(callee) && callee.getText() === "useEffect") {
      return true;
    }
  }
  return false;
}

const MESSAGE =
  "`useEffect` reading `form.state.values` / `form.store` in its dep array is the pre-listener anti-pattern: re-renders the whole component on every keystroke and can clobber unsaved typing on a refetch. Use form-level `listeners.onChange` with `onChangeDebounceMs` (see docs/architecture/history/UI-Lib-TanStack-Form.md, listeners) — it knows which field changed and runs in the form lifecycle, not the render cycle. For UI-only reactivity, use `form.Subscribe` (same doc, Subscribe).";

export const gate = defineGate({
  id: "no-form-state-in-useeffect",
  family: "no-form-state-in-useeffect",
  authority: "ordinary",
  severity: "error",
  population: { of: "all", why: "a form can be wired into a useEffect from any authored file — the anti-pattern is not tier-scoped" },
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: "use form-level listeners.onChange (with onChangeDebounceMs) or form.Subscribe instead of reading form state in a useEffect dep array.",
  create: (ctx) => ({
    visitors: [
      {
        kinds: MEMBER_ACCESS_KINDS,
        visit: (node) => {
          if (!(isFormStateReference(node) && isInUseEffectDeps(node))) {
            return;
          }
          const token = node.getText();
          ctx.report.node(node, { token, offset: 0 });
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "src/some-component.tsx": "useEffect(() => {}, [form.state.values]);\n" },
      expect: { count: 1 },
      why: "reading form.state.values in deps",
    },
    {
      mode: "source",
      files: { "src/some-component.tsx": 'useEffect(() => {}, [form["state"]["values"]]);\n' },
      expect: { count: 1 },
      why: '#1506: the BRACKET spelling of the same read — `form["state"]["values"]` is the same dependency and the same per-keystroke re-render; it produced ZERO findings before the shared member reader',
    },
    {
      mode: "source",
      files: { "src/some-component.tsx": 'useEffect(() => {}, [form.state["values"]]);\n' },
      expect: { count: 1 },
      why: "#1506: the mixed spelling — one dotted link, one bracket link",
    },
    {
      mode: "source",
      files: { "src/some-component.tsx": "useEffect(() => {}, [myForm.store]);\n" },
      expect: { count: 1 },
      why: "reading myForm.store in deps",
    },
    {
      mode: "source",
      files: { "src/some-component.tsx": "useEffect(() => {}, [form.state.values as unknown]);\n" },
      expect: { count: 1 },
      why: "wrapper-immunity: the visitor subscribes to the member-access node KIND itself, so an `as` cast wrapping it in the deps array does not hide the read",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { "src/some-component.tsx": 'useEffect(() => {}, [lookup["values"]]);\n' },
      why: "#1506's NEGATIVE control: a `.values` read that is NOT under `.state` is somebody else's object",
    },
    {
      mode: "source",
      files: { "src/some-component.tsx": "useEffect(() => {}, [otherState]);\n" },
      why: "reading other state in deps",
    },
    {
      mode: "source",
      files: { "src/some-component.tsx": "useEffect(() => {\n  console.log(form.state.values);\n}, []);\n" },
      why: "declared limit: form.state.values read in the CALLBACK body (args[0]), not the deps array (args[1]) — the ancestor climb only matches the second argument",
    },
  ],
});
