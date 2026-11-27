// @subject packages/server/src/transport/trpc/routers/settings.ts
// @subject packages/server/src/domain/settings/persistence/queries.ts
// An admin reads the global settings rows as a bounded list ordered by key, each with a capped preview of its stored
// value and the time it was written, beside the count of every row; a member is refused the read.

import { GLOBAL_SETTING_VALUE_PREVIEW_CHARS, GLOBAL_SETTINGS_LIST_LIMIT } from "@orb/contracts/settings";
import type { JsonValue } from "@orb/kit/json";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";

const ZETA: { key: string; value: JsonValue } = { key: "application:list-zeta", value: { marker: "kept", opaque: [null, true, 3] } };
const ALPHA = { key: "application:list-alpha", value: "stored-string" } as const;
const LONG = { key: "application:list-long", value: "x".repeat(GLOBAL_SETTING_VALUE_PREVIEW_CHARS * 3) } as const;
const WRITE_GAP_MS = 1000;
const OWN_PREFIX = "application:list-";
const FILL_PREFIX = "application:fill-";

test("an admin lists the global settings by key with each value's preview and write time, and a member is refused", async () => {
  await using root = await createServerHarness({ startJobs: false });
  const zetaAt = root.clock.now();
  await root.services.settings.setGlobalSetting(ZETA.key, ZETA.value);
  root.clock.advance(WRITE_GAP_MS);
  const alphaAt = root.clock.now();
  await root.services.settings.setGlobalSetting(ALPHA.key, ALPHA.value);
  root.clock.advance(WRITE_GAP_MS);
  const longAt = root.clock.now();
  await root.services.settings.setGlobalSetting(LONG.key, LONG.value);

  const admin = await root.internalCallerFor(root.ownerId);
  const { rows, total } = await admin.settings.listGlobalSettings();
  expect(rows.filter(({ key }) => key.startsWith(OWN_PREFIX))).toEqual([
    { key: ALPHA.key, valuePreview: JSON.stringify(ALPHA.value), valueTruncated: false, updatedAt: alphaAt },
    // The long value is cut at the preview cap on the server, so no more than the cap ever leaves it.
    {
      key: LONG.key,
      valuePreview: JSON.stringify(LONG.value).slice(0, GLOBAL_SETTING_VALUE_PREVIEW_CHARS),
      valueTruncated: true,
      updatedAt: longAt,
    },
    { key: ZETA.key, valuePreview: JSON.stringify(ZETA.value), valueTruncated: false, updatedAt: zetaAt },
  ]);
  expect(total).toBe(rows.length);

  const member = await root.actor({ role: "user" });
  const memberCaller = await root.internalCallerFor(member.id);
  await expect(memberCaller.settings.listGlobalSettings()).rejects.toMatchObject({ code: "FORBIDDEN" });
});

test("a list past the row limit returns the first rows by key and counts all of them", async () => {
  await using root = await createServerHarness({ startJobs: false });
  const keys = Array.from({ length: GLOBAL_SETTINGS_LIST_LIMIT + 1 }, (_unused, index) => `${FILL_PREFIX}${String(index).padStart(4, "0")}`);
  for (const key of keys) {
    await root.services.settings.setGlobalSetting(key, key);
  }

  const admin = await root.internalCallerFor(root.ownerId);
  const { rows, total } = await admin.settings.listGlobalSettings();
  expect(rows).toHaveLength(GLOBAL_SETTINGS_LIST_LIMIT);
  const returned = rows.map(({ key }) => key);
  expect(returned).toEqual([...returned].sort());
  expect(total).toBeGreaterThanOrEqual(keys.length);
  // The keys past the limit are the ones the list leaves out, and the count still includes them.
  expect(returned).not.toContain(keys.at(-1));
});
