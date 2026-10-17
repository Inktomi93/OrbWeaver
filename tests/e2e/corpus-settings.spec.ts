// Settings writes use the shipped controls and HTTP owners; About is intentionally read-only.

import { readFile } from "node:fs/promises";
import type { ConfigGroupId } from "@orb/client/state";
import { formatVersionIdentity } from "@orb/kit/version-identity";
import type { Page } from "@playwright/test";
import { ownerActor } from "./support/actors.ts";
import { openConfigGroup as openGroup } from "./support/config-flow.ts";
import { expect, test } from "./support/corpus-test.ts";
import { SELECTED_CORPUS_FIXTURE } from "./support/modes.ts";

async function toggleAndReload(page: Page, group: ConfigGroupId, label: string): Promise<boolean> {
  await openGroup(page, group);
  const control = page.getByRole("switch", { name: label, exact: true });
  const checked = (await control.getAttribute("aria-checked")) === "true";
  const saved = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("settings.updateUserSettingsSection"));
  await control.click();
  expect((await saved).ok()).toBe(true);
  await page.reload();
  await openGroup(page, group);
  await expect(control).toHaveAttribute("aria-checked", String(!checked));
  const restored = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("settings.updateUserSettingsSection"));
  await control.click();
  expect((await restored).ok()).toBe(true);
  return checked;
}

test.describe("committed corpus settings", () => {
  test.skip(SELECTED_CORPUS_FIXTURE === undefined, "Requires the committed corpus");

  test("Personas notification preferences survive reload", { tag: "@smoke" }, async ({ page }) => {
    const label = "Notify me when my persona changes in a chat";
    const checked = await toggleAndReload(page, "personas", label);
    await expect(page.getByRole("switch", { name: label, exact: true })).toHaveAttribute("aria-checked", String(checked));
  });

  test("Chat behavior persists its native message-handling switch", { tag: "@smoke" }, async ({ page }) => {
    const label = "Empty Enter generates a reply";
    const checked = await toggleAndReload(page, "chat-behavior", label);
    await expect(page.getByRole("switch", { name: label, exact: true })).toHaveAttribute("aria-checked", String(checked));
  });

  test("Jobs tuning persists a changed duplicate threshold", { tag: "@smoke" }, async ({ page, baseURL }) => {
    const host = ownerActor(baseURL ?? "");
    const before = (await host.query("settings.getUserSettings", undefined)).config.workloads.dupThreshold;
    const next = before === 0.9 ? 0.8 : 0.9;
    await openGroup(page, "workloads");
    const input = page.getByRole("textbox", { name: "Duplicate threshold", exact: true });
    await input.fill(String(next));
    await input.press("Tab");
    await expect.poll(async () => (await host.query("settings.getUserSettings", undefined)).config.workloads.dupThreshold).toBe(next);
    await page.reload();
    await openGroup(page, "workloads");
    await expect(input).toHaveValue(String(next));
    await host.mutation("settings.updateUserSettingsSection", { section: "workloads", patch: { dupThreshold: before } });
  });

  test("Automation saves the real owner rate limit", { tag: "@smoke" }, async ({ page, baseURL }) => {
    const host = ownerActor(baseURL ?? "");
    const before = await host.query("automation.getOwnerBudgets", undefined);
    const next = before.maxFiresPerHour === 20 ? 21 : 20;
    await openGroup(page, "automation");
    const input = page.getByRole("textbox", { name: "Runs per hour", exact: true });
    await input.fill(String(next));
    await input.press("Tab");
    await expect.poll(async () => (await host.query("automation.getOwnerBudgets", undefined)).maxFiresPerHour).toBe(next);
    await page.reload();
    await openGroup(page, "automation");
    await expect(input).toHaveValue(String(next));
    await host.mutation("automation.setOwnerBudgets", { maxFiresPerHour: before.maxFiresPerHour });
  });

  test("Admin saves a reversible runtime tuning value", { tag: "@smoke" }, async ({ page, baseURL }) => {
    const host = ownerActor(baseURL ?? "");
    const before = await host.query("settings.getAppSettingsWithOverrides", undefined);
    const next = before.resolved.promptCacheMinDepth === 1 ? 2 : 1;
    await openGroup(page, "admin");
    const input = page.getByRole("textbox", { name: "Prompt-cache depth floor (0–20)", exact: true });
    await input.fill(String(next));
    await page.getByRole("button", { name: "Save", exact: true }).filter({ visible: true }).last().click();
    await expect.poll(async () => (await host.query("settings.getAppSettingsWithOverrides", undefined)).resolved.promptCacheMinDepth).toBe(next);
    await page.reload();
    await openGroup(page, "admin");
    await expect(input).toHaveValue(String(next));
    await host.mutation("settings.updateAppSettings", { partial: { promptCacheMinDepth: before.overrides.promptCacheMinDepth ?? null } });
  });

  test("This install renders the actual version without performing an update check", { tag: "@smoke" }, async ({ page, baseURL }) => {
    const host = ownerActor(baseURL ?? "");
    const version = await host.query("settings.getVersion", undefined);
    const checks: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("settings.checkForUpdate")) {
        checks.push(request.url());
      }
    });
    await openGroup(page, "about");
    await expect(page.getByText(formatVersionIdentity(version), { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Check for updates", exact: true })).toBeVisible();
    expect(checks).toEqual([]);
  });

  test("Backup exports a real library and imports the downloaded bundle", { tag: "@smoke" }, async ({ page }) => {
    test.setTimeout(120_000);
    await openGroup(page, "backup");
    const downloaded = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download my library", exact: true }).click();
    const download = await downloaded;
    expect(await download.failure()).toBeNull();
    const path = await download.path();
    await page
      .getByLabel("Import a backup or card file", { exact: true })
      .setInputFiles({ name: download.suggestedFilename(), mimeType: "application/zip", buffer: await readFile(path) });
    await page
      .getByRole("group", { name: /^Import “/u })
      .getByRole("button", { name: "Import", exact: true })
      .click();
    await expect(page.getByRole("button", { name: "Import another", exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("alert")).toHaveCount(0);
  });
});
