import type { Type } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { SourceCorpus } from "../../_shared/ts-workspace.ts";
import { declKey } from "./keys.ts";

const CONTRACTS_SRC_PREFIX = "/packages/contracts/src/";
const WORKSPACE_SRC_PREFIX = "/packages/";

export interface AppRouterOutputProvenance {
  readonly contractKeys: ReadonlySet<string>;
  readonly unresolvedProcedures: readonly string[];
}

export interface AppRouterProcedureDeclaration {
  readonly full: string;
  readonly decl: Node;
}

type ContractTypeIndex = ReadonlyMap<unknown, ReadonlySet<string>>;

interface ProvenanceState {
  readonly keys: Set<string>;
  readonly seen: Set<unknown>;
  readonly contractTypes: ContractTypeIndex;
}

function contractTypeIndex(project: SourceCorpus): ContractTypeIndex {
  const index = new Map<unknown, Set<string>>();
  for (const sourceFile of project.getSourceFiles()) {
    if (!sourceFile.getFilePath().includes(CONTRACTS_SRC_PREFIX)) {
      continue;
    }
    for (const declarations of sourceFile.getExportedDeclarations().values()) {
      for (const declaration of declarations) {
        const compilerType = declaration.getType().compilerType;
        const keys = index.get(compilerType) ?? new Set<string>();
        keys.add(declKey(declaration));
        index.set(compilerType, keys);
      }
    }
  }
  return index;
}

function appRouterDeclaration(project: SourceCorpus): Node | undefined {
  const matches: Node[] = [];
  for (const sourceFile of project.getSourceFiles()) {
    for (const declaration of sourceFile.getTypeAliases()) {
      if (declaration.getName() === "AppRouter" && declaration.isExported()) {
        matches.push(declaration);
      }
    }
  }
  return matches.length === 1 ? matches[0] : undefined;
}

function propertyType(type: Type, name: string, location: Node): Type | undefined {
  const property = type.getProperty(name);
  return property?.getTypeAtLocation(property.getValueDeclaration() ?? property.getDeclarations()[0] ?? location);
}

function procedureOutputType(root: Type, path: string, location: Node): Type | undefined {
  let current = root;
  for (const part of path.split(".")) {
    const next = propertyType(current, part, location);
    if (next === undefined) {
      return;
    }
    current = next;
  }
  const definition = propertyType(current, "_def", location);
  const types = definition === undefined ? undefined : propertyType(definition, "$types", location);
  return types === undefined ? undefined : propertyType(types, "output", location);
}

function recordContractDeclarations(type: Type, keys: Set<string>): readonly Node[] {
  const declarations = (type.getAliasSymbol() ?? type.getSymbol())?.getDeclarations() ?? [];
  for (const declaration of declarations) {
    if (declaration.getSourceFile().getFilePath().includes(CONTRACTS_SRC_PREFIX)) {
      keys.add(declKey(declaration));
    }
  }
  return declarations;
}

function aliasDerivesFromKnown(alias: Node, keys: ReadonlySet<string>): boolean {
  if (!Node.isTypeAliasDeclaration(alias)) {
    return false;
  }
  const typeNode = alias.getTypeNode();
  return (
    typeNode?.getDescendantsOfKind(SyntaxKind.TypeQuery).some((query) => {
      const symbol = query.getExprName().getSymbol();
      return ((symbol?.getAliasedSymbol() ?? symbol)?.getDeclarations() ?? []).some((declaration) => keys.has(declKey(declaration)));
    }) ?? false
  );
}

function addDerivedContractAliases(project: SourceCorpus, keys: Set<string>): void {
  let changed = true;
  while (changed) {
    changed = false;
    for (const sourceFile of project.getSourceFiles()) {
      if (!sourceFile.getFilePath().includes(CONTRACTS_SRC_PREFIX)) {
        continue;
      }
      for (const alias of sourceFile.getTypeAliases()) {
        const key = declKey(alias);
        if (aliasDerivesFromKnown(alias, keys) && !keys.has(key)) {
          keys.add(key);
          changed = true;
        }
      }
    }
  }
}

function collectTypeProvenance(type: Type, location: Node, state: ProvenanceState): void {
  if (state.seen.has(type.compilerType)) {
    return;
  }
  state.seen.add(type.compilerType);

  for (const key of state.contractTypes.get(type.compilerType) ?? []) {
    state.keys.add(key);
  }

  const declarations = recordContractDeclarations(type, state.keys);
  for (const constituent of [...type.getUnionTypes(), ...type.getIntersectionTypes(), ...type.getTypeArguments()]) {
    collectTypeProvenance(constituent, location, state);
  }
  const arrayElement = type.getArrayElementType();
  if (arrayElement !== undefined) {
    collectTypeProvenance(arrayElement, location, state);
    return;
  }
  for (const tupleElement of type.getTupleElements()) {
    collectTypeProvenance(tupleElement, location, state);
  }

  if (!type.isObject() || type.getCallSignatures().length > 0) {
    return;
  }
  const sourcePaths = declarations.map((declaration) => declaration.getSourceFile().getFilePath());
  if (sourcePaths.length > 0 && sourcePaths.every((path) => !path.includes(WORKSPACE_SRC_PREFIX))) {
    return;
  }
  for (const property of type.getProperties()) {
    const propertyLocation = property.getValueDeclaration() ?? property.getDeclarations()[0] ?? location;
    collectTypeProvenance(property.getTypeAtLocation(propertyLocation), propertyLocation, state);
  }
}

