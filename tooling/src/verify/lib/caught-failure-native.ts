// Closed candidates nominate raw questions once; evaluation retains the original importing world's meaning.
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { withinClosureBound } from "../../floor/code-facts/bounded-closure.ts";
import type { InventoryInvocationPlan, NativeInvocationEvidence } from "../../floor/code-facts/semantic-inventory-contract.ts";
import { mapTypeObservationDemand } from "../../floor/code-facts/type-observations-codec.ts";
import type { NativeTypeObservations, TypeObservationReader } from "../../floor/code-facts/type-observations-contract.ts";
import { TYPE_OBSERVATION_PROFILE } from "../../floor/code-facts/type-observations-contract.ts";
import { readTypeObservations } from "../../floor/code-facts/type-observations-read.ts";
import type { CaughtFailureReadServices, NativeFailureContext, NativeFailureRead } from "../contract/caught-failure.ts";
import { unwrapExpression } from "./ast-read.ts";
import type { CaughtFailureSite } from "./caught-failure.ts";
import { caughtFailureSite } from "./caught-failure.ts";
import { REJECTION_INVOCATION_MEMBERS } from "./caught-failure-core.ts";
import { caughtFailureScope } from "./caught-failure-identity.ts";
import { CAUGHT_FAILURE_CLOSURE_HOPS, FAILURE_OUTCOME_DISCRIMINANTS, FAILURE_OUTCOME_OK_MEMBER, PROMISE_LIKE_MEMBER } from "./caught-failure-read.ts";

// Exactly the member reads the caught-failure reader repeats; every other member read refuses at replay.
const MEMBERS = {
  callLiteralMembers: [FAILURE_OUTCOME_OK_MEMBER, ...FAILURE_OUTCOME_DISCRIMINANTS],
  presenceMembers: [PROMISE_LIKE_MEMBER],
  closureHops: CAUGHT_FAILURE_CLOSURE_HOPS,
  closureArgumentBodiesOnly: true,
};

interface NominatedRoots {
  /** Sites the reader judges past syntax: try statements and calls it can read as rejection invocations. */
  readonly roots: readonly MorphNode[];
  /** The candidate calls themselves, whose held bindings the reference closure follows. */
  readonly calls: readonly MorphNode[];
  /** Identifier callees of every other call, whose declaration alone tells the reader the call is no alias. */
  readonly callees: readonly MorphNode[];
}

/** Same-file names a call can invoke as a bound rejection alias: a variable initialized by a call. */
function callInitializedNames(source: SourceFile): ReadonlySet<string> {
  return new Set(
    source
      .getDescendantsOfKind(SyntaxKind.VariableDeclaration)
      .filter((declaration) => Node.isCallExpression(declaration.getInitializer()))
      .map((declaration) => declaration.getName()),
  );
}

/** Splits nominees into closure roots and callee-only questions, mirroring `promiseRejectionInvocation`. */
function nominatedRoots(nominees: readonly MorphNode[]): NominatedRoots {
  const roots = new Set<MorphNode>();
  const calls: MorphNode[] = [];
  const callees: MorphNode[] = [];
  const aliases = new Map<SourceFile, ReadonlySet<string>>();
  for (const node of nominees) {
    if (Node.isCatchClause(node)) {
      roots.add(node.getParentIfKind(SyntaxKind.TryStatement) ?? node);
      continue;
    }
    if (!Node.isCallExpression(node)) {
      continue;
    }
    const callee = unwrapExpression(node.getExpression());
    const source = node.getSourceFile();
    const names = aliases.get(source) ?? callInitializedNames(source);
    aliases.set(source, names);
    if (
      Node.isElementAccessExpression(callee) ||
      (Node.isPropertyAccessExpression(callee) && REJECTION_INVOCATION_MEMBERS.has(callee.getName())) ||
      (Node.isIdentifier(callee) && names.has(callee.getText()))
    ) {
      // The reader climbs from the call through its wrappers and consumers up to the enclosing statement.
      roots.add(node.getFirstAncestor(Node.isStatement) ?? node);
      calls.push(node);
    } else if (Node.isIdentifier(callee)) {
      callees.push(callee);
    }
  }
  return { roots: [...roots], calls, callees };
}

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
      const { roots, calls, callees } = nominatedRoots(nominees());
      const bindings = heldBindings(calls);
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
              { kind: "node-symbols", nodes: callees },
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

/** The census joins' view of delivered nominees: resolved sites by path, and the id scopes an unresolved site leaves unknown. */
export interface BoundedFailureSites {
  readonly sitesByPath: ReadonlyMap<string, readonly CaughtFailureSite[]>;
  readonly uncertainScopes: readonly string[];
}

/** Classifies each nominee; an unresolved one is reported as an analysis unknown and withholds its scope from the join. */
export function boundedFailureSites(
  nominees: readonly MorphNode[],
  native: NativeFailureRead,
  relativePath: (source: SourceFile) => string,
  unknown: (node: MorphNode, reason: string) => void,
): BoundedFailureSites {
  const sitesByPath = new Map<string, CaughtFailureSite[]>();
  const uncertainScopes: string[] = [];
  for (const node of nominees) {
    const path = relativePath(node.getSourceFile());
    const reads = native.at(node.getSourceFile());
    const verdict = withinClosureBound(() => caughtFailureSite(node, reads));
    if (verdict.kind === "unresolved") {
      unknown(node, verdict.reason);
      uncertainScopes.push(caughtFailureScope(path, node));
    } else if (verdict.value !== undefined) {
      sitesByPath.set(path, [...(sitesByPath.get(path) ?? []), verdict.value]);
    }
  }
  return { sitesByPath, uncertainScopes };
}
