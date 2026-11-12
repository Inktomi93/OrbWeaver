// A theme whose stored override is not JSON reads as the empty override instead of throwing, a duplicate copies its
// bytes rather than a rewritten object, and the library export leaves it out of the theme file and names it in the
// export report rather than writing the empty override as the user's theme.
// @subject packages/server/src/domain/settings/substrate/theme-views.ts
// @subject packages/server/src/domain/settings/verbs/duplicate-theme.ts
// @subject packages/server/src/domain/settings/verbs/export-theme.ts
// @subject packages/server/src/entry/http/export.ts
import { PORTABLE_EXPORT_CARRY } from "@orb/contracts/portability";
import { VERSIONED_PARSE_FAILURES } from "@orb/contracts/versioned-config";
import { themes } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { readLibraryExport, signedInBox } from "@orb/testkit/node/composed";
import { eq, sql } from "drizzle-orm";
import { STORED_CONFIG_UNREADABLE } from "#server/primitives/stored-config/index.ts";

// Text a truncated write leaves behind: no JSON parser reads it.
const NOT_JSON = '{"accent": "#33';

test("a theme override holding text that is not JSON reads as empty, duplicates byte for byte and is left out of the library export, named", async () => {
  await using box = await signedInBox();
  const principal = await box.principalFor(box.ownerId);
  const theme = await box.services.settings.createTheme({ principal, input: { name: "Dusk", override: { accent: "#334455" }, css: null } });
  await box.services.settings.createTheme({ principal, input: { name: "Dawn", override: { accent: "#556677" }, css: null } });
  const descriptor = box.app.portability.find((entity) => entity.kind === "theme");
  if (descriptor === undefined) {
    throw new Error("the production graph omitted the theme portability descriptor");
  }
  // The themes the library export carries, read by restoring its files into a fresh account through the import door.
  const exportedThemes = async (): Promise<{ readonly names: readonly string[]; readonly report: unknown }> => {
    const library = await readLibraryExport(box, ["theme"]);
    const restorer = await box.actor();
    const restorerPrincipal = await box.principalFor(restorer.id);
    const held = new Set((await box.services.settings.listThemes({ principal: restorerPrincipal })).map((row) => row.id));
    for (const [path, bytes] of library.files) {
      await descriptor.importFile(restorer.id, { filename: path.slice(descriptor.dir.length), bytes });
    }
    const restored = (await box.services.settings.listThemes({ principal: restorerPrincipal })).filter((row) => !held.has(row.id));
    return { names: restored.map((row) => row.name).toSorted(), report: library.report };
  };
  // Positive control: both readable themes export and nothing is reported.
  expect(await exportedThemes()).toEqual({ names: ["Dawn", "Dusk"], report: null });

  await box.db
    .update(themes)
    .set({ override: sql`${NOT_JSON}` })
    .where(eq(themes.id, theme.id));
  const stored = async (id: typeof theme.id): Promise<unknown> =>
    await box.db
      .select({ text: sql<string>`${themes.override}` })
      .from(themes)
      .where(eq(themes.id, id));

  expect((await box.services.settings.listThemes({ principal })).find((row) => row.id === theme.id)?.override).toEqual({});
  const copy = await box.services.settings.duplicateTheme({ principal, id: theme.id });
  expect([await stored(theme.id), await stored(copy.id)]).toEqual([[{ text: NOT_JSON }], [{ text: NOT_JSON }]]);
  const dusk = { kind: "theme", code: STORED_CONFIG_UNREADABLE, failure: VERSIONED_PARSE_FAILURES.notJson, carried: PORTABLE_EXPORT_CARRY.leftOut };
  expect(await exportedThemes()).toEqual({
    names: ["Dawn"],
    report: {
      notes: [
        { ...dusk, item: "Dusk" },
        { ...dusk, item: copy.name },
      ],
    },
  });
});
