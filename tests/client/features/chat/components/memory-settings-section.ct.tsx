// CT: the Memory settings SECTION (memory-settings-section.tsx): the per-account switch, the Utility model it runs on,
// and the confirm that turning it on passes through. Drives the production path: getUserSettings seeds the switch,
// a write is updateUserSettingsSection("memory"), and the backfill opt-in is a workloads.start. Asserts what was
// written and what the reader can act on (the confirm, the door), never the sentences.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { MEMORY_EXISTING_CHATS_NOTE, MEMORY_IMPORTED_CHATS_NOTE } from "../../../../../packages/client/src/features/chat/lib/memory-settings-section-nav.ts";
import type { TrpcRecorder, TrpcRoutes } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { UTILITY_ROW, utilityBindings } from "../../../../support/node/utility-role.ts";
import { MemorySettingsSectionStory } from "../_ct-stories.tsx";

const SETTINGS_VIEW = {
  userId: "user_ct_memory",
  schemaVersion: 1,
  config: DEFAULT_USER_SETTINGS,
  configUnreadable: null,
  updatedAt: 0,
};

const ENABLED_VIEW = { ...SETTINGS_VIEW, config: { ...DEFAULT_USER_SETTINGS, memory: { ...DEFAULT_USER_SETTINGS.memory, enabled: true } } };

const UPDATE_PROC = "settings.updateUserSettingsSection";
const SWITCH = "Remember earlier in long chats";
const CONFIRM_TITLE = "Turn on Memory?";
const CONFIRM_YES = "Turn on Memory";
const MODEL_ROLES_DOOR = "Open Model roles";
const BACKFILL_CALLS = 40;

type MemoryRoutePath = "connection.listBindings" | "workloads.estimateModelCalls" | "workloads.start" | typeof UPDATE_PROC;

function stub(page: Page, view: typeof SETTINGS_VIEW = SETTINGS_VIEW, routes: Partial<TrpcRoutes<MemoryRoutePath>> = {}): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "settings.getUserSettings": () => view,
    [UPDATE_PROC]: () => view,
    "connection.list": [UTILITY_ROW],
    "connection.listBindings": utilityBindings("running"),
    "workloads.estimateModelCalls": { calls: 0 },
    "workloads.start": { id: "workload_ct_backfill" },
    ...routes,
  });
}

/** The most recent memory-section patch body. */
function lastPatch(trpc: TrpcRecorder): Record<string, unknown> | undefined {
  const input = trpc.lastInput(UPDATE_PROC) as { section?: string; patch?: Record<string, unknown> } | undefined;
  return input?.section === "memory" ? input.patch : undefined;
}

test("mounts with the persisted default (memory OFF) rendered", async ({ mount, page }) => {
  await stub(page);
  await mount(<MemorySettingsSectionStory />);
  await expect(page.getByRole("switch", { name: SWITCH })).not.toBeChecked();
});

test("the existing-chats note is a door to the Memory backfill job, not only a sentence", async ({ mount, page }) => {
  await stub(page);
  await mount(<MemorySettingsSectionStory />);
  await expect(page.getByText(MEMORY_EXISTING_CHATS_NOTE)).toBeVisible();
  await expect(page.getByRole("button", { name: "Go to Jobs" })).toBeVisible();
});

test("the note is set as PROSE, at the switch description's step — not the 10.5px gloss default", async ({ mount, page }) => {
  // side-eye 2026-08-08 P2: the load-bearing note rendered a full type step BELOW the switch description it
  // continues. Assert the RESOLVED sizes agree, never a literal px — the tokens own the value.
  await stub(page);
  await mount(<MemorySettingsSectionStory />);
  const descriptionSize = await page
    .locator('[data-slot="field-description"]')
    .first()
    .evaluate((el) => getComputedStyle(el).fontSize);
  await expect.poll(async () => page.getByText(MEMORY_EXISTING_CHATS_NOTE).evaluate((el) => getComputedStyle(el).fontSize)).toBe(descriptionSize);
});

