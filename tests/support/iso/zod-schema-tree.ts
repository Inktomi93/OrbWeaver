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

// Object keys and union or tuple positions name a step; a wrapper (optional, nullable, ...) adds none.
function pathStep(kind: string, key: string | undefined, index: number): string {
  if (kind === "object") {
    return `.${key ?? "*"}`;
  }
  if (kind === "array") {
    return "[]";
  }
  return kind === "union" || kind === "tuple" ? `[${index}]` : "";
}

/** Every plain (strip-mode) object a parser reaches outside a `catch`, by path. A strict or loose object declares
 *  its unknown-key policy; strip drops a key silently. Below a `catch` no refusal can surface, so strip is the
 *  smaller loss there and the walk stops. */
export function stripObjectPaths(root: z.core.$ZodType): readonly string[] {
  const found: string[] = [];
  const seen = new Set<z.core.$ZodType>();
  const visit = (schema: z.core.$ZodType, path: string): void => {
    if (seen.has(schema)) {
      return;
    }
    seen.add(schema);
    const def = zodDefinition(schema);
    if (def.type === "catch") {
      return;
    }
    if (def.type === "object" && def.catchall === undefined) {
      found.push(path === "" ? "$" : path);
    }
    const keys = def.type === "object" ? Object.keys(def.shape) : [];
    zodSchemaChildren(schema).forEach((child, index) => {
      visit(child, `${path}${pathStep(def.type, keys[index], index)}`);
    });
  };
  visit(root, "");
  return found;
}
