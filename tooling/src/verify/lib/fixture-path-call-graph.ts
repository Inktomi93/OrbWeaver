// Complete same-source helper callers for fixture path provenance. This is an internal reader component:
// it consumes nodes supplied by the policy walk and never opens a Project or traverses descendants.
import type { ArrowFunction, CallExpression, FunctionDeclaration, FunctionExpression, Identifier, Node as MorphNode, ParameterDeclaration } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { referenceResolutionServices } from "../../floor/code-facts/reference-fact.ts";
import type { FixturePathNativeRead } from "../contract/fixture-path-origin.ts";
import { fixtureSymbol } from "./fixture-path-semantic.ts";

type FunctionNode = FunctionDeclaration | ArrowFunction | FunctionExpression | import("ts-morph").MethodDeclaration;

export interface FixturePathCallGraph {
  readonly visitCall: (call: CallExpression) => void;
  readonly visitIdentifier: (identifier: Identifier) => void;
  readonly finish: () => void;
  readonly parameterArguments: (parameter: ParameterDeclaration) => readonly MorphNode[] | undefined;
}

function unwrap(node: MorphNode): MorphNode {
  return referenceResolutionServices.unwrapExpression(node);
}

function symbolIdentity(identifier: Identifier, read?: FixturePathNativeRead): object | undefined {
  return fixtureSymbol(identifier, read);
}

function functionOfDeclaration(declaration: MorphNode): FunctionNode | undefined {
  if (
    Node.isFunctionDeclaration(declaration) ||
    Node.isArrowFunction(declaration) ||
    Node.isFunctionExpression(declaration) ||
    Node.isMethodDeclaration(declaration)
  ) {
    return declaration;
  }
  if (Node.isVariableDeclaration(declaration)) {
    const initializer = declaration.getInitializer();
    return initializer !== undefined && (Node.isArrowFunction(initializer) || Node.isFunctionExpression(initializer)) ? initializer : undefined;
  }
  // biome-ignore lint/complexity/noUselessUndefined: tsconfig enables noImplicitReturns.
  return undefined;
}

function declarationName(fn: FunctionNode): Identifier | undefined {
  if (Node.isFunctionDeclaration(fn) || Node.isFunctionExpression(fn) || Node.isMethodDeclaration(fn)) {
    const name = fn.getNameNode();
    return name !== undefined && Node.isIdentifier(name) ? name : undefined;
  }
  const declaration = fn.getParentIfKind(SyntaxKind.VariableDeclaration);
  const name = declaration?.getNameNode();
  return name !== undefined && Node.isIdentifier(name) ? name : undefined;
}

function functionOfParameter(parameter: ParameterDeclaration): FunctionNode | undefined {
  const parent = parameter.getParent();
  return Node.isFunctionLikeDeclaration(parent) ? (parent as FunctionNode) : undefined;
}

export function createFixturePathCallGraph(read?: FixturePathNativeRead): FixturePathCallGraph {
  const calls: CallExpression[] = [];
  const identifiersBySymbol = new Map<object, Identifier[]>();
  const callsByFunction = new Map<object, CallExpression[]>();

  function calleeFunction(call: CallExpression): FunctionNode | undefined {
    const expression = unwrap(call.getExpression());
    if (!Node.isIdentifier(expression)) {
      return;
    }
    const declarations = read === undefined ? (expression.getSymbol()?.getDeclarations() ?? []) : read.evidence.declarations(expression);
    const functions = declarations.flatMap((declaration) => {
      const fn = functionOfDeclaration(declaration);
      return fn === undefined ? [] : [fn];
    });
    const identities = new Set(functions.map((fn) => fn.compilerNode));
    return identities.size === 1 ? functions[0] : undefined;
  }

  function visitCall(call: CallExpression): void {
    calls.push(call);
  }

  function visitIdentifier(identifier: Identifier): void {
    const identity = symbolIdentity(identifier, read);
    if (identity !== undefined) {
      const sites = identifiersBySymbol.get(identity) ?? [];
      sites.push(identifier);
      identifiersBySymbol.set(identity, sites);
    }
  }

  function finishCallIndex(): void {
    if (callsByFunction.size > 0) {
      return;
    }
    for (const call of calls) {
      const fn = calleeFunction(call);
      if (fn !== undefined) {
        const sites = callsByFunction.get(fn.compilerNode) ?? [];
        sites.push(call);
        callsByFunction.set(fn.compilerNode, sites);
      }
    }
  }

  function exported(node: FunctionDeclaration | import("ts-morph").VariableStatement): boolean {
    return read === undefined ? node.isExported() : read.types.functionExport(node);
  }

  function callableIsClosed(fn: FunctionNode): boolean {
    const name = declarationName(fn);
    if (name === undefined || (Node.isFunctionDeclaration(fn) && exported(fn))) {
      return false;
    }
    const variable = fn.getParentIfKind(SyntaxKind.VariableDeclaration);
    const statement = variable?.getVariableStatement();
    if (statement !== undefined && exported(statement)) {
      return false;
    }
    const identity = symbolIdentity(name, read);
    if (identity === undefined) {
      return false;
    }
    const callExpressions = new Set((callsByFunction.get(fn.compilerNode) ?? []).map((call) => unwrap(call.getExpression()).compilerNode));
    const references = identifiersBySymbol.get(identity) ?? [];
    return references.every((identifier) => identifier.compilerNode === name.compilerNode || callExpressions.has(identifier.compilerNode));
  }

  function parameterArguments(parameter: ParameterDeclaration): readonly MorphNode[] | undefined {
    finishCallIndex();
    const fn = functionOfParameter(parameter);
    if (fn === undefined || !callableIsClosed(fn)) {
      return;
    }
    const position = fn.getParameters().findIndex((candidate) => candidate.compilerNode === parameter.compilerNode);
    const sites = callsByFunction.get(fn.compilerNode) ?? [];
    if (position < 0 || sites.length === 0) {
      return;
    }
    const fallback = parameter.getInitializer();
    const args = sites.map((site) => site.getArguments()[position] ?? fallback);
    return args.every((argument) => argument !== undefined) ? (args as MorphNode[]) : undefined;
  }

  return { visitCall, visitIdentifier, finish: finishCallIndex, parameterArguments };
}
