// Value-only views of the static readers for gates that judge by value. A key or literal follows a `const` or a
// `let` the file never reassigned; a reassigned binding names no ONE value, so these return undefined for it.
import type { Node as MorphNode } from "ts-morph";
import { readStaticNumber, readStaticString } from "./reference-fact.ts";

/** The static string `node` denotes, or undefined when it is dynamic, reassigned or not a string. */
export function staticString(node: MorphNode): string | undefined {
  const fact = readStaticString(node, "unreassigned");
  return fact.kind === "resolved" ? fact.value : undefined;
}

/** The static number `node` denotes (signs included), or undefined under the same refusals. */
export function staticNumber(node: MorphNode): number | undefined {
  const fact = readStaticNumber(node, "unreassigned");
  return fact.kind === "resolved" ? fact.value : undefined;
}
