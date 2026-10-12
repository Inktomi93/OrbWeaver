import type { PortabilityRegistry, PortableEntity, PortableFile, PortableImportOutcome, PortableKind } from "@orb/contracts/portability";
import type { UserId } from "@orb/kit/ids";
import { expectTypeOf, test } from "vitest";

// `PortableEntity` is a server-side descriptor interface with no schema, so its shape is a compile-time contract:
// the delivery core iterates a registry of these and is the only seam between the entity-agnostic core and
// per-entity logic.
test("a PortableEntity streams the owner's rows lazily and imports one file without throwing", () => {
  expectTypeOf<PortableEntity["kind"]>().toEqualTypeOf<PortableKind>();
  expectTypeOf<PortableEntity["exportAll"]>().toEqualTypeOf<(ownerId: UserId) => AsyncIterable<PortableFile>>();
  expectTypeOf<PortableEntity["importFile"]>().toEqualTypeOf<(ownerId: UserId, file: PortableFile) => Promise<PortableImportOutcome>>();
});

test("the registry is a readonly list of descriptors", () => {
  expectTypeOf<PortabilityRegistry>().toEqualTypeOf<readonly PortableEntity[]>();
});
