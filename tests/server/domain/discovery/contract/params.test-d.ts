// Type-level pin for #1414 seam 1: the distill TARGET narrow. `characterId` and `ownerId` used to be two
// independent optionals, so `{ characterId }` ALONE was well-typed — and `readCardDistillTargets` would then
// select any non-synthetic character in the box, after which the pass committed a `character_summaries` row
// and staged `pending` tag suggestions under THAT card's own owner. Every live caller happened to pair them,
// which is exactly the "safe because of who calls it" that constitution §2 calls a wish rather than a placement.
//
// THE ENFORCER IS `tsc`, so the pin is type-level: the assertions below ARE the boundary. Runtime behavior
// (a foreign on-demand id collapses to NOT_FOUND) is covered by `verbs/distill.int.test.ts`.

import type { CharacterId, UserId } from "@orb/kit/ids";
import type { DistillCharactersOptions, DistillTargetNarrow } from "@orb/server/domain/discovery";
import { expectTypeOf, test } from "vitest";

declare const characterId: CharacterId;
declare const ownerId: UserId;

test("an on-demand narrow CANNOT name a card without naming whose it is", () => {
  // The id-only narrow is the defect, and it must not typecheck.
  expectTypeOf<{ characterId: CharacterId }>().not.toExtend<DistillTargetNarrow>();
  expectTypeOf<{ characterId: CharacterId }>().not.toExtend<DistillCharactersOptions>();

  // The PAIRED narrow (the tRPC seam's shape — `ctx.auth.userId` + the wire id) still does.
  expectTypeOf({ characterId, ownerId }).toExtend<DistillTargetNarrow>();
  // The whole-library sweeps still do: owner-scoped (a per-user workload row) and bulk (the box-wide arm).
  expectTypeOf({ ownerId }).toExtend<DistillTargetNarrow>();
  expectTypeOf({}).toExtend<DistillTargetNarrow>();
});
