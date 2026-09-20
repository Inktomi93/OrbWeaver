// persistence/space-state — the `embed_space_state` writer (§10-5). Two properties that are not obvious
// from the statement and are both load-bearing:
//
//   • THE WRITE IS AN OVERWRITE. Only the LATEST completed sweep is a true statement about where a scope's
//     vectors are. If completions ACCRETED, the reader's fold would see two spaces for one scope and either
//     pick arbitrarily or read the whole task as `moving` forever, which would wedge search permanently
//     after the first re-index.
//   • SCOPES DO NOT COLLIDE. The PK is `(owner, scope)`, so a finished image sweep must not overwrite the
//     card sweep's answer — the whole reason the table is scope-keyed rather than task-keyed.
//
// The principal each receipt is taken as is the seeded OWNER whose rows are written, and the cross-owner
// case is asserted explicitly: an owner's completion is invisible to another owner, which under a per-user
// embedder is the difference between "not re-indexed yet" and "somebody else re-indexed".

import { embedSpaceState } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { upsertCompletedSpace } from "../../../../../packages/server/src/domain/embeddings/persistence/space-state.ts";
import { readCompletedSpaces } from "../../../../../packages/server/src/domain/search/persistence/active-space.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedUser } from "../_support.ts";

const T0 = 1_700_000_000_000;
const T1 = T0 + 60_000;

test("a second completion for the same scope OVERWRITES — completions never accrete", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("owner-overwrite") });

  await upsertCompletedSpace(db, { ownerId: owner, scope: "cards", space: "model-a@q8", now: T0 });
  await upsertCompletedSpace(db, { ownerId: owner, scope: "cards", space: "model-b@q8", now: T1 });

  const rows = await db.select().from(embedSpaceState).where(eq(embedSpaceState.ownerId, owner));
  expect(rows).toHaveLength(1);
  expect(rows[0]?.space).toBe("model-b@q8");
  // The clock is the injected one, not a wall read — the row records WHEN the sweep finished.
  expect(rows[0]?.completedAt).toBe(T1);
});

test("scopes are independent — an image sweep's completion does not overwrite the card sweep's", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { handle: castId<Handle>("owner-scopes") });

  await upsertCompletedSpace(db, { ownerId: owner, scope: "cards", space: "text-model", now: T0 });
  await upsertCompletedSpace(db, { ownerId: owner, scope: "images", space: "image-model", now: T0 });

  const rows = await readCompletedSpaces(db, owner);
  expect(rows.toSorted((a, b) => a.scope.localeCompare(b.scope))).toEqual([
    { scope: "cards", space: "text-model" },
    { scope: "images", space: "image-model" },
  ]);
});

test("one owner's completion is invisible to another — the read is per-principal", async () => {
  const db = await freshDb();
  const mine = await seedUser(db, { handle: castId<Handle>("owner-mine") });
  const theirs = await seedUser(db, { handle: castId<Handle>("owner-theirs") });

  await upsertCompletedSpace(db, { ownerId: theirs, scope: "cards", space: "their-model", now: T0 });

  // Asked as MY principal: empty. Asked as theirs: the row. Under a per-user embedder that distinction is
  // the whole answer — an empty read must never be read as "nobody has re-indexed".
  expect(await readCompletedSpaces(db, mine)).toEqual([]);
  expect(await readCompletedSpaces(db, theirs)).toEqual([{ scope: "cards", space: "their-model" }]);
});
