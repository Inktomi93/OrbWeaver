// CT: the Operations admin SECTION (SET-SEAMS stage 4) — background corpus indexing + the live log level.
// Both controls write IMMEDIATELY (no draft), which is the shape worth pinning: the shared row must offer
// Reset ALONE (a permanently-disabled Save button would be dead chrome), and each write must still be
// key-minimal.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder, TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { OperationsSectionStory } from "../_ct-stories.tsx";
import type { EffectiveAppSettings } from "../app-settings-fixtures.ts";
import { appSettingsView, effectiveAppSettings } from "../app-settings-fixtures.ts";

const UPDATE_PROC = "settings.updateAppSettings";

type AppSettingsOverrides = TrpcWireOutput<"settings.getAppSettingsWithOverrides">["overrides"];

const RESOLVED: Partial<EffectiveAppSettings> = { corpusAutoindex: false, logLevel: "info" };

function stub(page: Page, overrides: Partial<AppSettingsOverrides> = {}): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "settings.getAppSettingsWithOverrides": () => appSettingsView(RESOLVED, overrides),
    [UPDATE_PROC]: () => effectiveAppSettings(RESOLVED),
  });
}

function lastPartial(trpc: TrpcRecorder): Record<string, unknown> | undefined {
  return (trpc.lastInput(UPDATE_PROC) as { partial?: Record<string, unknown> } | undefined)?.partial;
}

test("mounts on the resolved values, stamps its anchor, and offers no dead Save button", async ({ mount, page }) => {
  await stub(page);
  await mount(<OperationsSectionStory />);

  await expect(page.getByRole("switch", { name: "Background corpus indexing" })).not.toBeChecked();
  await expect(page.getByRole("combobox", { name: "Log level" })).toContainText("Info");
  await expect(page.locator("#config-anchor-admin-operations")).toBeVisible();
  // Every control here writes immediately — there is no draft, so there is no Save.
  await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);
});

test("toggling the indexer patches EXACTLY that key", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<OperationsSectionStory />);

  await page.getByRole("switch", { name: "Background corpus indexing" }).click();
  await expect.poll(() => lastPartial(trpc), { intervals: [20, 50, 100] }).toStrictEqual({ corpusAutoindex: true });
});

test("picking a log level patches EXACTLY that key", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<OperationsSectionStory />);

  await page.getByRole("combobox", { name: "Log level" }).click();
  await page.getByRole("option", { name: "Debug" }).click();
  await expect.poll(() => lastPartial(trpc), { intervals: [20, 50, 100] }).toStrictEqual({ logLevel: "debug" });
});

test("Reset appears only with an override and clears both of this section's keys", async ({ mount, page }) => {
  const trpc = await stub(page, { logLevel: "debug" });
  await mount(<OperationsSectionStory />);

  await expect(page.getByText("Overridden. Reset to fall back to this deployment's default.")).toBeVisible();
  await page.getByRole("button", { name: "Reset to defaults" }).click();
  await expect.poll(() => lastPartial(trpc), { intervals: [20, 50, 100] }).toStrictEqual({ corpusAutoindex: null, logLevel: null });
});
