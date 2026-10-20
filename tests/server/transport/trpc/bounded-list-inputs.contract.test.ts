// @subject packages/server/src/transport/trpc/router.ts
// @subject packages/contracts/src/chat/inputs.ts
import "@orb/testkit/node/composed-real.ts";
import { readFile } from "node:fs/promises";
import { CHAT_MESSAGE_LIST_MAX_LIMIT } from "@orb/contracts/chat";
import { appRouter } from "@orb/server/transport/trpc";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";
import { vi } from "vitest";
import { z } from "zod";

interface NumericCeiling {
  readonly numeric: boolean;
  readonly maximum?: number;
}

type CoreDefType = z.core.$ZodTypes["_zod"]["def"]["type"];
// Every core schema kind, checked both ways by `satisfies`: a new zod kind or a misspelled one fails tsc here.
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

// A schema is a core union member only when its runtime discriminant names one of zod's core kinds.
function isCoreSchema(schema: z.core.$ZodType): schema is z.core.$ZodTypes {
  return "_zod" in schema && Object.hasOwn(CORE_DEF_TYPES, schema._zod.def.type);
}

function definition(schema: z.core.$ZodType): z.core.$ZodTypes["_zod"]["def"] {
  if (!isCoreSchema(schema)) {
    throw new Error("a limit schema carries no zod core discriminant");
  }
  return schema._zod.def;
}

function numberCeiling(def: z.core.$ZodNumberDef): NumericCeiling {
  const maxima = (def.checks ?? []).flatMap((check) => {
    if (!(check instanceof z.core.$ZodCheckLessThan)) {
      return [];
    }
    const bound = check._zod.def;
    return typeof bound.value === "number" && Number.isFinite(bound.value) && bound.when === undefined ? [bound.value] : [];
  });
  return maxima.length === 0 ? { numeric: true } : { numeric: true, maximum: Math.min(...maxima) };
}

function ceiling(schema: z.core.$ZodType, active: ReadonlySet<z.core.$ZodType> = new Set()): NumericCeiling {
  if (active.has(schema)) {
    throw new Error("a numeric limit has an unclosed recursive alternative");
  }
  const next = new Set(active).add(schema);
  const def = definition(schema);
  switch (def.type) {
    case "number":
      return numberCeiling(def);
    case "literal": {
      const values = def.values.filter((value): value is number => typeof value === "number");
      return values.length === 0 ? { numeric: false } : { numeric: true, maximum: Math.max(...values) };
    }
    case "enum": {
      const values = z.core.util.getEnumValues(def.entries).filter((value): value is number => typeof value === "number");
      return values.length === 0 ? { numeric: false } : { numeric: true, maximum: Math.max(...values) };
    }
    case "optional":
    case "nullable":
    case "nonoptional":
    case "default":
    case "prefault":
    case "catch":
    case "readonly":
      return ceiling(def.innerType, next);
    case "lazy":
      if (!(schema instanceof z.core.$ZodLazy)) {
        throw new Error("the lazy schema has no native lazy owner");
      }
      return ceiling(schema._zod.innerType, next);
    case "union": {
      const branches = def.options.map((option) => ceiling(option, next)).filter((branch) => branch.numeric);
      if (branches.some((branch) => branch.maximum === undefined)) {
        return { numeric: true };
      }
      const maxima = branches.flatMap((branch) => (branch.maximum === undefined ? [] : [branch.maximum]));
      return maxima.length === 0 ? { numeric: false } : { numeric: true, maximum: Math.max(...maxima) };
    }
    case "intersection": {
      const branches = [ceiling(def.left, next), ceiling(def.right, next)];
      const maxima = branches.flatMap((branch) => (branch.maximum === undefined ? [] : [branch.maximum]));
      return maxima.length === 0 ? { numeric: branches.some((branch) => branch.numeric) } : { numeric: true, maximum: Math.min(...maxima) };
    }
    case "any":
    case "unknown":
    case "custom":
    case "transform":
    case "pipe":
      throw new Error(`a limit has an opaque ${def.type} numeric admission`);
    case "string":
    case "bigint":
    case "boolean":
    case "symbol":
    case "undefined":
    case "object":
    case "function":
    case "map":
    case "array":
    case "date":
    case "null":
    case "never":
    case "void":
    case "tuple":
    case "record":
    case "set":
    case "promise":
    case "template_literal":
    case "nan":
    case "success":
    case "file":
      return { numeric: false };
    default: {
      const unhandled: never = def;
      throw new Error(`unsupported numeric-limit schema definition: ${String(unhandled)}`);
    }
  }
}

