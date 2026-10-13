// Computed effect dependency names use the shared reference reader; native ESLint owns direct syntax.
// Constant aliases and wrapped computed keys remain semantic subjects; callback reads and other arities do not.
// Singleton: only this policy judges resolved computed names in effect dependencies.
import { staticMemberAccess } from "@orb/tooling/floor/code-facts/reference-fact";
import type { Node } from "ts-morph";
import { Node as MorphNode, SyntaxKind } from "ts-morph";
import { LEGACY_TEST_ROOT } from "../../floor/testing/test-population.ts";
import { defineGate } from "../contract/policy.ts";
import { MEMBER_ACCESS_KINDS } from "../lib/symbol-reference.ts";

function memberChain(node: Node): readonly string[] {
  const chain: string[] = [];
  let current: Node = node;
  for (let read = staticMemberAccess(current); read !== undefined; read = staticMemberAccess(current)) {
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

function isUseEffectCallee(callee: Node): boolean {
  return MorphNode.isIdentifier(callee) ? callee.getText() === "useEffect" : staticMemberAccess(callee)?.name === "useEffect";
}

function effectDependencyCallee(node: Node): Node | undefined {
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
    if (isUseEffectCallee(call.getExpression())) {
      return call.getExpression();
    }
  }
  return undefined;
}

function nativeMemberName(node: Node): string | undefined {
  if (MorphNode.isPropertyAccessExpression(node)) {
    return node.getName();
  }
  if (MorphNode.isElementAccessExpression(node)) {
    let key = node.getArgumentExpression();
    while (key !== undefined && MorphNode.isParenthesizedExpression(key)) {
      key = key.getExpression();
    }
    if (key !== undefined && (MorphNode.isStringLiteral(key) || MorphNode.isNoSubstitutionTemplateLiteral(key))) {
      return key.getLiteralValue();
    }
  }
  return undefined;
}

function nativeFormReference(node: Node): boolean {
  const name = nativeMemberName(node);
  if (name === "store") {
    return true;
  }
  const receiver = staticMemberAccess(node)?.receiver;
  return name === "values" && receiver !== undefined && nativeMemberName(receiver) === "state";
}

const MESSAGE = "A computed form dependency resolves to store/state.values in a useEffect dependency array. Use form listeners.onChange or form.Subscribe.";

export const gate = defineGate({
  id: "no-form-state-in-useeffect",
  family: "no-form-state-in-useeffect",
  authority: "ordinary",
  severity: "error",
  population: { of: "all", why: "computed form dependencies can occur in any authored file", notUnder: [`${LEGACY_TEST_ROOT}/**`] },
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: "use listeners.onChange or form.Subscribe; a deliberate occurrence uses `@orb-waive no-form-state-in-useeffect(<position>): <reason>` at the computed member expression.",
  create: (ctx) => ({
    visitors: [
      {
        kinds: MEMBER_ACCESS_KINDS,
        visit: (node) => {
          if (!isFormStateReference(node)) {
            return;
          }
          const callee = effectDependencyCallee(node);
          if (callee === undefined) {
            return;
          }
          const nativeCallee = MorphNode.isIdentifier(callee) ? callee.getText() === "useEffect" : nativeMemberName(callee) === "useEffect";
          // ESLint owns direct syntax; only resolved computed names remain with the shared semantic reader.
          if (nativeCallee && nativeFormReference(node)) {
            return;
          }
          ctx.report.node(node, { token: node.getText(), offset: 0 });
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "src/probe.ts": 'const key = "store"; useEffect(() => {}, [form[key]]);' },
      expect: { count: 1, token: "form[key]" },
      why: "a const-bound member key resolves to the prohibited dependency",
    },
    {
      mode: "source",
      files: { "src/probe.ts": 'const hook = "useEffect"; React[hook](() => {}, [form.state.values]);' },
      expect: { count: 1, token: "form.state.values" },
      why: "a const-bound callee key resolves to the prohibited effect",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { "src/probe.ts": 'useEffect(() => {}, [form.state.values, form["store"]]);' },
      why: "native syntax owns direct dependencies without duplicate custom findings",
    },
    {
      mode: "source",
      files: { "src/probe.ts": 'const key = "values"; useEffect(() => {}, [lookup[key]]);' },
      why: "values without state is not the prohibited dependency",
    },
    {
      mode: "source",
      files: { "src/probe.ts": 'const key = "store"; useEffect(() => {}, [form[key]], extra); useEffect(() => { read(form[key]); }, []);' },
      why: "callback-only reads and three-argument calls remain legal",
    },
    {
      mode: "source",
      files: {
        "src/probe.ts": `const key = "store";
// @orb-waive no-form-state-in-useeffect(form[key]): deliberate computed dependency in this proof.
useEffect(() => {}, [form[key]]);`,
      },
      why: "the ordinary waiver binds the remaining computed expression",
    },
  ],
});
