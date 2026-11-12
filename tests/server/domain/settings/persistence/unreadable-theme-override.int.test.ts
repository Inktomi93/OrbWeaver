// A theme whose stored override is not JSON reads as the empty override instead of throwing, a duplicate copies its
// bytes rather than a rewritten object, and the theme backup export refuses it rather than writing the empty override
// as the user's theme.
// @subject packages/server/src/domain/settings/substrate/theme-views.ts
// @subject packages/server/src/domain/settings/verbs/duplicate-theme.ts
// @subject packages/server/src/domain/settings/verbs/export-theme.ts
import { themes } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { eq, sql } from "drizzle-orm";
import { STORED_CONFIG_UNREADABLE } from "#server/primitives/stored-config/index.ts";

// Text a truncated write leaves behind: no JSON parser reads it.
const NOT_JSON = '{"accent": "#33';

test("a theme override holding text that is not JSON reads as empty, duplicates byte for byte and refuses the backup export", async ({ harness }) => {
  const principal = await harness.principalFor(harness.ownerId);
  const theme = await harness.services.settings.createTheme({ principal, input: { name: "Dusk", override: { accent: "#334455" }, css: null } });
  const descriptor = harness.app.portability.find((entity) => entity.kind === "theme");
  if (descriptor === undefined) {
    throw new Error("the production graph omitted the theme portability descriptor");
  }
  const exportAll = async (): Promise<number> => {
    let files = 0;
    for await (const _file of descriptor.exportAll(harness.ownerId)) {
      files += 1;
    }
    return files;
  };
  // Positive control: the readable theme exports.
  expect(await exportAll()).toBe(1);

  await harness.db
    .update(themes)
    .set({ override: sql`${NOT_JSON}` })
    .where(eq(themes.id, theme.id));
  const stored = async (id: typeof theme.id): Promise<unknown> =>
    await harness.db
      .select({ text: sql<string>`${themes.override}` })
      .from(themes)
      .where(eq(themes.id, id));

  expect((await harness.services.settings.listThemes({ principal })).find((row) => row.id === theme.id)?.override).toEqual({});
  const copy = await harness.services.settings.duplicateTheme({ principal, id: theme.id });
  expect([await stored(theme.id), await stored(copy.id)]).toEqual([[{ text: NOT_JSON }], [{ text: NOT_JSON }]]);
  await expect(exportAll()).rejects.toMatchObject({ code: STORED_CONFIG_UNREADABLE });
});
