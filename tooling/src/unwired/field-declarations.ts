// The data fields one world declares: members of named object types and keys of `z.object` schemas, each with every
// declaration key that names it. The brand-flow optional-construction census (./optional-constructions.ts) reads them;
// `pnpm unwired fields` judges members on the reference graph (./graph/fields.ts).
//
// - A schema key checked against a type (`satisfies z.ZodType<T>`, or a `z.ZodType<T>` annotation) and that type's member
//   are one field, declared at the member with both keys.
// - A key a `base.extend({ key })` literal re-declares is the base key: its declaration keys join the base's.
import type { CallExpression, Identifier, Node, ObjectLiteralExpression, PropertyAssignment } from "@typescript/native/ast";
import {
  isArrayLiteralExpression,
  isArrowFunction,
  isCallExpression,
  isIdentifier,
  isMappedTypeNode,
  isObjectLiteralExpression,
  isParenthesizedExpression,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isSatisfiesExpression,
  isStringLiteral,
  isTypeOperatorNode,
  isTypeReferenceNode,
  isVariableDeclaration,
  SyntaxKind,
} from "@typescript/native/ast";
import type { APIRequestGenerator, Checker, Symbol as NativeSymbol } from "@typescript/native/sync";
import { editorLineOf } from "../floor/typescript/editor-lines.ts";
import type { Site } from "./classify.ts";
import type { NativeWorld } from "./native.ts";
import { constituents, declarationKeys } from "./native.ts";
import { typeMembers } from "./type-members.ts";
import { isProduction } from "./worlds.ts";

const ZOD_OBJECTS: ReadonlySet<string> = new Set(["object", "strictObject", "looseObject"]);
const ZOD_OPTIONAL: ReadonlySet<string> = new Set(["optional", "nullish", "default", "prefault", "catch"]);

interface FieldDeclaration {
  readonly site: Site;
  readonly line: number;
  readonly home: string;
  readonly member: string;
  readonly optional: boolean;
  readonly keys: readonly string[];
}

const isZodObject = (node: CallExpression): boolean =>
  isPropertyAccessExpression(node.expression) &&
  ZOD_OBJECTS.has(node.expression.name.text) &&
  isIdentifier(node.expression.expression) &&
  node.expression.expression.text === "z";

// `z.string().optional()`: a method named for an optional or defaulted key anywhere on the initializer's call chain.
function isOptionalSchema(node: Node): boolean {
  for (let at: Node = node; isCallExpression(at) && isPropertyAccessExpression(at.expression); at = at.expression.expression) {
    if (ZOD_OPTIONAL.has(at.expression.name.text)) {
      return true;
    }
  }
  return false;
}

// The variable a schema is bound to, then each key on the way down to the nested schema.
function schemaHome(literal: ObjectLiteralExpression): string {
  const path: string[] = [];
  for (let at: Node = literal.parent; at.kind !== SyntaxKind.SourceFile; at = at.parent) {
    if (isPropertyAssignment(at) && isIdentifier(at.name)) {
      path.unshift(at.name.text);
    }
    if (isVariableDeclaration(at) && isIdentifier(at.name)) {
      path.unshift(at.name.text);
      break;
    }
  }
  return path.join(".") || "<schema>";
}

type NamedKey = PropertyAssignment & { readonly name: Identifier };

interface SchemaKey {
  readonly node: NamedKey;
  readonly home: string;
  /** The type the schema is checked against, whose member is the key's home. */
  readonly mirror: Node | null;
  /** The schema is one option of a checked union, so its mirror is the union member with the same keys. */
  readonly option: boolean;
  /** Every key name of the schema the key sits in. */
  readonly names: readonly string[];
}

const ZOD_UNIONS: ReadonlySet<string> = new Set(["union", "discriminatedUnion"]);

// The `z.lazy(() => schema)` call whose arrow body is `node`, if any.
function lazyAround(node: Node): Node | null {
  const arrow = node.parent;
  const call = arrow.parent;
  return isArrowFunction(arrow) &&
    arrow.body === node &&
    isCallExpression(call) &&
    isPropertyAccessExpression(call.expression) &&
    call.expression.name.text === "lazy"
    ? call
    : null;
}

// The outermost expression a schema call is, through parentheses, chained methods such as `.strict()` and `z.lazy`.
function chainTop(call: Node): Node {
  let at = call;
  for (;;) {
    const { parent } = at;
    if (isParenthesizedExpression(parent)) {
      at = parent;
    } else if (isPropertyAccessExpression(parent) && parent.expression === at && isCallExpression(parent.parent) && parent.parent.expression === parent) {
      at = parent.parent;
    } else {
      const lazy = lazyAround(at);
      if (lazy === null) {
        return at;
      }
      at = lazy;
    }
  }
}

