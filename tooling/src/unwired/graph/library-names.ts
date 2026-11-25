// The library names the scans read: a zod builder, a platform call, a lib utility type, a query builder's verb. Each is
// recognized by the declaration its name resolves to, never by its spelling, so an alias (`import { z as zod }`,
// `const O = Object`) still counts and a same-named member of ours does not.
//
// - The tables below are the one home of every name a reader asks a library about, keyed by the package that declares
//   it: a reader's prefilter reads its table, and its verdict asks {@link LibraryNames.declaredBy} of the node itself.
// - One pre-pass over a world's files collects every name a table spells at a position a reader asks about (a property
//   access's name or receiver, a call's or construction's identifier callee, a type reference's name, an import
//   specifier, a JSX attribute's name, an object literal's key) and asks the checker for all of them in array requests.
//   An object literal's key is judged by the member its contextual type declares under that name. The pass runs once
//   per world, before any walk, so the walk, the resolver and the role readers read one settled answer from any file.
// - A name the asked package's table does not list is never collected for it, so asking it is a defect in the asking
//   site and throws.
import type { Node, ObjectLiteralExpression } from "@typescript/native/ast";
import {
  isCallExpression,
  isIdentifier,
  isImportSpecifier,
  isJsxAttribute,
  isNewExpression,
  isObjectLiteralExpression,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isQualifiedName,
  isShorthandPropertyAssignment,
  isTypeReferenceNode,
} from "@typescript/native/ast";
import type { APIRequestGenerator, Symbol as NativeSymbol, NodeHandle } from "@typescript/native/sync";
import { all, SymbolFlags } from "@typescript/native/sync";
import type { NativeWorld } from "../native.ts";
import { hasFlag, isPlatform, propertiesNamed } from "../native.ts";

/** The package whose declarations make a call a validator, a builder a schema and a `satisfies` reference a twin. */
export const ZOD_PACKAGE = "zod";
/** The platform: the compiler's default library and Node's types (native.ts isPlatform). */
export const PLATFORM = "platform";
export const DRIZZLE_PACKAGE = "drizzle-orm";
export const HONO_PACKAGE = "hono";
export const TRPC_SERVER = "@trpc/server";
export const TRPC_CLIENT = "@trpc/client";
export const TRPC_QUERY = "@trpc/tanstack-react-query";
export const QUERY_CORE = "@tanstack/query-core";
export const REACT_QUERY = "@tanstack/react-query";
export const FORM_CORE = "@tanstack/form-core";
export const REACT_FORM = "@tanstack/react-form";
export const ROUTER_CORE = "@tanstack/router-core";
export const REACT_ROUTER = "@tanstack/react-router";
export const PLAYWRIGHT_CORE = "playwright-core";
/** Playwright's test runner, which declares its `expect` matchers. */
export const PLAYWRIGHT = "playwright";
export const VARIANTS_PACKAGE = "tailwind-variants";
export const PINO_PACKAGE = "pino";
export const REACT_TYPES = "@types/react";

const LIBRARIES = [
  ZOD_PACKAGE,
  PLATFORM,
  DRIZZLE_PACKAGE,
  HONO_PACKAGE,
  TRPC_SERVER,
  TRPC_CLIENT,
  TRPC_QUERY,
  QUERY_CORE,
  REACT_QUERY,
  PLAYWRIGHT_CORE,
] as const;
/** Who declares a name: a package by its manifest name, or the platform. */
export type Library = (typeof LIBRARIES)[number];

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
/** zod's parse methods. */
export const ZOD_PARSES: ReadonlySet<string> = new Set(["parse", "safeParse", "parseAsync", "safeParseAsync"]);

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
/** The platform's list types, whose argument is the element. */
export const ARRAY_TYPES: ReadonlySet<string> = new Set(["Array", "ReadonlyArray"]);
/** The platform's list and keyed stores: the methods that put an argument into the receiver. */
export const STORING_METHODS: ReadonlySet<string> = new Set(["push", "unshift", "splice", "fill", "set", "add"]);
/** The platform's list methods that write their arguments into the list. */
export const LIST_WRITES: ReadonlySet<string> = new Set(["push", "unshift", "splice", "fill"]);
/** The list methods whose callback is handed each element of the receiver as its first parameter. */
export const ELEMENT_CALLBACKS: ReadonlySet<string> = new Set(["map", "flatMap", "forEach", "filter", "find", "findLast", "findIndex", "some", "every"]);
/** The global objects a page script reads its own globals off. */
export const GLOBAL_OBJECTS = ["window", "globalThis", "self"] as const;
export const MAP = "Map";
export const OBJECT = "Object";
export const URL_CONSTRUCTOR = "URL";
/** The platform's well-known symbols' holder, `Symbol.iterator`. */
export const WELL_KNOWN_SYMBOLS = "Symbol";
/** node:util's logging hook, `inspect.custom`. */
export const INSPECT_CUSTOM = "custom";
/** CommonJS's loader and node:module's maker of one. */
export const REQUIRE = "require";
export const CREATE_REQUIRE = "createRequire";
/** A DOM message event's payload. */
export const EVENT_DATA = "data";
/** A DOM element's data attributes, a mutation record's attribute, and an observer's attribute list. */
export const DATASET = "dataset";
export const RECORD_NAME = "attributeName";
export const ATTRIBUTE_FILTER = "attributeFilter";
/** The DOM and JSX members a URL is written to (graph/urls.ts holds the method a request through each takes). */
export const URL_MEMBERS = ["href", "src", "action", "formAction"] as const;

