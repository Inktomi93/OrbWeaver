// The boot migration has no posture switch: a diverged chain is always refused, so a caller cannot ask for a reset.
import type { runBootMigrations } from "@orb/server/entry/boot";
import { expectTypeOf, test } from "vitest";

type Deps = Parameters<typeof runBootMigrations>[0];

test("the boot migration deps carry no reset or posture option", () => {
  expectTypeOf<Deps>().not.toHaveProperty("launched");
  expectTypeOf<Deps>().toHaveProperty("databaseUrl");
});
