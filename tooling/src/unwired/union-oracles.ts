// The two engines' answers to the symbol questions a slot's origin asks: the TypeScript 7.1 checker batches them, the
// TypeScript 6 checker answers at once. Both report declaration names as sites and read nothing but the checker.
import type { ArrayLiteralExpression, CallExpression, Expression, NewExpression, Node, PropertyName, SourceFile } from "@typescript/native/ast";
import {
  getNameOfDeclaration,
  getTouchingPropertyName,
  isArrayLiteralExpression,
  isArrowFunction,
  isAsExpression,
  isCallExpression,
  isIdentifier,
  isNewExpression,
  isObjectLiteralExpression,
  isParenthesizedExpression,
  isPropertyAssignment,
  isSpreadElement,
  isStringLiteral,
  isTypeReferenceNode,
} from "@typescript/native/ast";
import type { APIRequestGenerator, Checker, Symbol as NativeSymbol, Signature, Type } from "@typescript/native/sync";
import { all, SymbolFlags, TypeFlags } from "@typescript/native/sync";
import ts from "typescript";
import type { Site } from "./classify.ts";
import { nameAt } from "./classify.ts";
import type { ServiceWorld } from "./language-service.ts";
import type { NativeWorld } from "./native.ts";
import { constituents, hasFlag, propertiesNamed } from "./native.ts";
import type { SlotOracle } from "./union-origins.ts";
import { isConstAssertion } from "./union-origins.ts";

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

// Types no string literal belongs to. A type parameter constrained to them takes a literal argument's own type, so the
// argument lands in no vocabulary but its own. The two engines read the same flags from their own enums.
const LITERAL_FREE_NATIVE: readonly TypeFlags[] = [
  TypeFlags.String,
  TypeFlags.Number,
  TypeFlags.BigInt,
  TypeFlags.Boolean,
  TypeFlags.BooleanLiteral,
  TypeFlags.NumberLiteral,
  TypeFlags.BigIntLiteral,
  TypeFlags.ESSymbol,
  TypeFlags.Null,
  TypeFlags.Undefined,
];
const LITERAL_FREE_SERVICE: readonly ts.TypeFlags[] = [
  ts.TypeFlags.String,
  ts.TypeFlags.Number,
  ts.TypeFlags.BigInt,
  ts.TypeFlags.Boolean,
  ts.TypeFlags.BooleanLiteral,
  ts.TypeFlags.NumberLiteral,
  ts.TypeFlags.BigIntLiteral,
  ts.TypeFlags.ESSymbol,
  ts.TypeFlags.Null,
  ts.TypeFlags.Undefined,
];

const isLiteralFree = (flags: number, free: readonly number[]): boolean => free.some((flag) => hasFlag(flags, flag));

const nativeKey = (name: PropertyName): string | null => (isIdentifier(name) || isStringLiteral(name) ? name.text : null);

const serviceKey = (name: ts.PropertyName): string | null => (ts.isIdentifier(name) || ts.isStringLiteralLike(name) ? name.text : null);

// The call a node is an argument of, and its index.
interface Argument<Call> {
  readonly call: Call;
  readonly index: number;
}

function nativeArgumentOf(node: Node): Argument<CallExpression | NewExpression> | undefined {
  const { parent } = node;
  const index =
    (isCallExpression(parent) || isNewExpression(parent)) && parent.arguments !== undefined ? parent.arguments.findIndex((argument) => argument === node) : -1;
  return index < 0 || !(isCallExpression(parent) || isNewExpression(parent)) ? undefined : { call: parent, index };
}

function serviceArgumentOf(node: ts.Node): Argument<ts.CallExpression | ts.NewExpression> | undefined {
  const { parent } = node;
  const index =
    (ts.isCallExpression(parent) || ts.isNewExpression(parent)) && parent.arguments !== undefined
      ? parent.arguments.findIndex((argument) => argument === node)
      : -1;
  return index < 0 || !(ts.isCallExpression(parent) || ts.isNewExpression(parent)) ? undefined : { call: parent, index };
}

/** `x as const`, in the native AST. */
export const isNativeConstAssertion = (node: Node): node is Node & { readonly expression: Expression } =>
  isAsExpression(node) && isTypeReferenceNode(node.type) && isIdentifier(node.type.typeName) && node.type.typeName.text === "const";

// What a call's argument at `index` is declared as in the generic signature the call resolves to, with that signature
// and its own type parameters; undefined when the call spells its type arguments or the signature declares none, since
// only an inferred type parameter can take its type from the argument.
interface Uninferred<T, S> {
  readonly type: T;
  readonly signature: S;
  readonly own: readonly T[];
}