// `z.strictObject({...}).strict() satisfies z.ZodType<View>` or `const schema: z.ZodType<View> = ...`: the `View`.
function checkedType(call: Node): Node | null {
  const at = chainTop(call);
  const { parent } = at;
  let checked: Node | undefined;
  if (isSatisfiesExpression(parent)) {
    checked = parent.type;
  } else if (isVariableDeclaration(parent) && parent.initializer === at) {
    checked = parent.type;
  }
  const [subject] = checked !== undefined && isTypeReferenceNode(checked) ? (checked.typeArguments ?? []) : [];
  const mirror = subject === undefined ? undefined : (keyedOver(subject) ?? subject);
  return mirror !== undefined && isTypeReferenceNode(mirror) ? mirror.typeName : null;
}

// The type a mapped type re-keys, `{ [K in keyof T]?: T[K] }`: a schema checked against it mirrors `T`'s members.
function keyedOver(node: Node): Node | undefined {
  const constraint = isMappedTypeNode(node) ? node.typeParameter.constraint : undefined;
  return constraint !== undefined && isTypeOperatorNode(constraint) && constraint.operator === SyntaxKind.KeyOfKeyword ? constraint.type : undefined;
}

// The checked type of a schema, or of the `z.union([...])` or `z.discriminatedUnion(key, [...])` it is an option of.
function mirrorOf(call: Node): { readonly mirror: Node | null; readonly option: boolean } {
  const list = chainTop(call).parent;
  const union = list.parent;
  const isOption =
    isArrayLiteralExpression(list) && isCallExpression(union) && isPropertyAccessExpression(union.expression) && ZOD_UNIONS.has(union.expression.name.text);
  return isOption ? { mirror: checkedType(union), option: true } : { mirror: checkedType(call), option: false };
}

const namedKeys = (shape: ObjectLiteralExpression): readonly NamedKey[] =>
  shape.properties.flatMap((property) =>
    isPropertyAssignment(property) && (isIdentifier(property.name) || isStringLiteral(property.name)) ? [property as NamedKey] : [],
  );

function keysOfShape(shape: ObjectLiteralExpression): readonly SchemaKey[] {
  const home = schemaHome(shape);
  const { mirror, option } = mirrorOf(shape.parent);
  const named = namedKeys(shape);
  const names = named.map((node) => node.name.text);
  return named.map((node) => ({ node, home, mirror, option, names }));
}

const sameNames = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((name) => b.includes(name));

// A mirrored key's type member: the checked type's property of that name, or for a union option the property of the
// union member whose keys are the option's keys. Undefined for a key with no mirror member.
function* mirrored(checker: Checker, key: SchemaKey, mirror: NativeSymbol | undefined): APIRequestGenerator<NativeSymbol | undefined> {
  if (mirror === undefined) {
    return undefined;
  }
  const declared = yield* checker.getDeclaredTypeOfSymbol.gen(mirror);
  if (!key.option) {
    return yield* checker.getPropertyOfType.gen(declared, key.node.name.text);
  }
  for (const member of yield* constituents(declared)) {
    const names = (yield* checker.getPropertiesOfType.gen(member)).map((property) => property.name);
    if (sameNames(names, key.names)) {
      return yield* checker.getPropertyOfType.gen(member, key.node.name.text);
    }
  }
  return undefined;
}

function schemaKeys(world: NativeWorld): readonly SchemaKey[] {
  const found: SchemaKey[] = [];
  for (const file of world.files.filter((source) => isProduction(world.siteOf(source).file))) {
    const visit = (node: Node): void => {
      const [shape] = isCallExpression(node) && isZodObject(node) ? node.arguments : [];
      if (shape !== undefined && isObjectLiteralExpression(shape)) {
        found.push(...keysOfShape(shape));
      }
      node.forEachChild(visit);
    };
    file.forEachChild(visit);
  }
  return found;
}

const ZOD_EXTEND = "extend";
const ZOD_SHAPE = "shape";

// A key of a `base.extend({ ... })` literal, with the schema it extends. An extended schema checked against a type of
// its own (`satisfies z.ZodType<Other>`) is another shape, so its keys mirror that type and re-declare nothing.
interface ExtendKey {
  readonly node: NamedKey;
  readonly base: Node;
}

