// RED when a single `features/**` function body calls BOTH a structural array op (pushFieldValue /
// removeFieldValue / insertFieldValue / moveFieldValues) AND `handleSubmit` — the retired §7-trap
// call-site flush (autosave-form-doctrine.md §7 G-A). The session-boundary factory's store-subscription save
// driver persists structural array edits like any keystroke, so a hand `form.handleSubmit()` beside an array
// op is at best a redundant double-submit.
//
// TWO THINGS THE LEGACY GATE OWNED THAT A POLICY MAY NOT. First, a PRIVATE RECURSIVE `getChildren` collector
// that walked each function's own descendants and stopped at nested functions — gate modules do not walk.
// The scope is now derived the other way round: every call the dispatcher delivers is grouped by its
// INNERMOST enclosing function-like ancestor, which yields exactly the same per-body partition (a nested
// function's calls belong to IT), by bounded ancestor navigation on one delivered node. Second, method
// identity by NAME — "receivers are seen through wraps" was true but "receiver-blind", so any object with a
// `pushFieldValue` method was the form api. The members are now resolved to `@tanstack/form-core`'s FormApi.
//
// THREE ANSWERS: two proven form-api calls in one body are the finding; a proven different receiver passes;
// a call the checker cannot place counts as its op and carries the unreadable message (§5, #944) — the
// fail-closed direction, because a body that MIGHT hold the retired flush is what this gate exists to catch.
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { classifyOriginRefusal } from "../lib/origin-verdict.ts";
import { readMemberReference } from "../lib/reference-fact.ts";
import { declaredByPackage, resolveTypeMemberOrigin } from "../lib/type-member-origin.ts";
import { LOOKALIKE_HOME, tanstackFormProof, vendorLookalikeProof } from "./_proof/client-vendors.ts";

const ARRAY_OPS: ReadonlySet<string> = new Set(["pushFieldValue", "removeFieldValue", "insertFieldValue", "moveFieldValues"]);
const SUBMIT = "handleSubmit";
const FORM_CORE = "@tanstack/form-core";

const FUNCTION_KINDS: readonly SyntaxKind[] = [
  SyntaxKind.FunctionDeclaration,
  SyntaxKind.FunctionExpression,
  SyntaxKind.ArrowFunction,
  SyntaxKind.MethodDeclaration,
];
const FUNCTION_KIND_SET: ReadonlySet<SyntaxKind> = new Set(FUNCTION_KINDS);

const MESSAGE =
  "this `features/**` function body calls BOTH a structural array op (pushFieldValue / removeFieldValue / insertFieldValue / moveFieldValues) AND `handleSubmit` — the retired §7-trap call-site flush. The autosave factory's store-subscription driver persists structural array edits automatically now, so the manual `form.handleSubmit()` is at best a redundant double-submit (autosave-form-doctrine.md §7).";
const FIX =
  "delete the manual `form.handleSubmit()` — the session-boundary factory's save driver (packages/client/src/forms/editor/create-autosave-entity-form.tsx) autosaves structural array ops; keep `handleSubmit` only in a genuine submit handler that does no array op (autosave-form-doctrine.md §3).";
const UNREADABLE = `${MESSAGE} One of the two calls has a receiver the checker cannot place, so whether it is the form api CANNOT be established — reported rather than passed.`;

interface FormMember {
  readonly name: string;
  readonly node: MorphNode;
  readonly proven: boolean;
}

/** The invoked member of a call whose callee is a property/element read, with its receiver identity. The
 *  receiver CHAIN is irrelevant — only the leaf member names the op, so wrapped/awaited/chained receivers
 *  are all seen, exactly as the legacy comment recorded. */
function formMember(call: MorphNode): FormMember | undefined {
  if (!Node.isCallExpression(call)) {
    return;
  }
  const callee = call.getExpression();
  const read = readMemberReference(callee);
  if (read.kind === "unresolved") {
    return;
  }
  const name = read.value.name;
  if (!(ARRAY_OPS.has(name) || name === SUBMIT)) {
    return;
  }
  const origin = resolveTypeMemberOrigin(callee);
  if (origin.kind === "unresolved") {
    return classifyOriginRefusal(origin.reason, callee) === "unreadable" ? { name, node: call, proven: false } : undefined;
  }
  return declaredByPackage(origin.value.declarations, FORM_CORE) ? { name, node: call, proven: true } : undefined;
}

/** The innermost enclosing function-like node — the body this call belongs to. A nested function opens a
 *  new body, and its calls are grouped under IT, which is the legacy walk's stop-at-nested rule inverted. */
function enclosingBody(node: MorphNode): MorphNode | undefined {
  return node.getFirstAncestor((ancestor) => FUNCTION_KIND_SET.has(ancestor.getKind()));
}

interface BodyState {
  arrayOp?: FormMember;
  submit?: FormMember;
}