function requireBound(schema: z.core.$ZodType): boolean {
  const bound = ceiling(schema);
  if (!bound.numeric) {
    return false;
  }
  const max = bound.maximum;
  if (max === undefined || !Number.isFinite(max)) {
    throw new Error("a numeric limit has no explicit finite validation ceiling");
  }
  const over = max + Math.max(1, Math.abs(max) * Number.EPSILON * 2);
  if (Number.isFinite(over) && over > max && z.safeParse(schema, over).success) {
    throw new Error("a numeric limit accepts an over-ceiling request");
  }
  const absent = z.safeParse(schema, undefined);
  if (absent.success && typeof absent.data === "number" && absent.data > max) {
    throw new Error("a numeric limit defaults above its validation ceiling");
  }
  return true;
}

function schemaChildren(schema: z.core.$ZodType): readonly z.core.$ZodType[] {
  const def = definition(schema);
  switch (def.type) {
    case "object":
      return [...Object.values(def.shape), ...(def.catchall === undefined ? [] : [def.catchall])];
    case "array":
      return [def.element];
    case "tuple":
      return [...def.items, ...(def.rest === null ? [] : [def.rest])];
    case "record":
    case "map":
      return [def.keyType, def.valueType];
    case "set":
      return [def.valueType];
    case "union":
      return def.options;
    case "intersection":
      return [def.left, def.right];
    case "pipe":
      return [def.in, def.out];
    case "function":
      return [def.input, def.output];
    case "optional":
    case "nullable":
    case "nonoptional":
    case "default":
    case "prefault":
    case "catch":
    case "readonly":
    case "promise":
    case "success":
      return [def.innerType];
    case "lazy":
      if (!(schema instanceof z.core.$ZodLazy)) {
        throw new Error("the lazy schema has no native lazy owner");
      }
      return [schema._zod.innerType];
    case "template_literal":
      return def.parts.flatMap((part) => (part instanceof z.core.$ZodType ? [part] : []));
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
    case "custom":
    case "transform":
    case "nan":
    case "file":
      return [];
    default: {
      const unhandled: never = def;
      throw new Error(`unsupported native schema definition: ${String(unhandled)}`);
    }
  }
}

function objectValue(value: unknown): value is object {
  return value !== null && typeof value === "object";
}

function publicDataValues(value: object): readonly object[] {
  if (value instanceof Map || value instanceof Set) {
    return Array.from(value.values(), (child: unknown) => child).filter(objectValue);
  }
  // These are data bundles, not module namespace bindings; do not execute arbitrary object getters.
  return Object.values(Object.getOwnPropertyDescriptors(value))
    .map((descriptor): unknown => descriptor.value)
    .filter(objectValue);
}

function inspectSchemaValues(value: object): number {
  const seen = new WeakSet<object>();
  let limits = 0;
  const visit = (current: object): void => {
    if (seen.has(current)) {
      return;
    }
    seen.add(current);
    if (!(current instanceof z.core.$ZodType)) {
      for (const child of publicDataValues(current)) {
        visit(child);
      }
      return;
    }
    const def = definition(current);
    if (def.type === "object" && def.shape["limit"] !== undefined && requireBound(def.shape["limit"])) {
      limits++;
    }
    for (const child of schemaChildren(current)) {
      visit(child);
    }
  };
  visit(value);
  return limits;
}

