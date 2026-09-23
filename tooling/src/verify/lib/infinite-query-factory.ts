// The `windowed-infinite-query` family's one subject: a tRPC proxy member call `trpc.<router>.<proc>.infiniteQueryOptions(…)`.
// The occurrence policy judges each such call and the `-health` tripwire refuses a tree that holds none; if the
// two recognised the subject differently, the tripwire could see a call the occurrence policy skips (or the
// reverse) and certify a basis the judge never reads. A bare same-named function is not the subject.
import type { CallExpression, Node as MorphNode } from "ts-morph";
import { Node } from "ts-morph";

export const INFINITE_QUERY_FACTORY = "infiniteQueryOptions";

export function isInfiniteQueryFactoryCall(node: MorphNode): node is CallExpression {
  if (!Node.isCallExpression(node)) {
    return false;
  }
  const callee = node.getExpression();
  return Node.isPropertyAccessExpression(callee) && callee.getName() === INFINITE_QUERY_FACTORY;
}
