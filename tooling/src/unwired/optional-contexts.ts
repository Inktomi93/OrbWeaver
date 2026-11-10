// An inherited or mapped option belongs to the type expected at its construction. Looking up its
// field declarations alone would mix unrelated derived types or different generic instantiations.
import type { JsxAttributes, Node, ObjectLiteralExpression } from "@typescript/native/ast";
import {
  isClassDeclaration,
  isIdentifier,
  isInterfaceDeclaration,
  isJsxSpreadAttribute,
  isMethodSignatureDeclaration,
  isPropertyDeclaration,
  isPropertySignatureDeclaration,
  isSpreadAssignment,
  isStringLiteral,
  isTypeAliasDeclaration,
  SyntaxKind,
} from "@typescript/native/ast";
import type { APIRequestGenerator, Type } from "@typescript/native/sync";
import { all, SymbolFlags, TypeFlags } from "@typescript/native/sync";
import type { Site } from "./classify.ts";
import type { NativeWorld } from "./native.ts";
import { constituents, declarationKeys, hasFlag } from "./native.ts";
import { isProduction } from "./optional-population.ts";

export type Construction = ObjectLiteralExpression | JsxAttributes;
export interface ContextWrite {
  readonly id: string;
  readonly owner: string;
  readonly site: Site;
  readonly field: string;
  readonly keys: readonly string[];
  readonly parent: string | null;
  readonly writer: Site;
  readonly localIdentity: boolean;
}

interface ContextIdentity {
  readonly stable: number | undefined;
  readonly optionalNames: ReadonlySet<string>;
  readonly id: string;
  readonly owner: string;
  readonly site: Site | undefined;
  readonly localIdentity: boolean;
  readonly specialized: boolean;
}

const MAX_ARGUMENT_DEPTH = 8;

function* concreteArguments(world: NativeWorld, type: Type, aliased: boolean): APIRequestGenerator<readonly Type[]> {
  if (aliased) {
    return yield* type.getAliasTypeArguments.gen();
  }
  return type.isTypeReference() ? yield* world.checker.getTypeArguments.gen(type) : [];
}

function* nominalKey(world: NativeWorld, type: Type, seen: ReadonlySet<number>): APIRequestGenerator<string | null> {
  if (seen.has(type.id) || seen.size >= MAX_ARGUMENT_DEPTH || type.isTypeParameter()) {
    return null;
  }
  if (!(hasFlag(type.flags, TypeFlags.Object) || type.isUnionType() || type.isIntersectionType())) {
    const simple = [
      TypeFlags.String,
      TypeFlags.StringLiteral,
      TypeFlags.Number,
      TypeFlags.NumberLiteral,
      TypeFlags.BigInt,
      TypeFlags.BigIntLiteral,
      TypeFlags.BooleanLiteral,
      TypeFlags.Null,
      TypeFlags.Undefined,
      TypeFlags.Never,
    ];
    return simple.some((flag) => hasFlag(type.flags, flag)) ? JSON.stringify([type.flags, yield* world.checker.typeToString.gen(type)]) : null;
  }
  const [alias, named] = yield* all(type.getAliasSymbol.gen(), type.getSymbol.gen());
  const symbol = alias ?? named;
  const handle = symbol?.declarations[0];
  const declaration = handle === undefined ? undefined : yield* handle.resolve.gen();
  // A compiler-synthesized __type may share a mapped declaration with unrelated schema outputs.
  if (
    symbol === undefined ||
    declaration === undefined ||
    !(isTypeAliasDeclaration(declaration) || isClassDeclaration(declaration) || isInterfaceDeclaration(declaration))
  ) {
    return null;
  }
  const args = yield* concreteArguments(world, type, alias !== undefined);
  if ((declaration.typeParameters?.length ?? 0) > 0 && args.length === 0) {
    return null;
  }
  const trail = new Set([...seen, type.id]);
  const argumentsKeys = yield* all(...args.map((item) => nominalKey(world, item, trail)));
  return argumentsKeys.some((item) => item === null) ? null : JSON.stringify([declarationKeys(symbol), argumentsKeys]);
}

type Registry = Map<string, number>;

