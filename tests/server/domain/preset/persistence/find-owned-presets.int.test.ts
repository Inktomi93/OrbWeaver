// The preview's preset read answers a whole folder in one call, so it has to stop between files once the run is
// aborted: an aborted dry run must not keep the interactive lane for the rest of the folder.
// @subject packages/server/src/domain/preset/verbs/import.ts

import { databaseHandle } from "@orb/db/wiring-driver";
import type { Cancellation } from "@orb/kit/guards";
import { createFindOwnedPresets } from "@orb/server/domain/preset";
import { expect, test } from "@orb/testkit/node";
import { seedUser } from "@orb/testkit/node/rows";

// Reports aborted from its second check on: the read answers the first file and stops.
function abortsAfterFirstFile(): Cancellation {
  let checks = 0;
  return {
    get aborted(): boolean {
      checks += 1;
      return checks > 1;
    },
  };
}

test("an aborted run stops the read between files, and a live run answers every file", async ({ db }) => {
  const owner = await seedUser(db);
  const findOwnedPresets = createFindOwnedPresets({ db: databaseHandle(db) });
  // A file that is not a preset answers false, so only the count of answers shows how far the read got.
  const files = Array.from({ length: 3 }, () => new TextEncoder().encode("not a preset"));

  const live = await findOwnedPresets({ ownerId: owner.id, files, signal: { aborted: false } });
  const aborted = await findOwnedPresets({ ownerId: owner.id, files, signal: abortsAfterFirstFile() });

  expect(live).toEqual([false, false, false]);
  expect(aborted).toEqual([false]);
});
