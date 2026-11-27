// @subject packages/server/src/transport/trpc/routers/settings.ts
// @subject packages/server/src/domain/settings/persistence/queries.ts
// An admin reads the global settings rows as a list ordered by key, each with its stored value and the time it was
// written; a member is refused the read.

import type { JsonValue } from "@orb/kit/json";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";

const ZETA: { key: string; value: JsonValue } = { key: "application:list-zeta", value: { marker: "kept", opaque: [null, true, 3] } };
const ALPHA = { key: "application:list-alpha", value: "stored-string" } as const;
const WRITE_GAP_MS = 1000;

test("an admin lists the global settings by key with each stored value and write time, and a member is refused", async () => {
  await using root = await createServerHarness({ startJobs: false });
  const zetaAt = root.clock.now();
  await root.services.settings.setGlobalSetting(ZETA.key, ZETA.value);
  root.clock.advance(WRITE_GAP_MS);
  const alphaAt = root.clock.now();
  await root.services.settings.setGlobalSetting(ALPHA.key, ALPHA.value);

  const admin = await root.internalCallerFor(root.ownerId);
  const rows = await admin.settings.listGlobalSettings();
  expect(rows.filter(({ key }) => key.startsWith("application:list-"))).toEqual([
    { ...ALPHA, updatedAt: alphaAt },
    { ...ZETA, updatedAt: zetaAt },
  ]);

  const member = await root.actor({ role: "user" });
  const memberCaller = await root.internalCallerFor(member.id);
  await expect(memberCaller.settings.listGlobalSettings()).rejects.toMatchObject({ code: "FORBIDDEN" });
});