/** drizzle's query builder: the verbs that open a write on a table, the methods that store a value into it, the select
 *  that names a query's fields, and its primary-key builder. */
export const DRIZZLE_INSERT = "insert";
export const DRIZZLE_OPENERS: ReadonlySet<string> = new Set([DRIZZLE_INSERT, "update"]);
export const DRIZZLE_CONFLICT = "onConflictDoUpdate";
export const DRIZZLE_STORES: ReadonlySet<string> = new Set(["values", "set", DRIZZLE_CONFLICT]);
export const DRIZZLE_SELECTS: ReadonlySet<string> = new Set(["select"]);
export const DRIZZLE_PRIMARY_KEY = "primaryKey";
/** The Hono app methods that register a route, with the argument index that holds the path. */
export const ROUTE_METHODS: ReadonlyMap<string, number> = new Map([
  ["get", 0],
  ["post", 0],
  ["put", 0],
  ["delete", 0],
  ["patch", 0],
  ["options", 0],
  ["all", 0],
  ["on", 1],
]);
/** tRPC's procedure builder: the output schema and the mutation it ends in. */
export const TRPC_OUTPUT = "output";
export const TRPC_MUTATION = "mutation";
/** tRPC's link option a request URL is given under. */
export const TRPC_LINK_URL = "url";
/** The tRPC options-proxy verb for a paged query. */
export const PAGED_QUERY = "infiniteQueryOptions";
/** The tRPC proxy verbs whose input is the input of the procedure they are called on. */
export const TRPC_SENDS: ReadonlySet<string> = new Set([
  "mutate",
  "query",
  "subscribe",
  "queryOptions",
  "infiniteQueryOptions",
  "subscriptionOptions",
  "queryKey",
  "infiniteQueryKey",
  "queryFilter",
  "infiniteQueryFilter",
]);
/** The tRPC options-proxy verbs that build a cache key or a filter and send no request; every other verb a tRPC package
 *  declares on a procedure sends one. */
export const TRPC_KEY_VERBS: ReadonlySet<string> = new Set([
  "queryKey",
  "queryFilter",
  "infiniteQueryKey",
  "infiniteQueryFilter",
  "mutationKey",
  "pathKey",
  "pathFilter",
]);
/** A procedure's mutation options builder, whose result a TanStack mutation hook takes. */
export const MUTATION_OPTIONS = "mutationOptions";
/** TanStack Query's mutation calls, which send their argument to the mutation the hook was built with. */
export const MUTATE_CALLS: ReadonlySet<string> = new Set(["mutate", "mutateAsync"]);
/** TanStack form's JSX components whose `name` attribute is a field path, the attribute, and the form methods that
 *  store into the field their first argument names. */
export const FORM_FIELDS: ReadonlySet<string> = new Set(["Field", "AppField"]);
export const FORM_NAME = "name";
export const FORM_WRITES: ReadonlySet<string> = new Set([
  "setFieldValue",
  "pushFieldValue",
  "insertFieldValue",
  "replaceFieldValue",
  "removeFieldValue",
  "swapFieldValues",
  "moveFieldValues",
  "clearFieldValues",
  "resetField",
  "deleteField",
]);
/** The router's navigation option a URL is written to. */
export const NAVIGATION_MEMBER = "to";
/** tailwind-variants' table builder. */
export const TV = "tv";
/** Playwright's page and locator methods that run their first argument in the page. */
export const IN_PAGE: ReadonlySet<string> = new Set(["evaluate", "evaluateAll", "evaluateHandle", "$eval", "$$eval", "waitForFunction", "addInitScript"]);