function collectContractTypeReferences(node: Node, keys: Set<string>): void {
  for (const reference of [node, ...node.getDescendants()].filter(Node.isTypeReference)) {
    const symbol = reference.getTypeName().getSymbol();
    for (const declaration of (symbol?.getAliasedSymbol() ?? symbol)?.getDeclarations() ?? []) {
      if (declaration.getSourceFile().getFilePath().includes(CONTRACTS_SRC_PREFIX)) {
        keys.add(declKey(declaration));
      }
    }
  }
}

function declaredReturnSurface(declaration: Node): Node | undefined {
  if (Node.isFunctionLikeDeclaration(declaration)) {
    return declaration.getReturnTypeNode();
  }
  if (Node.isFunctionTypeNode(declaration)) {
    return declaration.getReturnTypeNode();
  }
  return Node.isPropertySignature(declaration) ? declaration.getTypeNode() : undefined;
}

function unwrapPromise(type: Type): Type {
  return type.getSymbol()?.getName() === "Promise" ? (type.getTypeArguments()[0] ?? type) : type;
}

interface ProcedureTrace {
  readonly output: Type;
  readonly provenance: ProvenanceState;
  readonly seenCalls: Set<Node>;
  readonly seenDeclarations: Set<Node>;
  readonly seenFunctions: Set<Node>;
  readonly implementations: DeclarationImplementations;
}

interface DeclarationImplementations {
  readonly candidatesByName: ReadonlyMap<string, readonly Node[]>;
  readonly resolved: Map<unknown, readonly Node[]>;
}

function declarationName(declaration: Node): string | undefined {
  return Node.isPropertySignature(declaration) ||
    Node.isMethodSignature(declaration) ||
    Node.isFunctionDeclaration(declaration) ||
    Node.isVariableDeclaration(declaration) ||
    Node.isPropertyAssignment(declaration)
    ? declaration.getName()
    : undefined;
}

function implementationIndex(project: SourceCorpus): DeclarationImplementations {
  const candidatesByName = new Map<string, Node[]>();
  const add = (name: string, initializer: Node | undefined): void => {
    if (initializer === undefined || !Node.isFunctionLikeDeclaration(initializer)) {
      return;
    }
    const candidates = candidatesByName.get(name) ?? [];
    candidates.push(initializer);
    candidatesByName.set(name, candidates);
  };
  for (const sourceFile of project.getSourceFiles()) {
    if (!sourceFile.getFilePath().includes("/packages/server/src/")) {
      continue;
    }
    for (const variable of sourceFile.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
      add(variable.getName(), variable.getInitializer());
    }
    for (const property of sourceFile.getDescendantsOfKind(SyntaxKind.PropertyAssignment)) {
      add(property.getName(), property.getInitializer());
    }
  }
  return { candidatesByName, resolved: new Map() };
}

function implementationsOf(declaration: Node, index: DeclarationImplementations): readonly Node[] {
  const key = declaration.compilerNode;
  const cached = index.resolved.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const name = declarationName(declaration);
  const matches =
    name === undefined
      ? []
      : (index.candidatesByName.get(name) ?? []).filter((candidate) => {
          const contextual =
            (Node.isArrowFunction(candidate) || Node.isFunctionExpression(candidate) ? candidate.getContextualType() : undefined) ?? candidate.getType();
          return contextual.getCallSignatures().some((signature) => {
            const signatureDeclaration = signature.getDeclaration();
            return (
              signatureDeclaration.compilerNode === declaration.compilerNode ||
              signatureDeclaration.getFirstAncestorByKind(SyntaxKind.PropertySignature)?.compilerNode === declaration.compilerNode
            );
          });
        });
  index.resolved.set(key, matches);
  return matches;
}

function recordAssignableReturn(type: Type, surface: Node, trace: ProcedureTrace): void {
  const output = unwrapPromise(type);
  if (!output.isAssignableTo(trace.output)) {
    return;
  }
  collectContractTypeReferences(surface, trace.provenance.keys);
  collectTypeProvenance(output, surface, trace.provenance);
}

function traceFunction(functionLike: Node, trace: ProcedureTrace): void {
  if (!Node.isFunctionLikeDeclaration(functionLike) || trace.seenFunctions.has(functionLike)) {
    return;
  }
  trace.seenFunctions.add(functionLike);
  const returnType = functionLike.getReturnTypeNode();
  if (returnType !== undefined) {
    recordAssignableReturn(returnType.getType(), returnType, trace);
  }
  for (const call of functionLike.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    traceCall(call, trace);
  }
}

