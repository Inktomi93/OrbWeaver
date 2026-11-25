// The library names the scans read: a zod builder, a platform call, a lib utility type. Each is recognized by the
// declaration its name resolves to, never by its spelling, so an alias (`import { z as zod }`, `const O = Object`)
// still counts and a same-named member of ours does not.
//
// - One pre-pass over a world's files collects every name one of the tables below spells, as a property access's name,
//   a call's identifier callee or a type reference's name, and asks the checker for all of them in array requests. The
//   pass runs once per world, before any walk, so the walk, the resolver and the role readers read one settled answer
//   from any file.
// - A name a table does not list is never collected, so asking it is a defect in the asking site and throws.
import type { Node } from "@typescript/native/ast";
import { isCallExpression, isIdentifier, isPropertyAccessExpression, isQualifiedName, isTypeReferenceNode } from "@typescript/native/ast";
import type { APIRequestGenerator, Symbol as NativeSymbol } from "@typescript/native/sync";
import { all } from "@typescript/native/sync";
import type { NativeWorld } from "../native.ts";
import { NODE_TYPES } from "../native.ts";

/** The package whose declarations make a call a validator, a builder a schema and a `satisfies` reference a twin. */
export const ZOD_PACKAGE = "zod";

// This module sits below the walk and the role readers, so it compares remote nodes by span itself (roles.ts sameNode).
const sameNode = (a: Node | undefined, b: Node): boolean => a !== undefined && a.pos === b.pos && a.end === b.end && a.kind === b.kind;

/** Who declares a name: zod, or the platform (the compiler's default library or Node's types). */
type Library = "zod" | "platform";

/** zod's object builders: the literal each takes is a shape (`z.strictObject({ … })`). */
export const ZOD_OBJECT_BUILDERS: ReadonlySet<string> = new Set(["object", "strictObject", "looseObject"]);
/** zod's union builders: an inline arm list spells each arm. */
export const ZOD_UNION_BUILDERS: ReadonlySet<string> = new Set(["union", "discriminatedUnion"]);
/** zod's extenders: the literal each takes adds keys to the base. */
export const ZOD_EXTENDERS: ReadonlySet<string> = new Set(["extend", "safeExtend"]);
/** zod's lazy builder: the arrow it takes returns the schema. */
export const ZOD_LAZY = "lazy";
/** The zod type a schema is checked against. */
export const ZOD_TYPE = "ZodType";
/** zod's builder methods that make a key optional or give it a default. */
export const ZOD_OPTIONAL: ReadonlySet<string> = new Set(["optional", "nullish", "default", "prefault", "catch"]);
/** zod's enum builder (`z.enum(T)`), whose tuple is the parsed value's literals. */
export const ZOD_ENUM = "enum";
/** zod's enum doors: `schema.enum.k` on `schema = z.enum(T)` reads T's member. */
export const ZOD_ENUM_DOORS: ReadonlySet<string> = new Set([ZOD_ENUM, "Enum"]);
/** zod's inferred types, whose keys are the queried schema's. */
export const ZOD_INFERS: ReadonlySet<string> = new Set(["infer", "output", "input"]);

/** The platform calls that take every member of their arguments, by the role each gives: `Object.keys` lists names
 *  alone, so it is a key use; the others and a deep clone read each value. */
export const REFLECTIVE_CALLS: ReadonlyMap<string, "read" | "key"> = new Map([
  ["entries", "read"],
  ["values", "read"],
  ["assign", "read"],
  ["keys", "key"],
  ["structuredClone", "read"],
]);
/** The platform's membership tests on a list, a set, a map or a string. */
export const MEMBERSHIP_METHODS: ReadonlySet<string> = new Set(["includes", "has", "indexOf", "lastIndexOf"]);
/** The lib utility types whose keys are their first argument's; `Promise` and `Awaited` too, as an awaited value's keys
 *  are its promise's argument's. */