export function* contextIdentity(world: NativeWorld, type: Type, registry: Registry): APIRequestGenerator<ContextIdentity | undefined> {
  const [alias, symbol] = yield* all(type.getAliasSymbol.gen(), type.getSymbol.gen());
  const handle = (alias ?? symbol)?.declarations[0];
  const declaration = handle === undefined ? undefined : yield* handle.resolve.gen();
  const inherited = declaration !== undefined && isInterfaceDeclaration(declaration) && (declaration.heritageClauses?.length ?? 0) > 0;
  const generic = alias !== undefined && (yield* type.getAliasTypeArguments.gen()).length > 0;
  if (!(inherited || generic || type.isMappedType() || type.isIntersectionType())) {
    return;
  }
  const localId = `${world.config}#${type.id}`;
  const nominal = yield* nominalKey(world, type, new Set());
  const properties = yield* world.checker.getPropertiesOfType.gen(type);
  const optionalNames = new Set(properties.filter((prop) => hasFlag(prop.flags, SymbolFlags.Optional)).map((prop) => prop.name));
  const anchored = properties.some((prop) => prop.declarations.some((origin) => isProduction(world.fileOf(origin) ?? "")));
  let stable: number | undefined;
  if (nominal !== null && anchored && properties.every((prop) => prop.declarations.length > 0)) {
    const inventory = properties
      .map((prop) => [prop.name, hasFlag(prop.flags, SymbolFlags.Optional), declarationKeys(prop)] as const)
      .sort(([a], [b]) => a.localeCompare(b));
    stable = registry.getOrInsertComputed(JSON.stringify([nominal, inventory]), () => registry.size);
  }
  return {
    id: localId,
    stable,
    optionalNames,
    owner: yield* world.checker.typeToString.gen(type),
    site: declaration === undefined || handle === undefined || !isProduction(world.fileOf(handle) ?? "") ? undefined : world.siteOf(declaration),
    localIdentity: stable === undefined,
    specialized: type.isMappedType() || (generic && handle !== undefined && isProduction(world.fileOf(handle) ?? "")),
  };
}

function* write(world: NativeWorld, type: Type, context: ContextIdentity, input: { node: Node; name: string }): APIRequestGenerator<ContextWrite | undefined> {
  const { node, name: field } = input;
  if (!context.optionalNames.has(field)) {
    return;
  }
  const prop = yield* world.checker.getPropertyOfType.gen(type, field);
  if (prop === undefined || !hasFlag(prop.flags, SymbolFlags.Optional)) {
    return;
  }
  const value = yield* world.checker.getTypeOfPropertyOfType.gen(type, field);
  if (value === undefined || (yield* constituents(value)).every((part) => hasFlag(part.flags, TypeFlags.Undefined) || hasFlag(part.flags, TypeFlags.Never))) {
    return;
  }
  const handle = prop.declarations.find((origin) => isProduction(world.fileOf(origin) ?? ""));
  if (handle === undefined && context.site === undefined && prop.declarations.length > 0) {
    return;
  }
  const decl = handle === undefined ? undefined : yield* handle.resolve.gen();
  const site = context.site ?? (decl === undefined ? world.siteOf(node) : world.siteOf(decl));
  const original =
    decl !== undefined &&
    (isPropertySignatureDeclaration(decl) || isMethodSignatureDeclaration(decl) || isPropertyDeclaration(decl)) &&
    decl.postfixToken?.kind === SyntaxKind.QuestionToken;
  const parent = original && !context.specialized ? `${decl.parent.getSourceFile().path}#${decl.parent.pos}` : null;
  return {
    id: context.id,
    owner: context.owner,
    site,
    field,
    keys: declarationKeys(prop),
    parent,
    writer: world.siteOf(node),
    localIdentity: context.localIdentity,
  };
}

function namesOf(literal: Construction): { readonly name: string; readonly node: Node }[] {
  return literal.properties.flatMap((property) => {
    if (isSpreadAssignment(property) || isJsxSpreadAttribute(property)) {
      return [];
    }
    const name = property.name;
    return isIdentifier(name) || isStringLiteral(name) ? [{ name: name.text, node: name }] : [];
  });
}

export interface ContextRecords {
  readonly identities: readonly { readonly id: string; readonly stable: number | undefined; readonly names: readonly string[] }[];
  readonly writes: readonly ContextWrite[];
  readonly unknown: readonly { readonly id: string; readonly site: Site }[];
}

/** Read concrete optional members from the contextual types already loaded for the shared world. */
export function contextWrites(world: NativeWorld, containers: readonly Construction[], registry: Registry): ContextRecords {
  const contextual = world.contextualTypes(containers);
  const targets = world.batch(
    contextual.map(function* (type): APIRequestGenerator<readonly Type[]> {
      return type === undefined ? [] : yield* constituents(yield* world.checker.getNonNullableType.gen(type));
    }),
  );
  const types = new Map(targets.flat().map((type) => [type.id, type]));
  const descriptors = world.batch([...types.values()].map((type) => contextIdentity(world, type, registry)));
  const identities = new Map([...types.keys()].map((id, index) => [id, descriptors[index]]));
  const requests: APIRequestGenerator<ContextWrite | undefined>[] = [];
  const unknown: { id: string; site: Site }[] = [];
  for (const [at, literal] of containers.entries()) {
    const arms = targets[at] ?? [];
    const spread = literal.properties.some((field) => isSpreadAssignment(field) || isJsxSpreadAttribute(field));
    for (const type of arms) {
      const context = identities.get(type.id);
      if (context === undefined) {
        continue;
      }
      if (spread || arms.length !== 1) {
        unknown.push({ id: context.id, site: world.siteOf(literal) });
      }
      if (arms.length === 1) {
        requests.push(...namesOf(literal).map((input) => write(world, type, context, input)));
      }
    }
  }
  return {
    identities: descriptors.flatMap((desc) => (desc === undefined ? [] : [{ id: desc.id, stable: desc.stable, names: [...desc.optionalNames] }])),
    writes: world.batch(requests).filter((entry) => entry !== undefined),
    unknown,
  };
}
