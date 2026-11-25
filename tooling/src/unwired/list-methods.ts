// What the platform's array methods do with a list: the facts the value trace reads backward (graph/values.ts) and the
// send chase reads forward (open-sends.ts).
import type { CallExpression, Expression, Node } from "@typescript/native/ast";
import { isCallExpression, isPropertyAccessExpression } from "@typescript/native/ast";

const LIST_RESULTS = ["same", "element", "mapped", "flat"] as const;
/** What an array method returns, against its receiver. */
export type ListResult = (typeof LIST_RESULTS)[number];

/** What each array method returns against its receiver. */
export const RESULTS: ReadonlyMap<string, ListResult> = new Map([
  ...["filter", "slice", "toSorted", "toReversed", "sort", "reverse"].map((name) => [name, "same"] as const),
  ...["find", "findLast", "at"].map((name) => [name, "element"] as const),
  ["map", "mapped"],
  ["flatMap", "flat"],
]);

/** The array methods whose callback takes the receiver's elements, by the callback parameter that takes them. */
export const ELEMENT_PARAMETERS: ReadonlyMap<string, readonly number[]> = new Map<string, readonly number[]>([
  ...["forEach", "map", "flatMap", "filter", "find", "findLast", "findIndex", "findLastIndex", "some", "every"].map((name): [string, readonly number[]] => [
    name,
    [0],
  ]),
  ...["reduce", "reduceRight"].map((name): [string, readonly number[]] => [name, [1]]),
  ...["sort", "toSorted"].map((name): [string, readonly number[]] => [name, [0, 1]]),
]);

/** The array method a callback is handed to, with the receiver and the callback's argument index. */
export function methodCallOf(
  fn: Node,
): { readonly call: CallExpression; readonly method: string; readonly receiver: Expression; readonly index: number } | undefined {
  const call = fn.parent;
  if (!(isCallExpression(call) && isPropertyAccessExpression(call.expression))) {
    return undefined;
  }
  const index = call.arguments.findIndex((argument) => argument.pos === fn.pos && argument.end === fn.end);
  return index < 0 ? undefined : { call, method: call.expression.name.text, receiver: call.expression.expression, index };
}