export const KEY_TRANSPARENT: ReadonlySet<string> = new Set(["Readonly", "Partial", "Required", "NonNullable", "Promise", "Awaited"]);

const ZOD_NAMES: ReadonlySet<string> = new Set([
  ...ZOD_OBJECT_BUILDERS,
  ...ZOD_UNION_BUILDERS,
  ...ZOD_EXTENDERS,
  ZOD_LAZY,
  ZOD_TYPE,
  ...ZOD_OPTIONAL,
  ...ZOD_ENUM_DOORS,
  ...ZOD_INFERS,
]);
const PLATFORM_NAMES: ReadonlySet<string> = new Set([...REFLECTIVE_CALLS.keys(), ...MEMBERSHIP_METHODS, ...KEY_TRANSPARENT]);

/** Whether a name node resolves to a declaration of a library. */
export interface LibraryNames {
  /** @throws When `name` spells no name a table of this module lists: the pre-pass never collected it. */
  readonly declaredBy: (name: Node, library: Library) => boolean;
}

const isListed = (text: string): boolean => ZOD_NAMES.has(text) || PLATFORM_NAMES.has(text);

// A name node of one of the three positions the pre-pass collects, with its text.
function collectedName(node: Node): string | undefined {
  const { parent } = node;
  if (!isIdentifier(node)) {
    return undefined;
  }
  const named =
    (isPropertyAccessExpression(parent) && sameNode(parent.name, node)) ||
    (isCallExpression(parent) && sameNode(parent.expression, node)) ||
    (isTypeReferenceNode(parent) && sameNode(parent.typeName, node)) ||
    (isQualifiedName(parent) && sameNode(parent.right, node) && isTypeReferenceNode(parent.parent));
  return named && isListed(node.text) ? node.text : undefined;
}

const spanKey = (node: Node): string => `${node.getSourceFile().fileName}#${String(node.pos)}-${String(node.end)}`;

function* librariesOf(world: NativeWorld, symbol: NativeSymbol | undefined): APIRequestGenerator<readonly Library[]> {
  const handles = symbol?.declarations ?? [];
  const [packages, defaults] = yield* all(
    all(...handles.map((handle) => world.packageOf(handle))),
    all(...handles.map((handle) => world.isDefaultLibrary(handle))),
  );
  return [
    ...(packages.includes(ZOD_PACKAGE) ? (["zod"] as const) : []),
    ...(defaults.includes(true) || packages.includes(NODE_TYPES) ? (["platform"] as const) : []),
  ];
}

const settledNames = (declared: ReadonlyMap<string, readonly Library[]>): LibraryNames => ({
  declaredBy: (name, library): boolean => {
    if (!(isIdentifier(name) && isListed(name.text))) {
      throw new Error(`library-names: ${isIdentifier(name) ? name.text : "a non-identifier"} is no name the pre-pass collects`);
    }
    return declared.get(spanKey(name))?.includes(library) === true;
  },
});

const SETTLED = new WeakMap<NativeWorld, LibraryNames>();

/** The world's settled library names, collected and resolved on first ask.
 *  @remarks Settling runs batches, so ask it first outside any request generator; the graph build does before its walk. */
export function libraryNames(world: NativeWorld): LibraryNames {
  const known = SETTLED.get(world);
  if (known !== undefined) {
    return known;
  }
  const names: Node[] = [];
  const visit = (node: Node): void => {
    if (collectedName(node) !== undefined) {
      names.push(node);
    }
    node.forEachChild(visit);
  };
  for (const source of world.files) {
    source.forEachChild(visit);
  }
  const symbols = world.symbolsAt(names);
  const libraries = world.batch(symbols.map((symbol) => librariesOf(world, symbol)));
  const declared = new Map(names.flatMap((name, at) => ((libraries[at]?.length ?? 0) > 0 ? [[spanKey(name), libraries[at] ?? []] as const] : [])));
  const settled = settledNames(declared);
  SETTLED.set(world, settled);
  return settled;
}