test("turning ON asks first: nothing is written until the confirm says yes, and no backfill rides along unasked", async ({ mount, page }) => {
  const trpc = await stub(page, SETTINGS_VIEW, { "workloads.estimateModelCalls": { calls: BACKFILL_CALLS } });
  await mount(<MemorySettingsSectionStory />);
  await page.getByRole("switch", { name: SWITCH }).click();

  const confirm = page.getByRole("alertdialog", { name: CONFIRM_TITLE });
  await expect(confirm).toBeVisible();
  // SETTLED: the opt-in has painted, so the estimate landed while nothing was written.
  await expect(confirm.getByRole("checkbox")).toBeVisible();
  // The import path is said here too: an import offers its own build for the chats it wrote, never runs one unasked.
  await expect(confirm.getByText(MEMORY_IMPORTED_CHATS_NOTE)).toBeVisible();
  // @orb-waive ct-no-oneshot-live-read-assert(expect): a zero count after a settled barrier (the opt-in painted from the landed estimate); the only write path is the confirm's yes, not yet pressed, so a poll would pass at t=0 and prove less.
  expect(trpc.count(UPDATE_PROC)).toBe(0);

  await confirm.getByRole("button", { name: CONFIRM_YES }).click();
  await expect.poll(() => lastPatch(trpc)?.["enabled"], { intervals: [20, 50, 100] }).toBe(true);
  await expect(confirm).toBeHidden();
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the confirm has closed, which happens only after its whole act settled; an unchecked opt-in has no start call to wait for, so a poll would pass at t=0 and prove less.
  expect(trpc.count("workloads.start")).toBe(0);
});

test("turning ON with the opt-in checked writes memory on, THEN starts the backfill over existing chats", async ({ mount, page }) => {
  // The backfill is admitted only for a host with memory on, so the order is the contract: the start must see the
  // switch's write already made.
  let writes = 0;
  let writesSeenByStart: number | null = null;
  const trpc = await stub(page, SETTINGS_VIEW, {
    "workloads.estimateModelCalls": { calls: BACKFILL_CALLS },
    [UPDATE_PROC]: () => {
      writes += 1;
      return ENABLED_VIEW;
    },
    "workloads.start": () => {
      writesSeenByStart = writes;
      return { id: "workload_ct_backfill" };
    },
  });
  await mount(<MemorySettingsSectionStory />);
  await page.getByRole("switch", { name: SWITCH }).click();
  const confirm = page.getByRole("alertdialog", { name: CONFIRM_TITLE });
  await confirm.getByRole("checkbox").check();
  await confirm.getByRole("button", { name: CONFIRM_YES }).click();

  await expect.poll(() => (trpc.lastInput("workloads.start") as { input?: { kind?: string } } | undefined)?.input?.kind).toBe("memory-backfill");
  await expect.poll(() => writesSeenByStart).toBe(1);
  await expect.poll(() => lastPatch(trpc)?.["enabled"]).toBe(true);
  await expect
    .poll(() => trpc.lastInput("workloads.estimateModelCalls"))
    .toEqual({ input: { kind: "memory-backfill", params: {} }, mode: "singular", assumeAdmitted: true });
});

test("a dismissed confirm writes nothing", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<MemorySettingsSectionStory />);
  await page.getByRole("switch", { name: SWITCH }).click();
  const confirm = page.getByRole("alertdialog", { name: CONFIRM_TITLE });
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(confirm).toBeHidden();
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the cancel is the last interaction and it writes nothing by construction (Cancel is a close, the write only rides the confirm's yes); the settled barrier above is the closed dialog.
  expect(trpc.count(UPDATE_PROC)).toBe(0);
});

test("from an ENABLED persisted state, flipping OFF writes enabled=false at once, with no confirm", async ({ mount, page }) => {
  const trpc = await stub(page, ENABLED_VIEW);
  await mount(<MemorySettingsSectionStory />);
  await expect(page.getByRole("switch", { name: SWITCH })).toBeChecked();
  await page.getByRole("switch", { name: SWITCH }).click();
  await expect.poll(() => lastPatch(trpc)?.["enabled"], { intervals: [20, 50, 100] }).toBe(false);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
});

test("the Model roles door appears only while no Utility model is running", async ({ mount, page }) => {
  await stub(page, ENABLED_VIEW, { "connection.listBindings": utilityBindings("unset") });
  await mount(<MemorySettingsSectionStory />);
  await expect(page.getByRole("button", { name: MODEL_ROLES_DOOR })).toBeVisible();
});

test("with a running Utility model there is no door to fix anything", async ({ mount, page }) => {
  await stub(page, ENABLED_VIEW);
  await mount(<MemorySettingsSectionStory />);
  // SETTLED: the running arm's line has painted, so the absence below is not a read still in flight.
  await expect(page.locator('[data-slot="memory-utility-status"]')).toBeVisible();
  await expect(page.getByRole("button", { name: MODEL_ROLES_DOOR })).toHaveCount(0);
});
