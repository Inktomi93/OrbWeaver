import type { PortableKind } from "@orb/contracts/portability";
import type { SchemaTableName } from "@orb/db/wiring";
import { expectTypeOf, test } from "vitest";
import type { LIFECYCLE_DOORS, PORTABLE_CANON_TABLES } from "#server/entry/compose/portability.ts";
import type { LifecycleDoor, NonPortableCanon } from "#server/entry/contract/portability.ts";

test("portability metadata is total over real kinds and closed over native schema identities", () => {
  expectTypeOf<keyof typeof PORTABLE_CANON_TABLES>().toEqualTypeOf<PortableKind>();
  expectTypeOf<keyof typeof LIFECYCLE_DOORS>().toEqualTypeOf<PortableKind>();
  expectTypeOf<"characters">().toExtend<SchemaTableName>();
  expectTypeOf<"unregisteredTable">().not.toExtend<SchemaTableName>();
  expectTypeOf<"usersRelations">().not.toExtend<SchemaTableName>();
  expectTypeOf<{ readonly transport: "http"; readonly cite: "/api/import" }>().not.toExtend<LifecycleDoor>();
  expectTypeOf<{ readonly transport: "unknown"; readonly cite: string }>().not.toExtend<LifecycleDoor>();
  expectTypeOf<{ readonly ruled: string }>().toExtend<LifecycleDoor>();
  expectTypeOf<"unclassified">().not.toExtend<NonPortableCanon["classification"]>();
});
