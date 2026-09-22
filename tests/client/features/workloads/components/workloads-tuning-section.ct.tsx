// CT: the Workloads analysis-tuning SECTION (Phase B ⑤ — workloads-tuning-section.tsx), a settings-section
// CONTRIBUTION at the workloads anchor. Drives the production autosave path: getUserSettings seeds the form
// (dupThreshold/computeThemesK/maxPairs/hubFraction from the display floors), each change debounces then
// fires updateUserSettingsSection("workloads") with the full section patch. Proves the previously-unbound
// knobs now have a real write path (B:workloads pruned).

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { WorkloadsTuningSectionStory } from "../_ct-stories.tsx";

const SETTINGS_VIEW = {
  userId: "user_ct_workloads",
  schemaVersion: 1,
  config: DEFAULT_USER_SETTINGS,
  updatedAt: 0,
};

const UPDATE_PROC = "settings.updateUserSettingsSection";

function stub(page: Page): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "settings.getUserSettings": () => SETTINGS_VIEW,
    [UPDATE_PROC]: () => SETTINGS_VIEW,
  });
}

/** The most recent workloads-section patch body. */
function lastPatch(trpc: TrpcRecorder): Record<string, unknown> | undefined {
  const input = trpc.lastInput(UPDATE_PROC) as { section?: string; patch?: Record<string, unknown> } | undefined;
  return input?.section === "workloads" ? input.patch : undefined;
}

test("mounts with the display floors (theme clusters 12, hub cutoff 0.5)", async ({ mount, page }) => {
  await stub(page);
  await mount(<WorkloadsTuningSectionStory />);
  await expect(page.getByRole("textbox", { name: "Theme clusters" })).toHaveValue("12");
  await expect(page.getByRole("textbox", { name: "Hub-token cutoff" })).toHaveValue("0.5");
});

test("stepping theme clusters fires updateUserSettingsSection('workloads') with the full section", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<WorkloadsTuningSectionStory />);
  await page.getByRole("textbox", { name: "Theme clusters" }).focus();
  await page.getByRole("button", { name: "Increase" }).nth(1).click();
  await expect(page.getByRole("textbox", { name: "Theme clusters" })).toHaveValue("13");
  // The autosave form submits the whole section — the moved field + the untouched cooccurrence knobs.
  await expect.poll(() => lastPatch(trpc)?.["computeThemesK"], { intervals: [20, 50, 100] }).toBe(13);
  expect(lastPatch(trpc)?.["hubFraction"]).toBe(0.5);
});

test("toggling the hub-token cutoff fires the workloads patch with the new hubFraction", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<WorkloadsTuningSectionStory />);
  await page.getByRole("textbox", { name: "Hub-token cutoff" }).focus();
  await page.getByRole("button", { name: "Increase" }).last().click();
  await expect.poll(() => lastPatch(trpc)?.["hubFraction"], { intervals: [20, 50, 100] }).toBe(0.55);
});
