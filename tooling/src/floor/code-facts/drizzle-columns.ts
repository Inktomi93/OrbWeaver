// Drizzle column-consumption facts shared by `pnpm ast columns` and the JSON-column gates: the write call a value
// lands in (its table named by the chain's drizzle `insert`/`update` verb, so `Map.set` and a foreign `store.update`
// never qualify), the columns a write argument names, and whether a value's shape is a row of a table.
import type { Node, Type } from "ts-morph";
import { Node as N, SyntaxKind } from "ts-morph";
import { readDrizzleWriteTable } from "./drizzle-write-chain.ts";
import type { ReferenceFact } from "./reference-fact-contract.ts";

/** The drizzle write methods whose argument names columns. `set` alone is name-ambiguous (`Map.set`); it only
 *  counts when {@link readDrizzleWrite}'s chain walk lands on a drizzle `update(<T>)` call. */
const DRIZZLE_WRITE_METHODS: ReadonlySet<string> = new Set(["values", "set", "select"]);

/** The upsert form: its argument is a config object whose `set` property holds the written columns. */
const DRIZZLE_UPSERT_METHOD = "onConflictDoUpdate";
const UPSERT_SET_KEY = "set";
const INSERT_SELECT_METHOD = "select";

/** One drizzle write call: its method, the table expression its chain names, and its written argument. */
export interface DrizzleWrite {
  readonly method: string;
  readonly target: Node;
  readonly arg: Node | undefined;
}

/** The columns one write argument names, and whether it is (partly) opaque. */
export interface WrittenKeys {
  readonly names: readonly string[];
  readonly opaque: boolean;
}

// `.values(x)` / `.set(x)` / `.select(x)` take the argument directly; the upsert carries it on its config's `set`.
function writeArgOf(call: Node, method: string): Node | undefined {
  if (!N.isCallExpression(call)) {
    return;
  }
  const arg = call.getArguments()[0];
  if (method !== DRIZZLE_UPSERT_METHOD) {
    return arg;
  }
  if (arg === undefined || !N.isObjectLiteralExpression(arg)) {
    return;
  }
  const setProp = arg.getProperty(UPSERT_SET_KEY);
  return N.isPropertyAssignment(setProp) ? setProp.getInitializer() : undefined;
}

/** The drizzle write one call expression makes: `resolved(null)` for any call whose chain holds no drizzle write
 *  verb, `unresolved` for a chain that holds one this reader could not follow or declare. */
export function readDrizzleWrite(call: Node): ReferenceFact<DrizzleWrite | null> {
  const none: ReferenceFact<null> = { kind: "resolved", value: null, trace: { declarations: [], origin: call } };
  if (!N.isCallExpression(call)) {
    return none;
  }
  const expr = call.getExpression();
  if (!N.isPropertyAccessExpression(expr)) {
    return none;
  }
  const method = expr.getName();
  if (!(DRIZZLE_WRITE_METHODS.has(method) || method === DRIZZLE_UPSERT_METHOD)) {
    return none;
  }
  const table = readDrizzleWriteTable(expr.getExpression());
  if (table.kind === "unresolved") {
    return table;
  }
  return { ...table, value: table.value === null ? null : { method, target: table.value, arg: writeArgOf(call, method) } };
}

/** The drizzle write one call expression makes, or undefined for any call that is not one. A chain the reader cannot
 *  follow names no table, so it is no write here; {@link readDrizzleWrite} keeps the refusal for a caller that fails closed. */
export function drizzleWriteOf(call: Node): DrizzleWrite | undefined {
  const fact = readDrizzleWrite(call);
  return fact.kind === "resolved" ? (fact.value ?? undefined) : undefined;
}

/** The columns one write argument names. An object literal names its keys; a spread or computed key hides the rest;
 *  an array literal is a multi-row insert (union of its elements); anything else names nothing. */
export function writtenKeysOf(arg: Node | undefined): WrittenKeys {
  if (arg === undefined) {
    return { names: [], opaque: true };
  }
  if (N.isArrayLiteralExpression(arg)) {
    const merged = arg.getElements().map((element) => writtenKeysOf(element));
    return { names: merged.flatMap((m) => m.names), opaque: merged.some((m) => m.opaque) };
  }
  if (!N.isObjectLiteralExpression(arg)) {
    return { names: [], opaque: true };
  }
  const names: string[] = [];
  let opaque = false;
  for (const prop of arg.getProperties()) {
    if (N.isPropertyAssignment(prop) || N.isShorthandPropertyAssignment(prop)) {
      names.push(prop.getName());
    } else {
      opaque = true;
    }
  }
  return { names, opaque };
}

/** The named projection of `insert(table).select(db.select({ … }))`: its keys are the destination columns. */
export function insertSelectKeysOf(arg: Node | undefined): WrittenKeys {
  if (arg === undefined) {
    return { names: [], opaque: true };
  }
  const calls = [arg, ...arg.getDescendantsOfKind(SyntaxKind.CallExpression)].filter(N.isCallExpression);
  const select = calls.find((candidate) => {
    const expr = candidate.getExpression();
    return N.isPropertyAccessExpression(expr) && expr.getName() === INSERT_SELECT_METHOD;
  });
  return select === undefined ? { names: [], opaque: true } : writtenKeysOf(select.getArguments()[0]);
}

/** The columns a write names, by its method: the insert-select projection or the written argument's keys. */
export function writeKeysOf(write: DrizzleWrite): WrittenKeys {
  return write.method === INSERT_SELECT_METHOD ? insertSelectKeysOf(write.arg) : writtenKeysOf(write.arg);
}

/** The property names of a type, or undefined when it carries no usable shape (`any`, `unknown`, a primitive, an
 *  empty object): those must never match, or every column of every table would read as live. */
export function shapePropertyNames(type: Type): readonly string[] | undefined {
  if (type.isAny() || type.isUnknown()) {
    return;
  }
  const names = type.getProperties().map((p) => p.getName());
  return names.length === 0 ? undefined : names;
}

/** Is `type` a row of a table, or a projection or view of one: every property it carries is one of `columns`? */
export function shapeFitsColumns(type: Type, columns: ReadonlySet<string>): boolean {
  const names = shapePropertyNames(type);
  return names?.every((name) => columns.has(name)) === true;
}
