// @subject tooling/src/floor/code-facts/call-returns.ts
// @subject tooling/src/floor/code-facts/value-carrier.ts
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { observeCallReturns, readCallReturnProgram } from "@orb/tooling/floor/code-facts/call-returns";
import {
  beginReferencePass,
  endReferencePass,
  referenceResolutionServices,
  resolveGlobalMemberOrigin,
  resolveStableExpression,
} from "@orb/tooling/floor/code-facts/reference-fact";
import { resolveCallableValueOrigin } from "@orb/tooling/floor/code-facts/reference-fact-call";
import { readNativeStringCallWith } from "@orb/tooling/floor/code-facts/reference-fact-global";
import { readReturnedValue } from "@orb/tooling/floor/code-facts/value-carrier";
import { createSemanticWorkspace } from "@orb/tooling/floor/compiler/ts-workspace";
import type { CallExpression, FunctionDeclaration, Identifier, Node as MorphNode, ParameterDeclaration } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { scaledBudget } from "../../_load-budget.ts";

function actualMetadataCalls(repoRoot: string): {
  readonly target: FunctionDeclaration;
  readonly call: CallExpression;
  readonly native: CallExpression;
  readonly recipe: ParameterDeclaration;
  readonly argument: Identifier;
} {
  const view = createSemanticWorkspace({ root: repoRoot }).program("packages/ui/tsconfig.json");
  const source = view?.sourceFile("packages/ui/src/lib/variant-attrs.ts");
  if (view === undefined || source === undefined) {
    throw new Error("the actual UI native world omitted its metadata producer");
  }
  const target = source.getFunctionOrThrow("resolvedArm");
  const call = source.getFunctionOrThrow("variantAttrs").getDescendantsOfKind(SyntaxKind.CallExpression)[0];
  const native = target.getDescendantsOfKind(SyntaxKind.CallExpression)[0];
  if (call === undefined || native === undefined) {
    throw new Error("the actual producer omitted its arm or native conversion call");
  }
  const recipe = target.getParameters()[0];
  const argument = native.getArguments()[0];
  if (recipe === undefined || !Node.isIdentifier(argument)) {
    throw new Error("the actual producer omitted its supplied recipe or narrowed conversion input");
  }
  return { target, call, native, recipe, argument };
}

test("actual resolvedArm optional projection retains authored absence and native String separately from strict defaults", { timeout: scaledBudget(30_000) }, ({
  repoRoot,
}) => {
  const { target, call, native, recipe, argument } = actualMetadataCalls(repoRoot);
  beginReferencePass();
  try {
    const strict = observeCallReturns([call]);
    const strictProgram = readCallReturnProgram(call, strict);
    const strictAlternatives = strictProgram.kind === "resolved" ? strictProgram.value.byCall.get(call.compilerNode)?.alternatives : undefined;
    expect(strictAlternatives?.kind).toBe("resolved");
    expect(strictAlternatives?.kind === "resolved" && strictAlternatives.value.every((value) => !Object.hasOwn(value, "explicitReturns"))).toBe(true);
    const observations = observeCallReturns([call], undefined, { explicitAbsentReturns: true });
    const captured = readCallReturnProgram(call, observations);
    expect(captured.kind).toBe("resolved");
    const origin = resolveGlobalMemberOrigin(native.getExpression());
    expect(origin.kind).toBe("resolved");
    expect(resolveCallableValueOrigin(native, observations)).toMatchObject({ kind: "unresolved", reason: "ambiguous" });
    const signature = native.getProject().getTypeChecker().getResolvedSignature(native);
    expect(signature?.getDeclaration().getSourceFile().compilerNode !== undefined).toBe(true);
    expect(signature?.getReturnType().isString()).toBe(true);
    const services = { ...referenceResolutionServices, readCallReturnProgram, resolveStableExpression };
    const intrinsic = readNativeStringCallWith(native, observations, services);
    expect(intrinsic.kind, intrinsic.kind === "unresolved" ? intrinsic.detail : "").toBe("resolved");
    if (intrinsic.kind === "unresolved") {
      throw new Error(intrinsic.detail);
    }
    expect(intrinsic.value.program).toBe(captured.kind === "resolved" ? captured.value : undefined);
    expect(intrinsic.value.signature.compilerSignature).toBe(signature?.compilerSignature);
    const terminals = (candidate: CallExpression): boolean => readNativeStringCallWith(candidate, observations, services).kind === "resolved";
    expect(readReturnedValue(call, [], observations, { terminals, bindings: new Map<MorphNode, MorphNode>() })).toMatchObject({
      kind: "unresolved",
      reason: "unsupported",
    });
    const inputs = { terminals, bindings: new Map<MorphNode, MorphNode>(), explicitAbsentReturns: true } as const;
    const optional = readReturnedValue(call, [], observations, inputs);
    expect(optional.kind).toBe("resolved");
    if (optional.kind === "unresolved" || captured.kind === "unresolved") {
      throw new Error(optional.kind === "unresolved" ? optional.detail : "missing captured program");
    }
    const absent = optional.value.filter((leaf) => !leaf.present);
    expect(absent).toHaveLength(2);
    for (const leaf of absent) {
      expect(Node.isReturnStatement(leaf.value) && leaf.value.getExpression() === undefined).toBe(true);
      expect(leaf.value.getFirstAncestorByKind(SyntaxKind.FunctionDeclaration)).toBe(target);
      const epoch = readCallReturnProgram(leaf.value, observations);
      expect(epoch.kind).toBe("resolved");
      expect(epoch.kind === "resolved" ? epoch.value : undefined).toBe(captured.value);
      expect(leaf.bindings.get(recipe)).toBe(call.getArguments()[0]);
    }
    expect(optional.value.filter((leaf) => leaf.present && leaf.value.compilerNode === native.compilerNode)).toHaveLength(1);
    expect(optional.value.filter((leaf) => leaf.present && leaf.value.getType().isUndefined())).toHaveLength(1);
    expect(referenceResolutionServices.inspectReferenceWrites(argument)).toMatchObject({ kind: "resolved" });
  } finally {
    endReferencePass();
  }
});
