import type { userConnections } from "@orb/db";
import type { ModelId } from "@orb/kit/ids";
import { expectTypeOf, test } from "vitest";

type ConnectionInsert = typeof userConnections.$inferInsert;

test("user_connections preserves model identity at its producer contract", () => {
  expectTypeOf<ConnectionInsert["model"]>().toEqualTypeOf<ModelId>();
  expectTypeOf<string>().not.toExtend<ConnectionInsert["model"]>();
});
