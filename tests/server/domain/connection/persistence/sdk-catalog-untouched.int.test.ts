// A native SDK model listing with a malformed identity refuses before the catalog: the stored settings
// rows stay byte-for-byte unchanged.
// @subject packages/inference/src/backends/agent-sdk/wire-read.ts
// @subject packages/inference/src/backends/agent-sdk/runner.ts
// @subject packages/inference/src/backends/agent-sdk/catalog.ts

import { settings } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { rootFor, savedConnection } from "../verbs/sdk-wire.fixtures.ts";

test("native SDK malformed model identity refuses instead of entering the catalog", async () => {
  await using root = await rootFor("bad-models");
  const connection = await savedConnection(root);
  const principal = await root.principalFor(root.ownerId);
  const before = await root.db.select().from(settings);
  const listing = await root.services.connection.catalogModels({ principal, connectionId: connection.connectionId });
  expect(listing.listed).toBe(false);
  expect(await root.db.select().from(settings)).toEqual(before);
});
