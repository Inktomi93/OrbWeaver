import { ROW_DELETE_NAME } from "@orb/client/lib";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { holdServed, routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { PRESET_EDITOR_NAME } from "#client/features/preset/lib/preset-names.ts";
import { DIALOG_VERBS } from "#client/lib/dialog-verbs.ts";
import type { PresetActionGroupsStory } from "./_preset-action-groups-stories.tsx";

const STORY = "tests/client/features/preset/components/_preset-action-groups-stories/PresetActionGroupsStory";
const READS = [
  "sessions.me",
  "settings.getUserSettings",
  "settings.updateUserSettingsSection",
  "preset.list",
  "preset.get",
  "preset.resolveEffective",
  "connection.resolveChatCapability",
  "connection.providersAvailable",
  "connection.list",
] as const;

async function deleteRow(page: Page, name: string): Promise<void> {
  const row = page.locator('[data-slot="list-row-root"]').filter({ has: page.getByRole("button", { name, exact: true }) });
  await row.hover();
  await row.locator('button[aria-haspopup="menu"]').click();
  await page.getByRole("menu").getByRole("menuitem", { name: ROW_DELETE_NAME, exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: ROW_DELETE_NAME, exact: true }).click();
}

test("deleting the open preset from its row closes the editor on that id", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const preset = await caller.preset.create({ name: "Disposable open preset", kind: "generation" });
  await routeTrpc(page, serveCorpusProcedures(caller, [...READS, "preset.remove"]));
  await mount<typeof PresetActionGroupsStory>(STORY, { width: 960, appearance: appearanceSettingsSchema.parse({}), subject: "section" });
  const open = page.getByRole("button", { name: preset.name, exact: true });
  const editor = page.getByRole("region", { name: PRESET_EDITOR_NAME, exact: true });
  await open.click();
  await expect(editor).toBeVisible();
  await deleteRow(page, preset.name);
  await expect(open).toHaveCount(0);
  await expect(editor).toHaveCount(0);
});

test("a held row Delete keeps its confirm open, then closes the editor on that id", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const openPreset = await caller.preset.create({ name: "Disposable open preset", kind: "generation" });
  const otherPreset = await caller.preset.create({ name: "Disposable other preset", kind: "generation" });
  const hold = holdServed();
  let removes = 0;
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, READS),
    ...serveCorpusProcedures(caller, ["preset.remove"], () => {
      removes += 1;
      return removes === 1 ? hold : undefined;
    }),
  });
  await mount<typeof PresetActionGroupsStory>(STORY, { width: 960, appearance: appearanceSettingsSchema.parse({}), subject: "section" });
  const open = page.getByRole("button", { name: openPreset.name, exact: true });
  const editor = page.getByRole("region", { name: PRESET_EDITOR_NAME, exact: true });
  await open.click();
  await expect(editor).toBeVisible();
  await deleteRow(page, openPreset.name);
  await hold.requested;
  // The confirm holds until its delete settles, so no second Delete can start and drop the first one's completion.
  await expect(page.getByRole("alertdialog")).toBeVisible();
  hold.release();
  await expect(open).toHaveCount(0);
  await expect(editor).toHaveCount(0);
  await deleteRow(page, otherPreset.name);
  await expect(page.getByRole("button", { name: otherPreset.name, exact: true })).toHaveCount(0);
});

test("a refused row Delete keeps its confirm, the active pick and the trigger; a landed one hands focus to a neighbour", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const active = await caller.preset.create({ name: "Disposable active preset", kind: "generation" });
  await caller.preset.create({ name: "Disposable neighbour preset", kind: "generation" });
  await caller.settings.updateUserSettingsSection({ section: "seeds", patch: { defaultPresetId: active.id } });
  let refusing = true;
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, READS),
    ...serveCorpusProcedures(caller, ["preset.remove"], () => (refusing ? trpcError({ code: "INTERNAL_SERVER_ERROR" }) : undefined)),
  });
  await mount<typeof PresetActionGroupsStory>(STORY, { width: 960, appearance: appearanceSettingsSchema.parse({}), subject: "section" });
  const row = page.locator('[data-slot="list-row-root"]').filter({ has: page.getByRole("button", { name: active.name, exact: true }) });
  const confirm = page.getByRole("alertdialog");

  await deleteRow(page, active.name);
  await expect(confirm.getByRole("alert")).toBeVisible();
  await confirm.getByRole("button", { name: DIALOG_VERBS.cancel, exact: true }).click();
  await expect(confirm).toHaveCount(0);
  await expect(row.locator('button[aria-haspopup="menu"]')).toBeFocused();
  expect((await caller.settings.getUserSettings()).config.seeds.defaultPresetId).toBe(active.id);

  refusing = false;
  await deleteRow(page, active.name);
  await expect(page.getByRole("button", { name: active.name, exact: true })).toHaveCount(0);
  await expect(page.locator('[data-slot="list-row-root"]').locator(":focus")).toHaveCount(1);
  await expect.poll(async () => (await caller.settings.getUserSettings()).config.seeds.defaultPresetId).toBeNull();
});