function* nativeUninferred(
  world: NativeWorld,
  { call, index }: Argument<CallExpression | NewExpression>,
): APIRequestGenerator<Uninferred<Type, Signature> | undefined> {
  if (call.typeArguments !== undefined) {
    return undefined;
  }
  const signature = yield* (yield* world.checker.getResolvedSignature.gen(call)).getTarget.gen();
  const own = signature === undefined ? [] : yield* signature.getTypeParameters.gen();
  const parameters = signature === undefined ? [] : yield* signature.getParameters.gen();
  const bound = parameters[Math.min(index, parameters.length - 1)];
  return signature === undefined || own.length === 0 || bound === undefined
    ? undefined
    : { type: yield* world.checker.getTypeOfSymbol.gen(bound), signature, own };
}

function serviceUninferred(
  world: ServiceWorld,
  { call, index }: Argument<ts.CallExpression | ts.NewExpression>,
): Uninferred<ts.Type, ts.Signature> | undefined {
  const declaration = call.typeArguments === undefined ? world.checker.getResolvedSignature(call)?.getDeclaration() : undefined;
  const signature = declaration === undefined || ts.isJSDocSignature(declaration) ? undefined : world.checker.getSignatureFromDeclaration(declaration);
  const own = signature?.getTypeParameters() ?? [];
  const parameters = signature?.getParameters() ?? [];
  const bound = parameters[Math.min(index, parameters.length - 1)];
  return signature === undefined || own.length === 0 || bound === undefined ? undefined : { type: world.checker.getTypeOfSymbol(bound), signature, own };
}

// The declared slot an object literal fills: the types its property path is read from, outermost property first.
interface DeclaredSlot<T> {
  readonly types: readonly T[];
  readonly path: readonly string[];
}

// Climb from a value to the call argument it sits in, through parentheses, `as const`, property values and a callback's
// returned value, then read the argument's declared parameter type.
function* nativeDeclaredSlot(world: NativeWorld, node: Node, path: readonly string[]): APIRequestGenerator<DeclaredSlot<Type> | undefined> {
  const { parent } = node;
  if (isParenthesizedExpression(parent) || isNativeConstAssertion(parent)) {
    return yield* nativeDeclaredSlot(world, parent, path);
  }
  if (isPropertyAssignment(parent) && parent.initializer === node && isObjectLiteralExpression(parent.parent)) {
    const key = nativeKey(parent.name);
    return key === null ? undefined : yield* nativeDeclaredSlot(world, parent.parent, [key, ...path]);
  }
  if (isArrowFunction(parent) && parent.body === node) {
    return yield* nativeCallbackSlot(world, parent, path);
  }
  const argument = nativeArgumentOf(node);
  const declared = argument === undefined ? undefined : yield* nativeUninferred(world, argument);
  return declared === undefined ? undefined : { types: [declared.type], path };
}

// A callback's returned value: when the callee declares the callback to return one of its own type parameters and
// returns that parameter, or a list of it, the call's result holds only values the callback returned, since a generic
// function makes a value of its type parameter in no other way. The call's own contextual type is then the slot.
function* nativeCallbackSlot(world: NativeWorld, callback: Node, path: readonly string[]): APIRequestGenerator<DeclaredSlot<Type> | undefined> {
  const argument = nativeArgumentOf(callback);
  const declared = argument === undefined ? undefined : yield* nativeUninferred(world, argument);
  if (argument === undefined || declared === undefined) {
    return undefined;
  }
  const returns = yield* all(...(yield* declared.type.getCallSignatures.gen()).map((signature) => signature.getReturnType.gen()));
  const returned = returns.find((type) => type.isTypeParameter() && declared.own.some((parameter) => parameter.id === type.id));
  const result = yield* declared.signature.getReturnType.gen();
  const listed = returned !== undefined && (yield* nativeElementTypes(world.checker, [result])).some((type) => type.id === returned.id);
  const holder = listed ? spreadInto(argument.call) : undefined;
  const context =
    returned === undefined || !(listed || result.id === returned.id) ? undefined : yield* world.checker.getContextualType.gen(holder ?? argument.call);
  if (context === undefined) {
    return undefined;
  }
  return { types: listed ? yield* nativeElementTypes(world.checker, [context]) : [context], path };
}