test("every actual mounted input parser and public contract schema retains explicit numeric limit bounds", async () => {
  expect(Object.keys(appRouter._def.lazy)).toEqual([]);
  const procedures = Object.values(appRouter._def.procedures);
  expect(procedures.length).toBeGreaterThan(0);
  let mountedLimits = 0;
  for (const procedure of procedures) {
    if (typeof procedure !== "function") {
      throw new Error("the native procedure table contains an unresolved non-procedure entry");
    }
    for (const parser of procedure._def.inputs) {
      expect(parser).toBeInstanceOf(z.core.$ZodType);
      if (!(parser instanceof z.core.$ZodType)) {
        throw new Error("the mounted input parser has no native Zod schema population");
      }
      mountedLimits += inspectSchemaValues(parser);
    }
  }
  expect(mountedLimits).toBeGreaterThan(0);
  const manifest = z
    .object({ exports: z.record(z.string(), z.unknown()) })
    .parse(JSON.parse(await readFile(new URL("../package.json", import.meta.resolve("@orb/contracts")), "utf8")));
  let contractLimits = 0;
  for (const subpath of Object.keys(manifest.exports)) {
    const specifier = `@orb/contracts${subpath === "." ? "" : subpath.slice(1)}`;
    const exported: object = await import(specifier);
    for (const value of Object.values(exported).filter(objectValue)) {
      contractLimits += inspectSchemaValues(value);
    }
  }
  expect(contractLimits).toBeGreaterThan(0);
});

test.for([
  { name: "number without a ceiling", value: z.number(), accepted: false },
  { name: "integer format without a domain ceiling", value: z.int(), accepted: false },
  { name: "coerced number without a ceiling", value: z.coerce.number(), accepted: false },
  { name: "infinite ceiling", value: z.number().max(Number.POSITIVE_INFINITY), accepted: false },
  { name: "documentation-only ceiling", value: z.int().meta({ maximum: 10 }), accepted: false },
  {
    name: "conditional validation",
    value: z.int().check(new z.core.$ZodCheckLessThan({ check: "less_than", value: 10, inclusive: true, when: () => false })),
    accepted: false,
  },
  { name: "optional nullable readonly", value: z.int().max(10).optional().nullable().readonly(), accepted: true },
  { name: "bounded default", value: z.int().max(10).default(10), accepted: true },
  { name: "unbounded default output", value: z.int().max(10).default(11), accepted: false },
  { name: "catch converts refusal to success", value: z.int().max(10).catch(1), accepted: false },
  { name: "bounded alternatives", value: z.union([z.number().max(10), z.number().max(20)]), accepted: true },
  { name: "unbounded alternative", value: z.union([z.number().max(10), z.number()]), accepted: false },
  { name: "intersection ceiling", value: z.intersection(z.number(), z.number().max(10)), accepted: true },
  { name: "finite literal", value: z.literal(10), accepted: true },
  { name: "string data", value: z.string(), accepted: true },
  { name: "opaque data", value: z.unknown(), accepted: false },
])("native limit metadata distinguishes $name", ({ value, accepted }) => {
  let valid = true;
  try {
    inspectSchemaValues(z.object({ limit: value }));
  } catch {
    valid = false;
  }
  expect(valid).toBe(accepted);
});

test("schema reuse and ordinary recursion cannot hide numeric limit fields", () => {
  const unbounded = z.int();
  expect(() => inspectSchemaValues(z.object({ unrelated: unbounded, limit: unbounded }))).toThrow("explicit finite");
  const recursive = z.object({
    limit: z.int().max(10),
    get next() {
      return recursive.optional();
    },
  });
  expect(inspectSchemaValues(recursive)).toBe(1);
  const foreign = { z: { number: () => ({ max: 10 }) }, limit: { maxValue: 10 } };
  expect(inspectSchemaValues(foreign)).toBe(0);
});

test("the real caller refuses an over-limit message request before the domain read", async () => {
  await using root = await createServerHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const room = await caller.chat.startChat({ characterIds: [], opening: "none" });
  const read = vi.spyOn(root.services.chat, "listMessages");
  try {
    const page = await caller.chat.listMessages({ chatId: room.chat.id, limit: CHAT_MESSAGE_LIST_MAX_LIMIT });
    expect(page.messages).toEqual([]);
    expect(read).toHaveBeenCalledTimes(1);
    await expect(caller.chat.listMessages({ chatId: room.chat.id, limit: CHAT_MESSAGE_LIST_MAX_LIMIT + 1 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(read).toHaveBeenCalledTimes(1);
  } finally {
    read.mockRestore();
  }
});