export const gate = defineGate({
  id: "no-manual-autosave-flush",
  family: "no-manual-autosave-flush",
  authority: "ordinary",
  severity: "error",
  population: { in: ["@client"], under: ["packages/client/src/features/**"] },
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const bodies = new Map<object, BodyState>();
    const order: object[] = [];
    return {
      visitors: [
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node): void => {
            const member = formMember(node);
            const body = member === undefined ? undefined : enclosingBody(node);
            if (member === undefined || body === undefined) {
              return;
            }
            const key: object = body.compilerNode;
            let state = bodies.get(key);
            if (state === undefined) {
              state = {};
              bodies.set(key, state);
              order.push(key);
            }
            if (member.name === SUBMIT) {
              state.submit ??= member;
            } else {
              state.arrayOp ??= member;
            }
          },
        },
      ],
      evaluate: (): void => {
        for (const key of order) {
          const state = bodies.get(key);
          const arrayOp = state?.arrayOp;
          const submit = state?.submit;
          if (arrayOp === undefined || submit === undefined) {
            continue;
          }
          // Report on the array-op call site — the line the author reconciles against the driver.
          const unreadable = !(arrayOp.proven && submit.proven);
          ctx.report.node(arrayOp.node, {
            ...(unreadable ? { message: UNREADABLE } : {}),
            token: arrayOp.name,
            offset: Math.max(arrayOp.node.getText().lastIndexOf(arrayOp.name), 0),
          });
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        ...tanstackFormProof(),
        "packages/client/src/features/x/lib/x.ts":
          'import type { FormApi } from "@tanstack/form-core";\nexport function onAdd(form: FormApi): void {\n  form.pushFieldValue("items", 1);\n  void form.handleSubmit();\n}\n',
      },
      expect: { count: 1, token: "pushFieldValue" },
      why: "the founding shape — a void-wrapped handleSubmit beside pushFieldValue; the factory's store driver owns persistence now",
    },
    {
      mode: "types",
      files: {
        ...tanstackFormProof(),
        "packages/client/src/features/x/lib/x.ts":
          'import type { FormApi } from "@tanstack/form-core";\nexport const onRemove = async (form: FormApi): Promise<void> => {\n  await form.removeFieldValue("items", 0);\n  await form.handleSubmit();\n};\n',
      },
      expect: { count: 1 },
      why: "an awaited handleSubmit in an ARROW body beside removeFieldValue — awaited plus arrow-body must still be caught",
    },
    {
      mode: "types",
      files: {
        ...tanstackFormProof(),
        "packages/client/src/features/x/lib/x.ts":
          'import type { FormApi } from "@tanstack/form-core";\nexport function onMove(form: FormApi): void {\n  form.moveFieldValues("items", 0, 1);\n  void (form).handleSubmit();\n}\n',
      },
      expect: { count: 1 },
      why: "a parenthesized receiver on handleSubmit beside moveFieldValues — the paren wrap must not hide the flush",
    },
    {
      mode: "types",
      files: {
        ...tanstackFormProof(),
        "packages/client/src/features/x/lib/x.ts":
          'import type { FormApi } from "@tanstack/form-core";\nexport function onAdd(form: FormApi): void {\n  form["pushFieldValue"]("items", 1);\n  void form["handleSubmit"]();\n}\n',
      },
      expect: { count: 1 },
      why: "the COMPUTED-LITERAL spelling of BOTH calls — the legacy `getName()` collector was offered no PropertyAccess at all, so bracket syntax was a whole-body escape (#1506)",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        ...tanstackFormProof(),
        "packages/client/src/features/x/lib/x.ts":
          'import type { FormApi } from "@tanstack/form-core";\nexport function onAdd(form: FormApi): void {\n  form.pushFieldValue("items", 1);\n}\n',
      },
      why: "a structural array op alone — the driver persists it, no flush; legal (autosave-form-doctrine.md §3)",
    },
    {
      mode: "types",
      files: {
        ...tanstackFormProof(),
        "packages/client/src/features/x/lib/x.ts":
          'import type { FormApi } from "@tanstack/form-core";\nexport function onSubmit(form: FormApi, e: { preventDefault: () => void }): void {\n  e.preventDefault();\n  void form.handleSubmit();\n}\n',
      },
      why: "an explicit submit handler with no array op — legal (saved-entity forms, retry affordances)",
    },
    {
      mode: "types",
      files: {
        ...tanstackFormProof(),
        "packages/client/src/features/x/lib/x.ts":
          'import type { FormApi } from "@tanstack/form-core";\nexport function onAdd(form: FormApi): void {\n  form.pushFieldValue("items", 1);\n}\nexport function onSubmit(form: FormApi): void {\n  void form.handleSubmit();\n}\n',
      },
      why: "array op and handleSubmit in SEPARATE sibling functions — the per-function-body scope is real, they must NOT combine",
    },
    {
      mode: "types",
      files: {
        ...tanstackFormProof(),
        "packages/client/src/features/x/lib/x.ts":
          'import type { FormApi } from "@tanstack/form-core";\nexport function outer(form: FormApi): void {\n  form.pushFieldValue("items", 1);\n  const submitLater = (): void => {\n    void form.handleSubmit();\n  };\n  void submitLater;\n}\n',
      },
      why: "the handleSubmit lives in a NESTED function, not the outer body that holds the array op — grouping by INNERMOST enclosing function reproduces the legacy stop-at-nested rule exactly",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/x/lib/x.ts":
          'interface LocalList {\n  pushFieldValue(field: string, value: unknown): void;\n  handleSubmit(): void;\n}\nexport function onAdd(list: LocalList): void {\n  list.pushFieldValue("items", 1);\n  list.handleSubmit();\n}\n',
      },
      why: "SAME METHOD NAMES, LOCAL TYPE: a project object with both members is not the form api, and the legacy receiver-blind name check RED it",
    },
    {
      mode: "types",
      files: {
        ...vendorLookalikeProof(),
        "packages/client/src/features/x/lib/x.ts":
          'import type { FormApi } from "vendor-lookalike";\nexport function onAdd(form: FormApi): void {\n  form.pushFieldValue("items", 1);\n  void form.handleSubmit();\n}\n',
      },
      why: `SAME METHOD NAMES, WRONG PACKAGE: a FormApi declared in ${LOOKALIKE_HOME} is not TanStack Form's, and the doctrine's save driver is TanStack's`,
    },
  ],
});
