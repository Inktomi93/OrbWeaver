// Walks a zod schema tree by its core kinds, so a suite can inspect every schema a mounted parser reaches.

import { isZodCoreSchema } from "@orb/kit/zod-schema";
import { z } from "zod";

/** The schema's core definition; a schema outside zod's core kinds is a test-setup error. */
export function zodDefinition(schema: z.core.$ZodType): z.core.$ZodTypes["_zod"]["def"] {
  if (!isZodCoreSchema(schema)) {
    throw new Error("a schema carries no zod core discriminant");
  }
  return schema._zod.def;
}

/** The schemas a schema directly holds, in declaration order. */
export function zodSchemaChildren(schema: z.core.$ZodType): readonly z.core.$ZodType[] {
  const def = zodDefinition(schema);
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