function extendKeys(world: NativeWorld): readonly ExtendKey[] {
  const found: ExtendKey[] = [];
  for (const file of world.files.filter((source) => isProduction(world.siteOf(source).file))) {
    const visit = (node: Node): void => {
      const [shape] = isCallExpression(node) ? node.arguments : [];
      const callee = isCallExpression(node) ? node.expression : undefined;
      if (
        callee !== undefined &&
        isPropertyAccessExpression(callee) &&
        callee.name.text === ZOD_EXTEND &&
        shape !== undefined &&
        isObjectLiteralExpression(shape) &&
        checkedType(node) === null
      ) {
        found.push(...namedKeys(shape).map((key) => ({ node: key, base: callee.expression })));
      }
      node.forEachChild(visit);
    };
    file.forEachChild(visit);
  }
  return found;
}

// The base key an extend key re-declares: the extended schema's `shape` property of the same name, if it has one.
function* overriddenKey(checker: Checker, key: ExtendKey): APIRequestGenerator<NativeSymbol | undefined> {
  const type = yield* checker.getTypeAtLocation.gen(key.base);
  const shape = yield* checker.getPropertyOfType.gen(type, ZOD_SHAPE);
  const shapeType = shape === undefined ? undefined : yield* checker.getTypeOfSymbol.gen(shape);
  return shapeType === undefined ? undefined : yield* checker.getPropertyOfType.gen(shapeType, key.node.name.text);
}

// Each base key's declaration keys to the keys of the extend keys that re-declare it. An unchecked override is the same
// wire field under a stricter schema, as the server's role codecs re-declare a contract key, so its reads and writes are
// the base's.
function overrides(world: NativeWorld): ReadonlyMap<string, readonly string[]> {
  const keys = extendKeys(world);
  const own = world.symbolsAt(keys.map(({ node }) => node.name));
  const bases = world.batch(keys.map((key) => overriddenKey(world.checker, key)));
  const found = new Map<string, string[]>();
  for (const [at, base] of bases.entries()) {
    const symbol = own[at];
    if (base === undefined || symbol === undefined) {
      continue;
    }
    for (const baseKey of declarationKeys(base)) {
      found.set(baseKey, [...(found.get(baseKey) ?? []), ...declarationKeys(symbol)]);
    }
  }
  return found;
}

/** Every data field the production files of `world` declare: type members, callable ones included, and the schema keys
 *  no type member mirrors. */
export function fieldDeclarations(world: NativeWorld): readonly FieldDeclaration[] {
  const keys = schemaKeys(world);
  const symbols = world.symbolsAt(keys.map(({ node }) => node.name));
  const mirrorNodes = keys.flatMap(({ mirror }) => (mirror === null ? [] : [mirror]));
  const mirrors = new Map(world.symbolsAt(mirrorNodes).map((symbol, at) => [mirrorNodes[at], symbol]));
  const members = world.batch(keys.map((key) => mirrored(world.checker, key, key.mirror === null ? undefined : mirrors.get(key.mirror))));
  const types = typeMembers(world);
  const typeKeys = new Set(types.flatMap((member) => member.keys));
  // A mirrored key and its named type's member are one field, declared at the member with both keys. A key whose member
  // sits in an anonymous union member stays a schema field that the member's references also reach.
  const joined = new Map<string, readonly string[]>();
  for (const [at, member] of members.entries()) {
    const own = symbols[at];
    for (const memberKey of (member === undefined ? [] : declarationKeys(member)).filter((candidate) => typeKeys.has(candidate))) {
      joined.set(memberKey, [...(joined.get(memberKey) ?? []), ...(own === undefined ? [] : declarationKeys(own))]);
    }
  }
  const fromTypes = types.map((member) => ({
    site: member.site,
    line: member.line,
    home: member.home,
    member: member.member,
    optional: member.optional,
    keys: [...member.keys, ...member.keys.flatMap((key) => joined.get(key) ?? [])],
  }));
  const fromSchemas = keys.flatMap(({ node, home }, at) => {
    const site = world.siteOf(node.name);
    const symbol = symbols[at];
    const member = members[at];
    const memberKeys = member === undefined ? [] : declarationKeys(member);
    if (memberKeys.some((key) => typeKeys.has(key))) {
      return [];
    }
    const field: FieldDeclaration = {
      site,
      line: editorLineOf(node.getSourceFile(), site.position),
      home,
      member: node.name.text,
      optional: isOptionalSchema(node.initializer),
      keys: [...(symbol === undefined ? [] : declarationKeys(symbol)), ...memberKeys],
    };
    return [field];
  });
  const overridden = overrides(world);
  return [...fromTypes, ...fromSchemas].map((field) => ({
    ...field,
    keys: [...field.keys, ...field.keys.flatMap((key) => overridden.get(key) ?? [])],
  }));
}
