// A custom theme stored while `density` was still a theme key keeps reading: the key is stripped at the read seam and
// every palette field survives, so the theme still lists, and a duplicate of it is still a working theme.
// @subject packages/server/src/domain/settings/substrate/theme-views.ts
// @subject packages/contracts/src/theme/override.ts
import { themes } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { signedInBox } from "@orb/testkit/node/composed";
import { eq, sql } from "drizzle-orm";

const PALETTE = { accent: "#334455", background: "#121212", font: "Georgia", radius: "full" } as const;

test("a stored custom theme that still carries density reads with the key stripped and its palette intact", async () => {
  await using box = await signedInBox();
  const principal = await box.principalFor(box.ownerId);
  const theme = await box.services.settings.createTheme({ principal, input: { name: "Dusk", override: PALETTE, css: null } });
  const read = async (): Promise<unknown> => (await box.services.settings.listThemes({ principal })).find((row) => row.id === theme.id)?.override;
  // Positive control: the palette reads back as written.
  expect(await read()).toStrictEqual(PALETTE);

  // The row as a theme saved before density left the theme override holds it beside the palette.
  await box.db
    .update(themes)
    .set({ override: sql`${JSON.stringify({ ...PALETTE, density: "compact" })}` })
    .where(eq(themes.id, theme.id));

  expect(await read()).toStrictEqual(PALETTE);
  const copy = await box.services.settings.duplicateTheme({ principal, id: theme.id });
  expect((await box.services.settings.listThemes({ principal })).find((row) => row.id === copy.id)?.override).toStrictEqual(PALETTE);
});
