// SillyTavern's `power_user` ergonomics and the viewer's appearance carry each other both ways: a profile's keys land on the
// appearance they name, the export writes the appearance back as those keys, and the import of that export reads back
// the same appearance. A setting or a theme token SillyTavern has no place for is named by the export, never dropped.
// @subject packages/server/src/primitives/serde/st-appearance/index.ts
// @subject packages/server/src/primitives/serde/theme/st.ts

import { ST_EXPORT_FORMAT, ST_EXPORT_PROFILE_DIR, ST_EXPORT_REPORT_FILE, ST_SETTINGS_FILE, stExportReportSchema } from "@orb/contracts/import";
import { PORTABILITY_ROUTES } from "@orb/contracts/portability";
import { present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { strFromU8, unzipSync } from "fflate";
import type { Files } from "./_st-tree-door.ts";
import { admit, finishRun, harness } from "./_st-tree-door.ts";

const OK = 200;
// SillyTavern's own power_user key, as its settings.json spells it.
const ST_REDUCED_MOTION = "reduced_motion";

// Every appearance field SillyTavern's power_user has a key for, each away from its default.
const CARRIED = {
  avatarShape: "square",
  avatarAspect: "portrait",
  chatStyle: "bubble",
  messageActions: "expanded",
  showInChatAvatars: false,
  showTimestamps: false,
  showMessageId: true,
  fontScale: 1.2,
  chatWidthPct: 70,
} as const;

async function appearanceOf(root: ServerTestHarness): Promise<Readonly<Record<string, unknown>>> {
  return (await root.services.settings.getUserSettings({ principal: await root.principalFor(root.ownerId) })).config.appearance;
}

async function exported(root: ServerTestHarness): Promise<Readonly<Record<string, Uint8Array>>> {
  const response = await root.http.request(`${PORTABILITY_ROUTES.exportLibrary}?format=${ST_EXPORT_FORMAT}`);
  expect(response.status).toBe(OK);
  return unzipSync(new Uint8Array(await response.arrayBuffer()));
}

test.for([
  [true, "on"],
  [false, "system"],
  ["true", null],
  [1, null],
] as const)("a profile's reduced_motion %j lands as reducedMotion %j", async ([stored, landed]) => {
  await using root = await harness();
  const before = (await appearanceOf(root))["reducedMotion"];

  await finishRun(root, await admit(root, { [ST_SETTINGS_FILE]: JSON.stringify({ ["power_user"]: { [ST_REDUCED_MOTION]: stored } }) }));

  // A value SillyTavern never writes patches nothing, so the owner's own setting stays.
  expect((await appearanceOf(root))["reducedMotion"]).toBe(landed ?? before);
});

test("the appearance exported as power_user imports back as itself, and what SillyTavern cannot hold is named", async () => {
  await using source = await harness();
  const principal = await source.principalFor(source.ownerId);
  await source.services.settings.updateUserSettingsSection({ principal, input: { section: "appearance", patch: { ...CARRIED, reducedMotion: "off" } } });
  await source.services.settings.createTheme({
    principal,
    input: { name: "Vivid", override: { background: "oklch(0.2 0.02 260)", accent: "oklch(0.7 0.15 30)" }, css: null },
  });

  const zip = await exported(source);
  const report = stExportReportSchema.parse(JSON.parse(strFromU8(present(zip[ST_EXPORT_REPORT_FILE]))));
  const tree: Files = Object.fromEntries(
    Object.entries(zip)
      .filter(([path]) => path.startsWith(ST_EXPORT_PROFILE_DIR))
      .map(([path, bytes]) => [path.slice(ST_EXPORT_PROFILE_DIR.length), bytes]),
  );
  await using target = await harness();
  await finishRun(target, await admit(target, tree));

  expect(await appearanceOf(target)).toMatchObject(CARRIED);
  // SillyTavern's reduced_motion is forced or the device's choice; "never reduce" has no spelling there.
  expect(report.left).toEqual(
    expect.arrayContaining([
      { kind: "user-settings", item: "appearance.reducedMotion", reason: "no-sillytavern-field" },
      { kind: "theme", item: "Vivid: accent", reason: "no-sillytavern-field" },
    ]),
  );
  expect(report.left.filter(({ kind }) => kind === "user-settings").map(({ item }) => item)).toEqual(["appearance.reducedMotion"]);
});
