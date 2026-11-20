// A preset's delete confirm lists the regex scripts only that preset uses, each checked to go with it, and leaves out a
// script another scope uses. Unchecking one keeps it: the confirmed delete takes only the checked scripts.
// @subject packages/client/src/features/preset/components/preset-delete-scripts.tsx
// @subject packages/client/src/features/preset/components/preset-library-row.tsx
// @subject packages/client/src/features/preset/surfaces/preset-library-surface.tsx

import { ROW_DELETE_NAME, rowActionsName } from "@orb/client/lib";
import { createRegexScriptSchema } from "@orb/contracts/regex";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import type { TrpcRoutes } from "@orb/testkit/ct";
import { routeOrbSocket, routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { nameShape } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { PRESET_DELETE_SCRIPTS_REGION_NAME } from "#client/features/preset/lib/preset-names.ts";
import type { PresetActivationStory } from "./_preset-activation-stories.tsx";

const STORY = "tests/client/features/preset/components/_preset-activation-stories/PresetActivationStory";
const READS = [
  "sessions.me",
  "settings.getUserSettings",
  "preset.list",
  "preset.get",
  "preset.remove",
  "preset.resolveEffective",
  "regex.listPresetOnly",
  "connection.resolveChatCapability",
  "connection.providersAvailable",
  "connection.list",
] as const;
const STREAM_ROUTES: TrpcRoutes<"stream.attach" | "stream.detach"> = {
  "stream.attach": ({ ref }) => (ref.channel === "user" ? null : trpcError({ code: "NOT_FOUND" })),
  "stream.detach": ({ ref }) => (ref.channel === "user" ? null : trpcError({ code: "NOT_FOUND" })),
};
const SCRIPT = createRegexScriptSchema.parse({ name: "script", findRegex: "x", replaceString: "y", targets: ["AI_OUTPUT"], passes: ["display"] });

test.use({ viewport: { width: 1280, height: 900 } });

test("the delete confirm lists the preset's own scripts checked, and an unchecked one survives the delete", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  await caller.settings.updateUserSettingsSection({ section: "seeds", patch: { defaultPresetId: null } });
  const preset = await caller.preset.create({ name: "Heavy preset", kind: "generation" });
  const sibling = await caller.preset.create({ name: "Sibling preset", kind: "generation" });
  const attach = async (name: string): Promise<Awaited<ReturnType<typeof caller.regex.createScript>>> => {
    const row = await caller.regex.createScript({ input: { ...SCRIPT, name } });
    await caller.regex.attachToPreset({ presetId: preset.id, scriptId: row.id });
    return row;
  };
  await attach("Panel format");
  await attach("Status bar");
  const shared = await attach("Shared cleanup");
  await caller.regex.attachToPreset({ presetId: sibling.id, scriptId: shared.id });
  await routeTrpc(page, { ...serveCorpusProcedures(caller, READS), ...STREAM_ROUTES });
  await routeOrbSocket(page, { frames: () => Promise.resolve([]) });
  await mount<typeof PresetActivationStory>(STORY, { width: 960, appearance: appearanceSettingsSchema.parse({}) });

  const row = page.locator('[data-slot="list-row-root"]').filter({ has: page.getByRole("button", { name: preset.name, exact: true }) });
  await row.hover();
  await row.getByRole("button", { name: nameShape(rowActionsName) }).click();
  await page.getByRole("menuitem", { name: ROW_DELETE_NAME, exact: true }).click();
  const confirm = page.getByRole("alertdialog");
  const list = confirm.getByRole("region", { name: PRESET_DELETE_SCRIPTS_REGION_NAME, exact: true });
  await expect(list.getByRole("checkbox")).toHaveCount(2);
  await expect(list.getByRole("checkbox", { name: "Panel format", exact: true })).toBeChecked();
  await expect(list.getByRole("checkbox", { name: "Status bar", exact: true })).toBeChecked();
  // The shared script is another preset's too, so the confirm never offers it.
  await expect(list.getByRole("checkbox", { name: "Shared cleanup", exact: true })).toHaveCount(0);

  await list.getByRole("checkbox", { name: "Status bar", exact: true }).click();
  await expect(list.getByRole("checkbox", { name: "Status bar", exact: true })).not.toBeChecked();
  await confirm.getByRole("button", { name: ROW_DELETE_NAME, exact: true }).click();

  await expect(confirm).toHaveCount(0);
  await expect(page.getByRole("button", { name: preset.name, exact: true })).toHaveCount(0);
  // The corpus seeds scripts of its own, so the read is narrowed to this case's three.
  const mine = new Set(["Panel format", "Status bar", "Shared cleanup"]);
  expect((await caller.regex.listScripts()).flatMap(({ name }) => (mine.has(name) ? [name] : [])).toSorted()).toEqual(["Shared cleanup", "Status bar"]);
  expect((await caller.regex.listUnattached()).map(({ name }) => name)).toContain("Status bar");
});
