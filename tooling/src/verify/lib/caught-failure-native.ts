// Closed candidates nominate raw questions once; evaluation retains the original importing world's meaning.
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { InventoryInvocationPlan, NativeInvocationEvidence } from "../../floor/code-facts/semantic-inventory-contract.ts";
import { mapTypeObservationDemand } from "../../floor/code-facts/type-observations-codec.ts";
import type { NativeTypeObservations, TypeObservationReader } from "../../floor/code-facts/type-observations-contract.ts";
import { TYPE_OBSERVATION_PROFILE } from "../../floor/code-facts/type-observations-contract.ts";
import { readTypeObservations } from "../../floor/code-facts/type-observations-read.ts";
import type { CaughtFailureReadServices, NativeFailureContext, NativeFailureRead } from "../contract/caught-failure.ts";
import { FAILURE_OUTCOME_DISCRIMINANTS, FAILURE_OUTCOME_OK_MEMBER, PROMISE_LIKE_MEMBER } from "./caught-failure-read.ts";

// Exactly the member reads the caught-failure reader repeats; every other member read refuses at replay.
const MEMBERS = { callLiteralMembers: [FAILURE_OUTCOME_OK_MEMBER, ...FAILURE_OUTCOME_DISCRIMINANTS], presenceMembers: [PROMISE_LIKE_MEMBER] };

function heldBindings(nodes: readonly MorphNode[]): readonly MorphNode[] {
  const bindings = new Set<MorphNode>();
  for (const node of nodes) {
    if (!Node.isCallExpression(node)) {
      continue;
    }
    const declaration = node.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
    const initializer = declaration?.getInitializer();
    if (initializer !== undefined && initializer.getStart() <= node.getStart() && initializer.getEnd() >= node.getEnd()) {
      const name = declaration?.getNameNode();
      if (name !== undefined) {
        for (const identifier of [name, ...name.getDescendants()].filter(Node.isIdentifier)) {
          bindings.add(identifier);
        }
      }
    }
  }
  return [...bindings];
}

export function nativeFailureRead(
  context: NativeFailureContext,
  nominees: () => readonly MorphNode[],
  tracingSources: readonly SourceFile[] = [],
): NativeFailureRead {
  const native = context.nativeTypes;
  if (native === undefined) {
    throw new Error("native failure/tracing facts are unavailable");
  }
  let plan: InventoryInvocationPlan | undefined;
  let evidence: ReadonlyMap<MorphNode, NativeInvocationEvidence> | undefined;
  const readers = new Map<NativeTypeObservations, TypeObservationReader>();
  const references = (node: MorphNode): readonly MorphNode[] => {
    const result = native.references([node], node.getSourceFile()).get(node);
    if (result === undefined) {
      throw new Error("native failure strict reference answer is missing");
    }
    return result;
  };
  return {
    prepare: (): void => {
      const candidates = nominees();
      const roots = [...new Set(candidates.map((node) => (Node.isCatchClause(node) ? (node.getParentIfKind(SyntaxKind.TryStatement) ?? node) : node)))];
      const bindings = heldBindings(candidates);
      const functions = tracingSources.flatMap((source) => source.getFunctions());
      plan = {
        mode: "types",
        facets: [],
        arguments: [],
        typeObservations: mapTypeObservationDemand(
          {
            profile: TYPE_OBSERVATION_PROFILE,
            sources: context.files,
            nodes: [],
            questions: [
              { kind: "symbol-closure", nodes: [...roots, ...functions], ...MEMBERS },
              { kind: "reference-closure", nodes: bindings, ...MEMBERS },
              { kind: "function-exports", nodes: functions },
            ],
          },
          (node) => ({ file: node.getSourceFile().getFilePath().replaceAll("\\", "/"), start: node.getStart(), end: node.getEnd(), kind: node.getKind() }),
        ),
      };
      native.request({ kind: "invocation-evidence", nodes: context.files, plan });
      for (const importer of context.files) {
        const nodes = bindings.filter((node) => node.getSourceFile() === importer);
        if (nodes.length > 0) {
          native.request({ kind: "references", nodes, importer });
        }
      }
    },
    at: (source): CaughtFailureReadServices => {
      if (plan === undefined) {
        throw new Error("native failure/tracing demand was not prepared");
      }
      evidence ??= native.invocationEvidence(context.files, plan);
      const facts = evidence.get(source)?.typeObservations;
      if (facts === undefined) {
        throw new Error("failure/tracing source has no native importing owner");
      }
      let types = readers.get(facts);
      if (types === undefined) {
        types = readTypeObservations(facts, references);
        readers.set(facts, types);
      }
      return { types, references };
    },
  };
}
