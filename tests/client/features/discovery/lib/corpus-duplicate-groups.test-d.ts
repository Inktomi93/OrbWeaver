import type { CharacterId } from "@orb/kit/ids";
import { expectTypeOf, test } from "vitest";
import type { ArtCliqueMember, groupIdenticalArt } from "#client/features/discovery/lib/corpus-duplicate-groups.ts";

test("duplicate-art grouping preserves the canonical character identity at both ends", () => {
  expectTypeOf<Parameters<typeof groupIdenticalArt>[0][number]["characterIdA"]>().toEqualTypeOf<CharacterId>();
  expectTypeOf<Parameters<typeof groupIdenticalArt>[0][number]["characterIdB"]>().toEqualTypeOf<CharacterId>();
  expectTypeOf<ReturnType<typeof groupIdenticalArt>["cliques"][number]["id"]>().toEqualTypeOf<CharacterId>();
  expectTypeOf<ReturnType<typeof groupIdenticalArt>["cliques"][number]["members"][number]>().toEqualTypeOf<ArtCliqueMember>();
  expectTypeOf<ArtCliqueMember["id"]>().toEqualTypeOf<CharacterId>();
});