function traceDeclaration(declaration: Node, trace: ProcedureTrace): void {
  if (trace.seenDeclarations.has(declaration)) {
    return;
  }
  trace.seenDeclarations.add(declaration);

  const returnSurface = declaredReturnSurface(declaration);
  if (returnSurface !== undefined) {
    const signatures = declaration.getType().getCallSignatures();
    if (signatures.length === 0) {
      recordAssignableReturn(returnSurface.getType(), returnSurface, trace);
    } else {
      for (const signature of signatures) {
        recordAssignableReturn(signature.getReturnType(), returnSurface, trace);
      }
    }
  }
  // Stay on forward, procedure-owned edges. A call already resolves to its symbol/signature declarations;
  // walking reverse references here fans each procedure back across every semantic workspace and retains a
  // whole-program language-service graph. It is also less precise: unrelated callers of the same interface
  // member are not provenance for this AppRouter procedure.
  traceFunction(declaration, trace);
  for (const implementation of implementationsOf(declaration, trace.implementations)) {
    traceFunction(implementation, trace);
  }
}

function traceCall(call: Node, trace: ProcedureTrace): void {
  if (!Node.isCallExpression(call) || trace.seenCalls.has(call)) {
    return;
  }
  trace.seenCalls.add(call);
  recordAssignableReturn(call.getType(), call, trace);
  const expression = call.getExpression();
  const symbol = expression.getSymbol();
  const declarations = [
    ...((symbol?.getAliasedSymbol() ?? symbol)?.getDeclarations() ?? []),
    ...expression
      .getType()
      .getCallSignatures()
      .map((signature) => signature.getDeclaration()),
  ];
  for (const declaration of declarations) {
    traceDeclaration(declaration, trace);
    const property = declaration.getFirstAncestorByKind(SyntaxKind.PropertySignature);
    if (property !== undefined) {
      traceDeclaration(property, trace);
    }
  }
}

function collectProcedureDeclarationProvenance(declaration: Node, output: Type, state: ProvenanceState, implementations: DeclarationImplementations): void {
  const trace = {
    output,
    provenance: state,
    seenCalls: new Set<Node>(),
    seenDeclarations: new Set<Node>(),
    seenFunctions: new Set<Node>(),
    implementations,
  } satisfies ProcedureTrace;
  const calls = [declaration, ...declaration.getDescendants()].filter(Node.isCallExpression);
  for (const call of calls) {
    const expression = call.getExpression();
    if (!(Node.isPropertyAccessExpression(expression) && ["query", "mutation", "subscription"].includes(expression.getName()))) {
      continue;
    }
    const callback = call.getArguments().at(-1);
    if (callback === undefined) {
      continue;
    }
    for (const signature of callback.getType().getCallSignatures()) {
      collectTypeProvenance(signature.getReturnType(), callback, state);
    }
    for (const nestedCall of callback.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      traceCall(nestedCall, trace);
    }
  }
}

/**
 * Resolve the named contract declarations carried by client-consumed AppRouter procedure outputs.
 * Every hop uses the TypeScript checker through ts-morph: router properties, procedure output metadata,
 * aliases/re-exports, unions/intersections, generic constituents, arrays/tuples, and nested properties.
 */
export function collectAppRouterOutputProvenance(
  project: SourceCorpus,
  consumedProcedures: ReadonlySet<string>,
  procedureDeclarations: readonly AppRouterProcedureDeclaration[] = [],
): AppRouterOutputProvenance | undefined {
  const appRouter = appRouterDeclaration(project);
  if (appRouter === undefined) {
    return;
  }
  const root = appRouter.getType();
  const contractTypes = contractTypeIndex(project);
  const contractKeys = new Set<string>();
  // Type provenance is intrinsic to the compiler type, not to the procedure that reached it. Sharing this
  // set prevents hundreds of procedures from recursively reopening the same nested contract graph.
  const seenTypes = new Set<unknown>();
  const unresolvedProcedures: string[] = [];
  const implementations = implementationIndex(project);
  const declarationsByProcedure = new Map(procedureDeclarations.map(({ full, decl }) => [full, decl]));
  for (const procedure of [...consumedProcedures].sort()) {
    const output = procedureOutputType(root, procedure, appRouter);
    if (output === undefined) {
      unresolvedProcedures.push(procedure);
      continue;
    }
    const state = { keys: contractKeys, seen: seenTypes, contractTypes } satisfies ProvenanceState;
    collectTypeProvenance(output, appRouter, state);
    const procedureDeclaration = declarationsByProcedure.get(procedure);
    if (procedureDeclaration !== undefined) {
      collectProcedureDeclarationProvenance(procedureDeclaration, output, state, implementations);
    }
  }
  addDerivedContractAliases(project, contractKeys);
  return { contractKeys, unresolvedProcedures };
}
