// @orb/kit/zod-schema — zod schema-tree facts. `strictTwin` derives the strict twin of a schema whose plain objects
// also serve a stored or external read: those reads keep strip mode (Spine-Config "Degrading is read-only"), while a
// tRPC input or output refuses an undeclared key, so a payload carrying a key the schema does not declare fails loudly.

import { z } from "zod";

type CoreSchema = z.core.$ZodTypes;
type CoreDefType = CoreSchema["_zod"]["def"]["type"];

// Every core kind, checked both ways by `satisfies`: a new zod kind fails tsc here.
const CORE_DEF_TYPES = {
  number: true,
  literal: true,
  enum: true,
  optional: true,
  nullable: true,
  nonoptional: true,
  default: true,
  prefault: true,
  catch: true,
  readonly: true,
  lazy: true,
  union: true,
  intersection: true,
  any: true,
  unknown: true,
  custom: true,
  transform: true,
  pipe: true,
  string: true,
  bigint: true,
  boolean: true,
  symbol: true,
  undefined: true,
  object: true,
  function: true,
  map: true,
  array: true,
  date: true,
  null: true,
  never: true,
  void: true,
  tuple: true,
  record: true,
  set: true,
  promise: true,
  ["template_literal"]: true,
  nan: true,
  success: true,
  file: true,
} as const satisfies Record<CoreDefType, true>;

/** Whether a schema's runtime discriminant names one of zod's core kinds, narrowing it to the core union. */
export function isZodCoreSchema(schema: z.core.$ZodType): schema is CoreSchema {
  return Object.hasOwn(CORE_DEF_TYPES, schema._zod.def.type);
}

function strictShape(shape: z.core.$ZodShape, twin: (schema: z.core.$ZodType) => z.core.$ZodType): z.core.$ZodShape {
  const next: z.core.$ZodShape = {};
  for (const key of Object.keys(shape)) {
    // Lazy, so a self-referencing shape (a getter over its own schema) resolves through the memo, not a loop.
    Object.defineProperty(next, key, { enumerable: true, get: () => twin(shape[key] ?? z.never()) });
  }
  return next;
}

// One clone per kind that holds children. A `catch` is a boundary: below it a refusal cannot surface, so a strict
// object there would widen the heal from one key to the whole value. Opaque kinds and leaves are returned as-is.
function cloneStrict(schema: CoreSchema, twin: (child: z.core.$ZodType) => z.core.$ZodType): z.core.$ZodType {
  const def = schema._zod.def;
  switch (def.type) {
    case "object":
      return z.core.clone(schema, { ...def, shape: strictShape(def.shape, twin), catchall: def.catchall ?? z.never() });
    case "array":
      return z.core.clone(schema, { ...def, element: twin(def.element) });
    case "tuple":
      return z.core.clone(schema, { ...def, items: def.items.map(twin), rest: def.rest === null ? null : twin(def.rest) });
    case "record":
      // A record key is a string-like schema, never an object, so only the value side can hold one.
      return z.core.clone(schema, { ...def, valueType: twin(def.valueType) });
    case "map":
      return z.core.clone(schema, { ...def, keyType: twin(def.keyType), valueType: twin(def.valueType) });
    case "set":
      return z.core.clone(schema, { ...def, valueType: twin(def.valueType) });
    case "union":
      return z.core.clone(schema, { ...def, options: def.options.map(twin) });
    case "intersection":
      return z.core.clone(schema, { ...def, left: twin(def.left), right: twin(def.right) });
    case "pipe":
      return z.core.clone(schema, { ...def, in: twin(def.in), out: twin(def.out) });
    case "lazy": {
      // A fresh lazy, never a def clone: zod caches the resolved inner type on the def itself, so a copied def would
      // carry the source's strip-mode inner once anything has parsed through it.
      const getter = def.getter;
      return z.lazy(() => twin(getter()));
    }
    case "optional":
      return z.core.clone(schema, { ...def, innerType: twin(def.innerType) });
    case "nullable":
      return z.core.clone(schema, { ...def, innerType: twin(def.innerType) });
    case "nonoptional":
      return z.core.clone(schema, { ...def, innerType: twin(def.innerType) });
    case "default":
      return z.core.clone(schema, { ...def, innerType: twin(def.innerType) });
    case "prefault":
      return z.core.clone(schema, { ...def, innerType: twin(def.innerType) });
    case "readonly":
      return z.core.clone(schema, { ...def, innerType: twin(def.innerType) });
    case "promise":
      return z.core.clone(schema, { ...def, innerType: twin(def.innerType) });
    case "success":
      return z.core.clone(schema, { ...def, innerType: twin(def.innerType) });
    case "catch":
    case "function":
    case "template_literal":
    case "transform":
    case "custom":
    case "string":
    case "number":
    case "bigint":
    case "boolean":
    case "date":
    case "symbol":
    case "undefined":
    case "null":
    case "any":
    case "unknown":
    case "never":
    case "void":
    case "literal":
    case "enum":
    case "nan":
    case "file":
      return schema;
    default: {
      const unhandled: never = def;
      throw new Error(`strictTwin: unsupported zod kind ${String(unhandled)}`);
    }
  }
}

/**
 * The schema with every plain (strip-mode) object it reaches made strict, refinements, defaults and transforms
 * kept. The inferred type is unchanged: zod's strict and strip configs are structurally identical.
 *
 * @remarks Use at a procedure's `.input()` or `.output()` when the schema is shared with a stored or external read
 * that must keep strip mode; a wire-only schema declares `z.strictObject` at its source instead.
 */
export function strictTwin<T extends z.core.$ZodType>(schema: T): T {
  const twins = new WeakMap<z.core.$ZodType, z.core.$ZodType>();
  const twin = (child: z.core.$ZodType): z.core.$ZodType => {
    const known = twins.get(child);
    if (known !== undefined) {
      return known;
    }
    if (!isZodCoreSchema(child)) {
      throw new Error("strictTwin: a schema carries no zod core kind");
    }
    const made = cloneStrict(child, twin);
    twins.set(child, made);
    return made;
  };
  // `z.core.clone` keeps the class and def kind, so the twin is a `T`; the switch over kinds cannot carry `T`.
  return twin(schema) as T;
}
