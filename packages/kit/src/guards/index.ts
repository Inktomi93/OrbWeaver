// Small structural type-guards shared across layers. Narrowing helpers that let callers drop
// `as Record<string, unknown>` casts in favor of a real runtime check, and the compile-time guards that make a
// table over a closed union name every member.

/** What a read checks to stop early. An `AbortSignal` satisfies it; the isomorphic contracts have no DOM lib to name one. */
export interface Cancellation {
  readonly aborted: boolean;
}

export type PrimitiveValue = string | number | boolean | bigint | symbol | null | undefined;

/** Primitive values have native text spellings without an object's default stringification. */
export function isPrimitive(value: unknown): value is PrimitiveValue {
  return value === null || (typeof value !== "object" && typeof value !== "function");
}

/**
 * True for a non-null, non-array object. Narrows `unknown` to `Record<string, unknown>` so a value
 * coming off `JSON.parse` / a stored blob can be treated as an object map without a cast.
 *
 * THE LOOSE CHECK IS THE CONTRACT, not an oversight (re-derived on the tree). The name
 * promises "plain", so the obvious tightening is a prototype test
 * (`Object.getPrototypeOf(v) === Object.prototype || null`), which would also exclude `Date`, `Map` and
 * class instances. **That would break a live caller**: `@orb/db`'s `db-errors.ts` walks an ERROR's `cause` chain through this guard
 * (`isPlainObject(current) && "cause" in current`), and an `Error` is a class instance. The external
 * review's premise that no call site feeds it one is refuted.
 *
 * So read this as "is this value INDEXABLE BY STRING KEY" — every one of its ~120 call sites asks
 * exactly that (a parsed blob, a persisted store slice, a wrapped error). A caller that needs
 * "specifically a JSON object literal" needs a DIFFERENT predicate, not a narrowing of this one, and
 * must state which it wants.
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The value when it is a finite number, else `null`: the read for a number off a parsed blob that may be missing, a string or `NaN`. */
export function finiteNumberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** True when `T` is a union of two or more members. */
type IsUnion<T, All = T> = T extends unknown ? ([All] extends [T] ? false : true) : never;

// The walks below recurse instead of mapping over the tuple: a mapped type over the call's own type parameter makes
// the compiler reverse-map the argument and lose the literal tuple it should infer. Each is tail-recursive, so a long
// table stays within the compiler's depth.

/** The entries that hold a union rather than one member: a value typed as the whole union would cover every member
 *  while naming none. */
type UnionEntries<Items extends readonly unknown[], Found = never> = Items extends readonly [infer Head, ...infer Rest]
  ? UnionEntries<Rest, true extends IsUnion<Head> ? Found | Head : Found>
  : Found;

/** The members named more than once. */
type Repeated<Items extends readonly unknown[], Seen = never, Twice = never> = Items extends readonly [infer Head, ...infer Rest]
  ? Repeated<Rest, Seen | Head, [Head] extends [Seen] ? Twice | Head : Twice>
  : Twice;

/** The `Key` field of each row, in row order; an array that is not a literal tuple keeps its array shape. */
type KeysOf<Rows extends readonly unknown[], Key extends PropertyKey, Keys extends readonly unknown[] = []> = number extends Rows["length"]
  ? readonly (Rows[number] extends Readonly<Record<Key, unknown>> ? Rows[number][Key] : never)[]
  : Rows extends readonly [infer Head, ...infer Rest]
    ? KeysOf<Rest, Key, [...Keys, Head extends Readonly<Record<Key, unknown>> ? Head[Key] : never]>
    : Keys;

/** Nothing extra when `Items` is a literal tuple naming every member of `Union` once, each by its own literal;
 *  otherwise a field for each fault (`missing`, `notALiteralTable`, `notOneMember`, `namedTwice`), so the call that
 *  takes it fails `tsc` and the error names the members. */
type NamesEvery<Union, Items extends readonly unknown[]> = ([Exclude<Union, Items[number]>] extends [never]
  ? unknown
  : { readonly missing: Exclude<Union, Items[number]> }) &
  (number extends Items["length"] ? { readonly notALiteralTable: Items } : unknown) &
  ([UnionEntries<Items>] extends [never] ? unknown : { readonly notOneMember: UnionEntries<Items> }) &
  ([Repeated<Items>] extends [never] ? unknown : { readonly namedTwice: Repeated<Items> });

/** A tuple of every member of `Union`, each once, returned as given. A member the tuple leaves out, names twice, or
 *  covers only through a value typed as the whole union fails `tsc`. `everyMember<Tone>()(["info", "warn"])`. */
export function everyMember<Union>(): <const Tuple extends readonly Union[] | readonly []>(tuple: Tuple & NamesEvery<Union, Tuple>) => Tuple {
  return (tuple) => tuple;
}

/** Rows whose `Key` field names every member of `Covers` (by default the whole union that field holds), one row per key,
 *  returned as given. A member no row names, a key two rows name, or a row whose key is typed as a union fails `tsc`.
 *  `everyRow<RefusalCase, "reason">()([...])`; a registry whose keys reach past the members it must cover names them,
 *  `everyRow<TemplateDef, "id", RegistryTemplateId>()([...])`. */
export function everyRow<Row, Key extends keyof Row, Covers extends Row[Key] = Row[Key]>(): <const Rows extends readonly Row[] | readonly []>(
  rows: Rows & NamesEvery<Covers, KeysOf<Rows, Key>>,
) => Rows {
  return (rows) => rows;
}
