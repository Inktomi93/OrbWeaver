// The two engines' answers to the symbol questions a slot's origin asks: the TypeScript 7.1 checker batches them, the
// TypeScript 6 checker answers at once. Both report declaration names as sites and read nothing but the checker.
import type { Node, SourceFile } from "@typescript/native/ast";
import { getNameOfDeclaration, getTouchingPropertyName, isCallExpression, isNewExpression, isObjectLiteralExpression } from "@typescript/native/ast";
import type { APIRequestGenerator, Checker, Symbol as NativeSymbol } from "@typescript/native/sync";
import { all, SymbolFlags } from "@typescript/native/sync";
import ts from "typescript";
import type { Site } from "./classify.ts";
import { nameAt } from "./classify.ts";
import type { ServiceWorld } from "./language-service.ts";
import type { NativeWorld } from "./native.ts";
import { hasFlag, propertiesNamed } from "./native.ts";
import type { SlotOracle } from "./union-origins.ts";

// The outermost node starting at `position` that `accept` takes.
function findNative(file: SourceFile, position: number, accept: (node: Node) => boolean): Node | undefined {
  let found: Node | undefined;
  const visit = (node: Node): void => {
    if (found !== undefined || position < node.getStart(file) || position >= node.getEnd()) {
      return;
    }
    if (node.getStart(file) === position && accept(node)) {
      found = node;
    } else {
      node.forEachChild(visit);
    }
  };
  visit(file);
  return found;
}

function findService(file: ts.SourceFile, position: number, accept: (node: ts.Node) => boolean): ts.Node | undefined {
  let found: ts.Node | undefined;
  const visit = (node: ts.Node): void => {
    if (found !== undefined || position < node.getStart(file) || position >= node.getEnd()) {
      return;
    }
    if (node.getStart(file) === position && accept(node)) {
      found = node;
    } else {
      ts.forEachChild(node, visit);
    }
  };
  visit(file);
  return found;
}

const isNativeArgument = (node: Node): boolean => {
  const { parent } = node;
  return (isCallExpression(parent) || isNewExpression(parent)) && (parent.arguments?.some((argument) => argument === node) ?? false);
};

const isServiceArgument = (node: ts.Node): boolean => {
  const { parent } = node;
  return (ts.isCallExpression(parent) || ts.isNewExpression(parent)) && (parent.arguments?.some((argument) => argument === node) ?? false);
};

function* targetOf(checker: Checker, symbol: NativeSymbol | undefined): APIRequestGenerator<NativeSymbol | undefined> {
  if (symbol === undefined || !hasFlag(symbol.flags, SymbolFlags.Alias)) {
    return symbol;
  }
  const target = yield* checker.getAliasedSymbol.gen(symbol);
  return (yield* checker.isUnknownSymbol.gen(target)) ? undefined : target;
}

function* nativeSites(world: NativeWorld, symbol: NativeSymbol | undefined): APIRequestGenerator<readonly Site[]> {
  const nodes = symbol === undefined ? [] : yield* all(...symbol.declarations.map((handle) => handle.resolve.gen()));
  return nodes.flatMap((node) => (node === undefined ? [] : [world.siteOf(getNameOfDeclaration(node) ?? node)]));
}

/** Engine one's answers, from the TypeScript 7.1 checker. */
export function nativeOracle(world: NativeWorld): SlotOracle {
  function* declarationsOf(name: Site): APIRequestGenerator<readonly Site[]> {
    const file = world.source(name.file);
    const node = file === undefined ? undefined : getTouchingPropertyName(file, name.position);
    const symbol = node === undefined ? undefined : yield* world.checker.getSymbolAtLocation.gen(node);
    return yield* nativeSites(world, yield* targetOf(world.checker, symbol));
  }
  function* parameterOf(argument: Site): APIRequestGenerator<Site | null> {
    const file = world.source(argument.file);
    const node = file === undefined ? undefined : findNative(file, argument.position, isNativeArgument);
    const call = node?.parent;
    if (node === undefined || call === undefined || !(isCallExpression(call) || isNewExpression(call))) {
      return null;
    }
    const parameters = yield* (yield* world.checker.getResolvedSignature.gen(call)).getParameters.gen();
    // a rest parameter takes every argument past the last
    const bound = parameters[Math.min(call.arguments?.findIndex((candidate) => candidate === node) ?? 0, parameters.length - 1)];
    return (yield* nativeSites(world, bound))[0] ?? null;
  }
  function* propertiesOf(object: Site, name: string): APIRequestGenerator<readonly Site[]> {
    const file = world.source(object.file);
    const node = file === undefined ? undefined : findNative(file, object.position, isObjectLiteralExpression);
    const type = node === undefined || !isObjectLiteralExpression(node) ? undefined : yield* world.checker.getContextualType.gen(node);
    const properties = type === undefined ? [] : yield* propertiesNamed(world.checker, type, name);
    return (yield* all(...properties.map((property) => nativeSites(world, property)))).flat();
  }
  return { declarationsOf, parameterOf, propertiesOf };
}

/** Engine two's answers, from the TypeScript 6 checker. */
export function serviceOracle(world: ServiceWorld): SlotOracle {
  const sitesOf = (symbol: ts.Symbol | undefined): readonly Site[] =>
    (symbol?.declarations ?? []).map((declaration) => world.siteOf(ts.getNameOfDeclaration(declaration) ?? declaration));
  const declarationsOf = (name: Site): readonly Site[] => {
    const source = world.source(name.file);
    const node = source === undefined ? undefined : nameAt(source, name.position);
    const symbol = node === undefined ? undefined : world.checker.getSymbolAtLocation(node);
    return sitesOf(symbol !== undefined && hasFlag(symbol.flags, ts.SymbolFlags.Alias) ? world.checker.getAliasedSymbol(symbol) : symbol);
  };
  const parameterOf = (argument: Site): Site | null => {
    const source = world.source(argument.file);
    const node = source === undefined ? undefined : findService(source, argument.position, isServiceArgument);
    const call = node?.parent;
    if (node === undefined || call === undefined || !(ts.isCallExpression(call) || ts.isNewExpression(call))) {
      return null;
    }
    const parameters = world.checker.getResolvedSignature(call)?.getParameters() ?? [];
    const bound = parameters[Math.min(call.arguments?.findIndex((candidate) => candidate === node) ?? 0, parameters.length - 1)];
    return sitesOf(bound)[0] ?? null;
  };
  const propertiesOf = (object: Site, name: string): readonly Site[] => {
    const source = world.source(object.file);
    const node = source === undefined ? undefined : findService(source, object.position, ts.isObjectLiteralExpression);
    const type = node === undefined || !ts.isObjectLiteralExpression(node) ? undefined : world.checker.getContextualType(node);
    if (type === undefined) {
      return [];
    }
    return (type.isUnion() ? type.types : [type]).flatMap((member) => sitesOf(member.getProperty(name)));
  };
  return { declarationsOf, parameterOf, propertiesOf };
}
