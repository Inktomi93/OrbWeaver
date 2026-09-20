// persistence/active-space — search's read of `embed_space_state` (§10-5). The module is three lines, and
// the property worth pinning is the one a re-implementation would get wrong: it is OWNER-SCOPED and returns
// the rows RAW, leaving the fold to `@orb/contracts/embeddings`.
//
// Why that matters enough to pin: this is a CROSS-DOMAIN table read (embeddings owns the table, search may
// not import it), which is exactly the shape that grows a second, divergent fold. A reader that filtered or
// pre-folded here would be a second answer to a question that has one — the §10-2 defect class.
//
// The principal every receipt is taken as is the named owner; the foreign-owner row in the same db is the
// control that proves the WHERE clause is doing the work rather than the table being empty.

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { upsertCompletedSpace } from "../../../../../packages/server/src/domain/embeddings/persistence/space-state.ts";
import { readCompletedSpaces } from "../../../../../packages/server/src/domain/search/persistence/active-space.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedUser } from "../../embeddings/_support.ts";

const NOW = 1_700_000_000_000;

test("returns this owner's completion rows and nobody else's", async () => {
  const db = await freshDb();
  const mine = await seedUser(db, { handle: castId<Handle>("reader-mine") });
  const theirs = await seedUser(db, { handle: castId<Handle>("reader-theirs") });
  await upsertCompletedSpace(db, { ownerId: mine, scope: "cards", space: "mine-model", now: NOW });
  await upsertCompletedSpace(db, { ownerId: theirs, scope: "cards", space: "their-model", now: NOW });

  expect(await readCompletedSpaces(db, mine)).toEqual([{ scope: "cards", space: "mine-model" }]);
  // The control: the table is NOT empty, so the single row above is the WHERE clause's doing.
  expect(await readCompletedSpaces(db, theirs)).toEqual([{ scope: "cards", space: "their-model" }]);
});

test("returns the rows RAW — every recorded scope, unfolded and unfiltered", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("reader-raw") });
  await upsertCompletedSpace(db, { ownerId: owner, scope: "cards", space: "a", now: NOW });
  await upsertCompletedSpace(db, { ownerId: owner, scope: "documents", space: "b", now: NOW });
  await upsertCompletedSpace(db, { ownerId: owner, scope: "images", space: "c", now: NOW });

  // A reader that folded here — dropped the disagreeing scope, or answered one task — would hide the
  // `moving` state from the ONE place allowed to decide it (`foldActiveSpace`).
  expect((await readCompletedSpaces(db, owner)).toSorted((x, y) => x.scope.localeCompare(y.scope))).toEqual([
    { scope: "cards", space: "a" },
    { scope: "documents", space: "b" },
    { scope: "images", space: "c" },
  ]);
});

test("an owner who has never completed a sweep reads EMPTY, not a default", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("reader-virgin") });
  // Empty is what the fold turns into `unrecorded` — the bootstrap arm. A fabricated default row here
  // would make a fresh box claim a completed reindex it never ran.
  expect(await readCompletedSpaces(db, owner)).toEqual([]);
});
