// The preview's theme read answers a whole folder in one call, so it has to stop between files once the run is
// aborted: an aborted dry run must not keep the interactive lane for the rest of the folder.
// @subject packages/server/src/domain/settings/verbs/import-theme.ts

import { databaseHandle } from "@orb/db/wiring-driver";
import type { Cancellation } from "@orb/kit/guards";
import { createFindOwnedThemes } from "@orb/server/domain/settings";
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
  const findOwnedThemes = createFindOwnedThemes({ db: databaseHandle(db) });
  // A file that is not a theme answers no reuse and no key, so only the count of answers shows how far the read got.
  const files = Array.from({ length: 3 }, () => new TextEncoder().encode("not a theme"));
  const unreadable = { reuse: null, keys: [] };

  const live = await findOwnedThemes(owner.id, files, { aborted: false });
  const aborted = await findOwnedThemes(owner.id, files, abortsAfterFirstFile());

  expect(live).toEqual([unreadable, unreadable, unreadable]);
  expect(aborted).toEqual([unreadable]);
});