function serviceDeclaredSlot(world: ServiceWorld, node: ts.Node, path: readonly string[]): DeclaredSlot<ts.Type> | undefined {
  const { parent } = node;
  if (ts.isParenthesizedExpression(parent) || (ts.isAsExpression(parent) && isConstAssertion(parent.type))) {
    return serviceDeclaredSlot(world, parent, path);
  }
  if (ts.isPropertyAssignment(parent) && parent.initializer === node && ts.isObjectLiteralExpression(parent.parent)) {
    const key = serviceKey(parent.name);
    return key === null ? undefined : serviceDeclaredSlot(world, parent.parent, [key, ...path]);
  }
  if (ts.isArrowFunction(parent) && parent.body === node) {
    return serviceCallbackSlot(world, parent, path);
  }
  const argument = serviceArgumentOf(node);
  const declared = argument === undefined ? undefined : serviceUninferred(world, argument);
  return declared === undefined ? undefined : { types: [declared.type], path };
}

function serviceCallbackSlot(world: ServiceWorld, callback: ts.Node, path: readonly string[]): DeclaredSlot<ts.Type> | undefined {
  const argument = serviceArgumentOf(callback);
  const declared = argument === undefined ? undefined : serviceUninferred(world, argument);
  if (argument === undefined || declared === undefined) {
    return undefined;
  }
  const returned = declared.type
    .getCallSignatures()
    .map((signature) => signature.getReturnType())
    .find((type) => type.isTypeParameter() && declared.own.includes(type));
  const result = declared.signature.getReturnType();
  const listed = returned !== undefined && serviceElementTypes(world.checker, [result]).includes(returned);
  const holder = listed ? serviceSpreadInto(argument.call) : undefined;
  const context = returned === undefined || !(listed || result === returned) ? undefined : world.checker.getContextualType(holder ?? argument.call);
  if (context === undefined) {
    return undefined;
  }
  return { types: listed ? serviceElementTypes(world.checker, [context]) : [context], path };
}

// The array literal a list is spread into (`[...rows.map(...)]`): its contextual type is the list's, since a spread
// element's expression has none of its own.
function spreadInto(node: Node): ArrayLiteralExpression | undefined {
  const { parent } = node;
  return isSpreadElement(parent) && isArrayLiteralExpression(parent.parent) ? parent.parent : undefined;
}

function serviceSpreadInto(node: ts.Node): ts.ArrayLiteralExpression | undefined {
  const { parent } = node;
  return ts.isSpreadElement(parent) && ts.isArrayLiteralExpression(parent.parent) ? parent.parent : undefined;
}

// The element types of list types: each number index signature's value.
function* nativeElementTypes(checker: Checker, types: readonly Type[]): APIRequestGenerator<readonly Type[]> {
  const elements: Type[] = [];
  for (const type of yield* nativeSettled(checker, types)) {
    const indexes = yield* checker.getIndexInfosOfType.gen(type);
    elements.push(...indexes.filter((info) => hasFlag(info.keyType.flags, TypeFlags.Number)).map((info) => info.valueType));
  }
  return elements;
}

function serviceElementTypes(checker: ts.TypeChecker, types: readonly ts.Type[]): readonly ts.Type[] {
  return serviceSettled(types).flatMap((type) =>
    checker
      .getIndexInfosOfType(type)
      .filter((info) => hasFlag(info.keyType.flags, ts.TypeFlags.Number))
      .map((info) => info.type),
  );
}

// Each type read as the object types a property is found on: a type parameter as its constraint, a union as its members.
function* nativeSettled(checker: Checker, types: readonly Type[]): APIRequestGenerator<readonly Type[]> {
  const settled: Type[] = [];
  const pending = [...types];
  for (let type = pending.pop(); type !== undefined; type = pending.pop()) {
    if (type.isTypeParameter()) {
      const constraint = yield* checker.getConstraintOfTypeParameter.gen(type);
      pending.push(...(constraint === undefined ? [] : [constraint]));
    } else {
      const members = yield* constituents(type);
      if (members.length > 1) {
        pending.push(...members);
      } else {
        settled.push(type);
      }
    }
  }
  return settled;
}

