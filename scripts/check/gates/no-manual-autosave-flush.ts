// Gate: no-manual-autosave-flush — DORMANT (autosave-form-doctrine.md §7 G-A). RED when a single
// `features/**` function body contains BOTH a structural array op (`pushFieldValue` / `removeFieldValue`
// / `insertFieldValue` / `moveFieldValues`) AND a `handleSubmit` call. Post-migration to the session
// boundary (autosave-form-doctrine.md §3), the factory's store-subscription save driver persists
// structural array edits like any keystroke, so a hand `form.handleSubmit()` next to an array op is at
// best a redundant double-submit and at worst the retired §7-trap call-site-flush convention returning.
//
// SCOPE IS PER FUNCTION BODY, and it is REAL: the walk from each function-like node stops at any nested
// function boundary, so an array op in one sibling function and a handleSubmit in another do NOT combine
// (the doctrine's mustPass floor). Receivers are seen THROUGH `void`/`await`/parenthesis wraps and
// through a method chain (`form.x().handleSubmit()`), so the honest-authoring shapes can't slip the
// method-name check — hardening only ever WIDENS detection.
//
// DORMANT because the manual flushes it bans still exist until the D78 SEAL lane's L1–L4 delete them;
// active-now would RED the tree. ACTIVATES AT THE D78 SEAL LANE: flip `status` to "active" and move the
// doc row from the DORMANT table to the ACTIVE table (Core-Enforcement-Active-Gates.md), bumping the
// "(N registered gates)" count by one.
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const ARRAY_OPS = new Set(["pushFieldValue", "removeFieldValue", "insertFieldValue", "moveFieldValues"]);
const SUBMIT = "handleSubmit";

const FUNCTION_KINDS: readonly SyntaxKind[] = [
  SyntaxKind.FunctionDeclaration,
  SyntaxKind.FunctionExpression,
  SyntaxKind.ArrowFunction,
  SyntaxKind.MethodDeclaration,
];

const FUNCTION_KIND_SET = new Set<SyntaxKind>(FUNCTION_KINDS);

const MESSAGE =
  "this `features/**` function body calls BOTH a structural array op (pushFieldValue / removeFieldValue / insertFieldValue / moveFieldValues) AND `handleSubmit` — the retired §7-trap call-site flush. The autosave factory's store-subscription driver persists structural array edits automatically now, so the manual `form.handleSubmit()` is at best a redundant double-submit (autosave-form-doctrine.md §7).";
const FIX =
  "delete the manual `form.handleSubmit()` — the session-boundary factory's save driver (packages/client/src/forms/create-autosave-entity-form.tsx) autosaves structural array ops; keep `handleSubmit` only in a genuine submit handler that does no array op (autosave-form-doctrine.md §3).";

/** The invoked method name of a call whose callee is a property access — `form.pushFieldValue(…)` →
 *  "pushFieldValue", `void form.x().handleSubmit()` → "handleSubmit". Returns undefined for a bare
 *  identifier call or a computed/element access. The receiver chain is irrelevant: only the LEAF
 *  property name identifies the op, so wrapped/awaited/chained receivers are all seen. */
function calledMethodName(call: Node): string | undefined {
  if (!Node.isCallExpression(call)) {
    return;
  }
  const callee = call.getExpression();
  return Node.isPropertyAccessExpression(callee) ? callee.getName() : undefined;
}

/** Walk the descendants of one function-like node that belong to IT — i.e. stop descending into any
 *  nested function so a sibling/inner function's calls never leak into this body's scope. */
function ownCallExpressions(fn: Node): Node[] {
  const calls: Node[] = [];
  for (const child of fn.getChildren()) {
    collectOwnCalls(child, calls);
  }
  return calls;
}

function collectOwnCalls(node: Node, out: Node[]): void {
  // A nested function opens a new body scope — its calls are judged when the walk reaches IT as its own
  // function-like node, never folded into the enclosing body.
  if (FUNCTION_KIND_SET.has(node.getKind())) {
    return;
  }
  if (Node.isCallExpression(node)) {
    out.push(node);
  }
  for (const child of node.getChildren()) {
    collectOwnCalls(child, out);
  }
}

export const gate: GateDescriptor = {
  name: "no-manual-autosave-flush",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3 — DORMANT)",
  status: "dormant",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: FIX,
  scanRoot: (p) => p.startsWith("packages/client/src/features/"),
  kinds: FUNCTION_KINDS,
  visit(node, _sf, ctx): void {
    if (!FUNCTION_KIND_SET.has(node.getKind())) {
      return;
    }
    const calls = ownCallExpressions(node);
    let arrayOp: Node | undefined;
    let submit = false;
    for (const call of calls) {
      const name = calledMethodName(call);
      if (name === undefined) {
        continue;
      }
      if (ARRAY_OPS.has(name)) {
        arrayOp ??= call;
      } else if (name === SUBMIT) {
        submit = true;
      }
    }
    // Report on the array-op call site — that's the line the author must reconcile against the driver.
    if (arrayOp !== undefined && submit) {
      ctx.report(arrayOp);
    }
  },
  mustFlag: [
    {
      files: {
        "packages/client/src/features/x/lib/x.ts":
          "export function onAdd(form: F): void {\n  form.pushFieldValue('items', v);\n  void form.handleSubmit();\n}\n",
      },
      why: "the retired §7-trap call-site flush — void-wrapped handleSubmit next to pushFieldValue; the factory's store driver owns persistence now",
    },
    {
      files: {
        "packages/client/src/features/x/lib/x.ts":
          "export const onRemove = async (form: F): Promise<void> => {\n  form.removeFieldValue('items', i);\n  await form.handleSubmit();\n};\n",
      },
      why: "an awaited handleSubmit in an ARROW body next to removeFieldValue — awaited + arrow-body must still be caught",
    },
    {
      files: {
        "packages/client/src/features/x/lib/x.ts":
          "export function onMove(form: F): void {\n  form.moveFieldValues('items', a, b);\n  (form).handleSubmit();\n}\n",
      },
      why: "a parenthesized receiver on handleSubmit next to moveFieldValues — the paren wrap must not hide the flush",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/client/src/features/x/lib/x.ts": "export function onAdd(form: F): void {\n  form.pushFieldValue('items', v);\n}\n",
      },
      why: "structural array op alone — the driver persists it, no flush; legal (autosave-form-doctrine.md §3)",
    },
    {
      files: {
        "packages/client/src/features/x/lib/x.ts": "export function onSubmit(form: F, e: E): void {\n  e.preventDefault();\n  void form.handleSubmit();\n}\n",
      },
      why: "an explicit submit handler with no array op — legal (saved-entity forms, retry affordances)",
    },
    {
      files: {
        "packages/client/src/features/x/lib/x.ts":
          "export function onAdd(form: F): void {\n  form.pushFieldValue('items', v);\n}\nexport function onSubmit(form: F): void {\n  void form.handleSubmit();\n}\n",
      },
      why: "array op and handleSubmit in SEPARATE sibling functions — the per-function-body scope is real, they must NOT combine",
    },
    {
      files: {
        "packages/client/src/features/x/lib/x.ts":
          "export function outer(form: F): void {\n  form.pushFieldValue('items', v);\n  const submitLater = (): void => {\n    void form.handleSubmit();\n  };\n  void submitLater;\n}\n",
      },
      why: "the handleSubmit lives in a NESTED function, not the outer body that holds the array op — the walk stops at the nested boundary, so they must NOT combine",
    },
  ],
};