const ZOD_NAMES: ReadonlySet<string> = new Set([
  ...ZOD_OBJECT_BUILDERS,
  ...ZOD_UNION_BUILDERS,
  ...ZOD_EXTENDERS,
  ZOD_LAZY,
  ZOD_TYPE,
  ...ZOD_OPTIONAL,
  ...ZOD_ENUM_DOORS,
  ...ZOD_INFERS,
  ...ZOD_PARSES,
]);
const PLATFORM_NAMES: ReadonlySet<string> = new Set([
  ...REFLECTIVE_CALLS.keys(),
  ...MEMBERSHIP_METHODS,
  ...KEY_TRANSPARENT,
  ...ARRAY_TYPES,
  ...STORING_METHODS,
  ...ELEMENT_CALLBACKS,
  ...GLOBAL_OBJECTS,
  MAP,
  OBJECT,
  URL_CONSTRUCTOR,
  WELL_KNOWN_SYMBOLS,
  INSPECT_CUSTOM,
  REQUIRE,
  CREATE_REQUIRE,
  EVENT_DATA,
  DATASET,
  RECORD_NAME,
  ATTRIBUTE_FILTER,
]);

/** Every name each package's declarations are asked about. */
const LIBRARY_NAMES: Readonly<Record<Library, ReadonlySet<string>>> = {
  [ZOD_PACKAGE]: ZOD_NAMES,
  [PLATFORM]: PLATFORM_NAMES,
  [DRIZZLE_PACKAGE]: new Set([...DRIZZLE_OPENERS, ...DRIZZLE_STORES, ...DRIZZLE_SELECTS, DRIZZLE_PRIMARY_KEY]),
  [HONO_PACKAGE]: new Set(ROUTE_METHODS.keys()),
  [TRPC_SERVER]: new Set([TRPC_OUTPUT, TRPC_MUTATION]),
  [TRPC_CLIENT]: TRPC_SENDS,
  [TRPC_QUERY]: new Set([PAGED_QUERY, MUTATION_OPTIONS, ...TRPC_SENDS]),
  [QUERY_CORE]: MUTATE_CALLS,
  [REACT_QUERY]: MUTATE_CALLS,
  [PLAYWRIGHT_CORE]: IN_PAGE,
};
const ALL_NAMES: ReadonlySet<string> = new Set(Object.values(LIBRARY_NAMES).flatMap((names) => [...names]));

/** Whether a name node resolves to a declaration of a library. */
export interface LibraryNames {
  /** Whether `name`'s own declaration comes from one of `libraries`.
   *  @throws When `name` sits at no collected position, or spells no name an asked library's table lists. */
  readonly declaredBy: (name: Node, libraries: Library | readonly Library[]) => boolean;
}

// This module sits below the walk and the role readers, so it compares remote nodes by span itself (roles.ts sameNode).
const sameNode = (a: Node | undefined, b: Node): boolean => a !== undefined && a.pos === b.pos && a.end === b.end && a.kind === b.kind;

/** How a collected name's declaration is found: the symbol at the node, or for an object literal's key the member its
 *  contextual type declares under that name. */
type Position = "symbol" | "contextual";

// The position a name node sits at, or undefined for a node the pre-pass does not collect.
function positionOf(node: Node): Position | undefined {
  const { parent } = node;
  if (!(isIdentifier(node) && ALL_NAMES.has(node.text))) {
    return undefined;
  }
  if ((isPropertyAssignment(parent) || isShorthandPropertyAssignment(parent)) && sameNode(parent.name, node) && isObjectLiteralExpression(parent.parent)) {
    return "contextual";
  }
  return namedBySymbol(node, parent) ? "symbol" : undefined;
}

// A name whose own symbol is its declaration's: an access's name or receiver, a callee, a type reference's name, an
// import specifier's imported name, a JSX attribute's name.
const namedBySymbol = (node: Node, parent: Node): boolean =>
  (isPropertyAccessExpression(parent) && (sameNode(parent.name, node) || sameNode(parent.expression, node))) ||
  ((isCallExpression(parent) || isNewExpression(parent)) && sameNode(parent.expression, node)) ||
  (isTypeReferenceNode(parent) && sameNode(parent.typeName, node)) ||
  (isQualifiedName(parent) && sameNode(parent.right, node) && isTypeReferenceNode(parent.parent)) ||
  (isImportSpecifier(parent) && sameNode(parent.propertyName ?? parent.name, node)) ||
  (isJsxAttribute(parent) && sameNode(parent.name, node));