function serviceSettled(types: readonly ts.Type[]): readonly ts.Type[] {
  return types.flatMap((type): readonly ts.Type[] => {
    if (type.isUnion()) {
      return serviceSettled(type.types);
    }
    if (type.isTypeParameter()) {
      const constraint = type.getConstraint();
      return constraint === undefined ? [] : serviceSettled([constraint]);
    }
    return [type];
  });
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
  function* infersFromArgument(argument: Site): APIRequestGenerator<boolean> {
    const file = world.source(argument.file);
    const node = file === undefined ? undefined : findNative(file, argument.position, isNativeArgument);
    const call = node?.parent;
    if (node === undefined || call === undefined || !(isCallExpression(call) || isNewExpression(call))) {
      return false;
    }
    const declared = yield* nativeUninferred(world, { call, index: call.arguments?.findIndex((candidate) => candidate === node) ?? 0 });
    if (declared === undefined || !declared.type.isTypeParameter() || !declared.own.some((parameter) => parameter.id === declared.type.id)) {
      return false;
    }
    const constraint = yield* world.checker.getConstraintOfTypeParameter.gen(declared.type);
    const members = constraint === undefined ? [] : yield* constituents(constraint);
    return members.every((member) => isLiteralFree(member.flags, LITERAL_FREE_NATIVE));
  }
  function* uninferredPropertiesOf(object: Site, name: string): APIRequestGenerator<readonly Site[]> {
    const file = world.source(object.file);
    const node = file === undefined ? undefined : findNative(file, object.position, isObjectLiteralExpression);
    const slot = node === undefined ? undefined : yield* nativeDeclaredSlot(world, node, []);
    if (slot === undefined) {
      return [];
    }
    let { types } = slot;
    for (const step of slot.path) {
      types = yield* nativePropertyTypes(world.checker, types, step);
    }
    const settled = yield* nativeSettled(world.checker, types);
    const properties = (yield* all(...settled.map((type) => world.checker.getPropertyOfType.gen(type, name)))).filter((property) => property !== undefined);
    return (yield* all(...properties.map((property) => nativeSites(world, property)))).flat();
  }
  return { declarationsOf, parameterOf, propertiesOf, infersFromArgument, uninferredPropertiesOf };
}

// The types a property named `name` has on `types`, or a string index signature's value where the type has none.
function* nativePropertyTypes(checker: Checker, types: readonly Type[], name: string): APIRequestGenerator<readonly Type[]> {
  const next: Type[] = [];
  for (const type of yield* nativeSettled(checker, types)) {
    const property = yield* checker.getPropertyOfType.gen(type, name);
    if (property === undefined) {
      const indexes = yield* checker.getIndexInfosOfType.gen(type);
      next.push(...indexes.filter((info) => hasFlag(info.keyType.flags, TypeFlags.String)).map((info) => info.valueType));
    } else {
      next.push(yield* checker.getTypeOfSymbol.gen(property));
    }
  }
  return next;
}

function servicePropertyTypes(checker: ts.TypeChecker, types: readonly ts.Type[], name: string): readonly ts.Type[] {
  return serviceSettled(types).flatMap((type) => {
    const property = checker.getPropertyOfType(type, name);
    if (property === undefined) {
      return checker
        .getIndexInfosOfType(type)
        .filter((info) => hasFlag(info.keyType.flags, ts.TypeFlags.String))
        .map((info) => info.type);
    }
    return [checker.getTypeOfSymbol(property)];
  });
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
  const infersFromArgument = (argument: Site): boolean => {
    const source = world.source(argument.file);
    const node = source === undefined ? undefined : findService(source, argument.position, isServiceArgument);
    const call = node?.parent;
    if (node === undefined || call === undefined || !(ts.isCallExpression(call) || ts.isNewExpression(call))) {
      return false;
    }
    const declared = serviceUninferred(world, { call, index: call.arguments?.findIndex((candidate) => candidate === node) ?? 0 });
    if (declared === undefined || !declared.type.isTypeParameter() || !declared.own.includes(declared.type)) {
      return false;
    }
    const constraint = declared.type.getConstraint();
    return serviceSettled(constraint === undefined ? [] : [constraint]).every((member) => isLiteralFree(member.flags, LITERAL_FREE_SERVICE));
  };
  const uninferredPropertiesOf = (object: Site, name: string): readonly Site[] => {
    const source = world.source(object.file);
    const node = source === undefined ? undefined : findService(source, object.position, ts.isObjectLiteralExpression);
    const slot = node === undefined ? undefined : serviceDeclaredSlot(world, node, []);
    if (slot === undefined) {
      return [];
    }
    const types = slot.path.reduce<readonly ts.Type[]>((reached, step) => servicePropertyTypes(world.checker, reached, step), slot.types);
    return serviceSettled(types).flatMap((type) => sitesOf(world.checker.getPropertyOfType(type, name)));
  };
  return { declarationsOf, parameterOf, propertiesOf, infersFromArgument, uninferredPropertiesOf };
}
