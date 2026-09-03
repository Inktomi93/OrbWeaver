// Type pins for createRegistry's WHOLE POINT: completeness is a compile fact — a `definitions`
// object missing (or adding) a member of the `Id` vocabulary tuple fails to compile. Runtime
// behavior lives in the .test.ts sibling.
//
// WHICH LANE VERDICTS THIS FILE: `types:tests-dom` (`pnpm typecheck:tests-dom`) — tsconfig.tests-dom.json
// includes `tests/client/**/*.ts`. The vitest `types` project ALSO collects it (its typecheck include is
// `tests/**/*.test-d.ts`) and prints a green tick, but that green is VACUOUS: that lane's program is
// `tsconfig.json`, which #1243 excluded `tests/client` from WHOLESALE. Measured 2026-09-02 — a planted
// `export const x: number = "…"` in this tree was reported `✓ … (n tests)` by `pnpm test:types` and
// TS2322 by `pnpm typecheck:tests-dom`. Do not read a `pnpm test:types` pass as this file passing.
// The partition is pinned by tests/tooling/testd-lane-program-coverage.int.test.ts (#1270).

import { createRegistry } from "@orb/client/lib/pure";
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