const spanKey = (node: Node): string => `${node.getSourceFile().fileName}#${String(node.pos)}-${String(node.end)}`;

function* librariesOf(world: NativeWorld, handles: readonly NodeHandle[]): APIRequestGenerator<readonly Library[]> {
  const [packages, platform] = yield* all(all(...handles.map((handle) => world.packageOf(handle))), all(...handles.map((handle) => isPlatform(world, handle))));
  const named = LIBRARIES.filter((library) => library !== PLATFORM && packages.includes(library));
  return platform.includes(true) ? [...named, PLATFORM] : named;
}

// The members an object literal's contextual type declares under a key's name.
function* contextualMembers(world: NativeWorld, key: Node & { readonly text: string }): APIRequestGenerator<readonly NativeSymbol[]> {
  const literal = key.parent.parent as ObjectLiteralExpression;
  const contextual = yield* world.checker.getContextualType.gen(literal);
  if (contextual === undefined) {
    return [];
  }
  const members = yield* propertiesNamed(world.checker, yield* world.checker.getNonNullableType.gen(contextual), key.text);
  return members.filter((member): member is NativeSymbol => member !== undefined);
}

const settledNames = (declared: ReadonlyMap<string, readonly Library[]>, collected: ReadonlySet<string>): LibraryNames => ({
  declaredBy: (name, libraries): boolean => {
    const asked = typeof libraries === "string" ? [libraries] : libraries;
    const text = isIdentifier(name) ? name.text : null;
    const listed = text !== null && collected.has(spanKey(name)) && asked.some((library) => LIBRARY_NAMES[library].has(text));
    if (!listed) {
      throw new Error(`library-names: ${text ?? "a non-identifier"} is no name the pre-pass collects for ${asked.join(", ")}`);
    }
    const found = declared.get(spanKey(name)) ?? [];
    return asked.some((library) => found.includes(library));
  },
});

// Every name node of a world's files at a collected position, by how its declaration is found.
function collectedNames(world: NativeWorld): { readonly bySymbol: readonly Node[]; readonly byContext: readonly (Node & { readonly text: string })[] } {
  const bySymbol: Node[] = [];
  const byContext: (Node & { readonly text: string })[] = [];
  const visit = (node: Node): void => {
    const position = positionOf(node);
    if (position === "symbol") {
      bySymbol.push(node);
    } else if (position === "contextual" && isIdentifier(node)) {
      byContext.push(node);
    }
    node.forEachChild(visit);
  };
  for (const source of world.files) {
    source.forEachChild(visit);
  }
  return { bySymbol, byContext };
}

const SETTLED = new WeakMap<NativeWorld, LibraryNames>();

/** The world's settled library names, collected and resolved on first ask.
 *  @remarks Settling runs batches, so ask it first outside any request generator; the graph build does before its walk. */
export function libraryNames(world: NativeWorld): LibraryNames {
  const known = SETTLED.get(world);
  if (known !== undefined) {
    return known;
  }
  const { bySymbol, byContext } = collectedNames(world);
  const symbols = world.symbolsAt(bySymbol);
  const members = world.batch(byContext.map((key) => contextualMembers(world, key)));
  const names = [...bySymbol, ...byContext];
  const handles = [...symbols.map((symbol) => symbol?.declarations ?? []), ...members.map((found) => found.flatMap((member) => member.declarations))];
  // The checker's own global scope, `globalThis`, is a module symbol with no declaration; a binding of ours under that
  // name declares one.
  const globalScope = symbols.map((symbol) => symbol !== undefined && symbol.declarations.length === 0 && hasFlag(symbol.flags, SymbolFlags.ValueModule));
  const libraries = world
    .batch(handles.map((found) => librariesOf(world, found)))
    .map((found, at): readonly Library[] => (globalScope[at] === true ? [PLATFORM] : found));
  const declared = new Map(names.flatMap((name, at) => ((libraries[at]?.length ?? 0) > 0 ? [[spanKey(name), libraries[at] ?? []] as const] : [])));
  const settled = settledNames(declared, new Set(names.map(spanKey)));
  SETTLED.set(world, settled);
  return settled;
}
