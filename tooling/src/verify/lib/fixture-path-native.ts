// Closed fixture grammar questions retain the actual importing owner, including imported const terminals.
// Finite blocking claim (D328): a path origin decided within `FIXTURE_PATH_CLOSURE_HOPS` declaration hops of the
// fixture's calls; one that needs a fact past the bound is an advisory unknown, never a clean pass.
import type { CallExpression, Identifier, Node, SourceFile } from "ts-morph";
import { Node as MorphNode } from "ts-morph";
import type { InventoryInvocationPlan, InventorySpan, NativeInvocationEvidence } from "../../floor/code-facts/semantic-inventory-contract.ts";
import { mapTypeObservationDemand } from "../../floor/code-facts/type-observations-codec.ts";
import { TYPE_OBSERVATION_PROFILE } from "../../floor/code-facts/type-observations-contract.ts";
import { readTypeObservations } from "../../floor/code-facts/type-observations-read.ts";
import type { FixturePathNativeContext, FixturePathNativePass, FixturePathNativeRead } from "../contract/fixture-path-origin.ts";
import { requiredInvocationFact } from "./native-invocation.ts";

/** Declaration hops the fixture closure walks past each nominated call; a read beyond them is unresolved (D328). */
export const FIXTURE_PATH_CLOSURE_HOPS = 2;

export function nativeFixturePathPass(
  ctx: FixturePathNativeContext,
  calls: readonly CallExpression[],
  identifiers: readonly Identifier[],
): FixturePathNativePass {
  const native = ctx.nativeTypes;
  if (native === undefined) {
    throw new Error("native fixture provenance facts are unavailable");
  }
  let plan: InventoryInvocationPlan | undefined;
  let evidence: ReadonlyMap<Node, NativeInvocationEvidence> | undefined;
  const contexts = new Map<SourceFile, FixturePathNativeRead>();
  return {
    prepare: (): void => {
      const exports = [
        ...new Set(
          identifiers.flatMap((identifier): Node[] => {
            const declaration = identifier.getParent();
            if (MorphNode.isFunctionDeclaration(declaration) && declaration.getNameNode() === identifier) {
              return [declaration];
            }
            if (MorphNode.isVariableDeclaration(declaration) && declaration.getNameNode() === identifier) {
              const initializer = declaration.getInitializer();
              const statement = declaration.getVariableStatement();
              if (statement !== undefined && (MorphNode.isArrowFunction(initializer) || MorphNode.isFunctionExpression(initializer))) {
                return [statement];
              }
            }
            return [];
          }),
        ),
      ];
      plan = {
        mode: "types",
        facets: [],
        arguments: [],
        typeObservations: mapTypeObservationDemand<Node, InventorySpan>(
          {
            profile: TYPE_OBSERVATION_PROFILE,
            sources: ctx.files,
            nodes: [],
            questions: [
              { kind: "const-initializers", nodes: identifiers },
              { kind: "symbol-closure", nodes: calls, valueFacets: ["module", "global", "stable"], closureHops: FIXTURE_PATH_CLOSURE_HOPS },
              { kind: "function-exports", nodes: exports },
            ],
          },
          (node) => ({ file: node.getSourceFile().getFilePath().replaceAll("\\", "/"), start: node.getStart(), end: node.getEnd(), kind: node.getKind() }),
        ),
      };
      native.request({ kind: "invocation-evidence", nodes: ctx.files, plan });
    },
    at: (source): FixturePathNativeRead => {
      if (plan === undefined) {
        throw new Error("native fixture provenance demand was not prepared");
      }
      evidence ??= native.invocationEvidence(ctx.files, plan);
      const facts = requiredInvocationFact(evidence, source);
      if (facts.typeObservations === undefined) {
        throw new Error("native fixture provenance source has no importing owner");
      }
      facts.typeObservations.assertNode(source);
      let read = contexts.get(source);
      if (read === undefined) {
        read = { evidence: facts, types: readTypeObservations(facts.typeObservations) };
        contexts.set(source, read);
      }
      return read;
    },
  };
}
