// Type pins for createRegistry's WHOLE POINT: completeness is a compile fact — a `definitions`
// object missing (or adding) a member of the `Id` vocabulary tuple fails to compile. Runtime
// behavior lives in the .test.ts sibling.

import { createRegistry } from "@orb/client/lib";
import { expectTypeOf, test } from "vitest";

const ID_TUPLE = ["a", "b", "c"] as const;
type Id = (typeof ID_TUPLE)[number];
const IDS: readonly Id[] = ID_TUPLE;

test("a definitions map missing a vocabulary member fails to compile", () => {
  // @ts-expect-error — "c" is missing from the Record<Id, number>
  const registry = createRegistry("t", IDS, { a: 1, b: 2 });
  expectTypeOf(registry).not.toBeAny();
});

test("a definitions map with an extra member fails to compile", () => {
  // @ts-expect-error — "d" is not part of the Id vocabulary
  const registry = createRegistry("t", IDS, { a: 1, b: 2, c: 3, d: 4 });
  expectTypeOf(registry).not.toBeAny();
});

test("a complete definitions map compiles and types get()/list() over Def", () => {
  const registry = createRegistry("t", IDS, { a: 1, b: 2, c: 3 });
  expectTypeOf(registry.get("a")).toEqualTypeOf<number>();
  expectTypeOf(registry.list()).toEqualTypeOf<readonly number[]>();
});
