// Trace and cycle state shared by the module-origin traversal's binding and export arms.
import type { Identifier, Node as MorphNode, Symbol as MorphSymbol } from "ts-morph";
import type {
  ReferenceFact,
  ReferenceResolutionServices,
  ReferenceUnresolvedReason,
  ResolvedReferenceFact,
  UnresolvedReferenceFact,
} from "../contract/reference-fact.ts";

export interface ModuleState {
  readonly declarations: MorphNode[];
  readonly visited: Set<object>;
  readonly services: ReferenceResolutionServices;
}

export const moduleState = (services: ReferenceResolutionServices): ModuleState => ({ declarations: [], visited: new Set<object>(), services });
export const cloneModuleState = (input: ModuleState): ModuleState => ({
  ...input,
  declarations: [...input.declarations],
  visited: new Set(input.visited),
});

function appendDeclaration(target: ModuleState, declaration: MorphNode): void {
  if (!target.declarations.some((existing) => existing.compilerNode === declaration.compilerNode)) {
    target.declarations.push(declaration);
  }
}

export function appendTrace(target: ModuleState, declarations: readonly MorphNode[]): void {
  for (const declaration of declarations) {
    appendDeclaration(target, declaration);
  }
}

export function enterDeclaration(target: ModuleState, declaration: MorphNode): boolean {
  const identity: object = declaration.compilerNode;
  if (target.visited.has(identity)) {
    return false;
  }
  target.visited.add(identity);
  appendDeclaration(target, declaration);
  return true;
}

export function enterSymbol(target: ModuleState, symbol: MorphSymbol): boolean {
  const identity: object = symbol.compilerSymbol;
  if (target.visited.has(identity)) {
    return false;
  }
  target.visited.add(identity);
  return true;
}

export function resolved<T>(value: T, target: ModuleState, origin: MorphNode): ResolvedReferenceFact<T> {
  return { kind: "resolved", value, trace: { declarations: [...target.declarations], origin } };
}

export function unresolved(reason: ReferenceUnresolvedReason, node: MorphNode, target: ModuleState, detail: string): UnresolvedReferenceFact {
  return { kind: "unresolved", reason, detail, node, trace: { declarations: [...target.declarations], origin: node } };
}

export function mergeUnresolved(fact: UnresolvedReferenceFact, target: ModuleState): UnresolvedReferenceFact {
  appendTrace(target, fact.trace.declarations);
  return unresolved(fact.reason, fact.node, target, fact.detail);
}

export function inspectStableBinding(declaration: MorphNode, target: ModuleState): UnresolvedReferenceFact | undefined {
  if (!enterDeclaration(target, declaration)) {
    return unresolved("cycle", declaration, target, `binding cycle at ${declaration.getText()}`);
  }
  const fact = target.services.inspectStableBinding(declaration);
  appendTrace(target, fact.trace.declarations);
  return fact.kind === "unresolved" ? mergeUnresolved(fact, target) : undefined;
}

export function declarationOf(identifier: Identifier, target: ModuleState): ReferenceFact<MorphNode> {
  const fact = target.services.declarationOf(identifier);
  return fact.kind === "unresolved" ? mergeUnresolved(fact, target) : resolved(fact.value, target, fact.value);
}
