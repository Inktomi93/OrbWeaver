// Settings writes use the shipped controls and HTTP owners; About is intentionally read-only.

import { stat } from "node:fs/promises";
import { testId } from "@orb/client/lib";
import type { ConfigGroupId } from "@orb/client/state";
import { authConfigSchema } from "@orb/contracts/auth-config";
import type { portableTextFileSchema } from "@orb/contracts/portability";
import type { RegexScriptRow } from "@orb/contracts/regex";
import { IMPORT_TREE_MAX_TOTAL_BYTES } from "@orb/contracts/uploads";
import { WORKLOAD_LIST_MAX_LIMIT } from "@orb/contracts/workloads";
import { formatVersionIdentity } from "@orb/kit/version-identity";
import { prepareBackupFolder } from "@orb/testkit/node/composed";
import { budget } from "@orb/tooling/floor/host/load-budget";
import type { Page, Response } from "@playwright/test";
import { ownerActor } from "./support/actors.ts";
import { openConfigGroup as openGroup } from "./support/config-flow.ts";
import { expect, test } from "./support/corpus-test.ts";
import { SELECTED_CORPUS_FIXTURE } from "./support/modes.ts";
import { restoreAllowanceMs } from "./support/timeouts.ts";

const BUNDLE_IMPORT_ROUTE = "/api/import/bundle";
const IMPORT_GROUP_NAME = /^Import /u;
// Quiet-box bases for the corpus-sized Backup case; `budget` stretches them under measured contention.
const BACKUP_CASE_BASE_MS = 120_000;
const IMPORT_SETTLE_BASE_MS = 60_000;

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

async function chooseBackup(page: Page, path: string, folder: boolean): Promise<void> {
  if (folder) {
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", { name: "Import a folder…", exact: true }).click()]);
    await chooser.setFiles(path);
  } else {
    await page.getByLabel("Import a backup or card file", { exact: true }).setInputFiles(path);
  }
}

async function assertNativeRestore(
  page: Page,
  host: ReturnType<typeof ownerActor>,
  restore: { readonly folder: boolean; readonly entries: number; readonly settleMs: number },
): Promise<void> {
  const { folder, entries } = restore;
  const owner = await host.trpc.sessions.me.query(undefined);
  const preflight = page.getByRole("group", { name: IMPORT_GROUP_NAME });
  await expect(preflight).toBeVisible();
  // A full capped page cannot prove the complete native workload-set difference.
  const before = await host.trpc.workloads.list.query({ kind: "import-bundle", limit: WORKLOAD_LIST_MAX_LIMIT });
  expect(before.length).toBeLessThan(WORKLOAD_LIST_MAX_LIMIT);
  const beforeIds = new Set(before.map((row) => row.id));
  const route = folder ? "/api/import/tree" : BUNDLE_IMPORT_ROUTE;
  const matches = (response: Response): boolean => response.request().method() === "POST" && new URL(response.url()).pathname === route;
  const statuses: number[] = [];
  const record = (response: Response): void => {
    if (matches(response)) {
      statuses.push(response.status());
    }
  };
  page.on("response", record);
  try {
    const [response] = await Promise.all([page.waitForResponse(matches), preflight.getByRole("button", { name: "Import", exact: true }).click()]);
    expect(response.status()).toBe(202);
    await expect(page.getByRole("button", { name: "Import another", exact: true })).toBeVisible({ timeout: restore.settleMs });
    expect(statuses.every((status) => status === 202)).toBe(true);
    // The UI owns response parsing; native rows supply identities without rereading an evicted response body.
    const after = await host.trpc.workloads.list.query({ kind: "import-bundle", limit: WORKLOAD_LIST_MAX_LIMIT });
    expect(after.length).toBeLessThan(WORKLOAD_LIST_MAX_LIMIT);
    const created = after.filter((row) => !beforeIds.has(row.id));
    expect(created).toHaveLength(statuses.length);
    expect(created.length).toBe(folder ? statuses.length : 1);
    let imported = 0;
    let skipped = 0;
    let failed = 0;
    for (const row of created) {
      const workload = await host.trpc.workloads.get.query({ id: row.id });
      expect(workload.ownerId).toBe(owner.userId);
      expect(workload.status).toBe("succeeded");
      if (workload.poison || workload.kind !== "import-bundle" || workload.result === null) {
        throw new Error("Backup import has no canonical bundle result");
      }
      expect(workload.params.source ?? "zip").toBe(folder ? "dir" : "zip");
      imported += workload.result.imported;
      skipped += workload.result.skipped;
      failed += workload.result.failed;
    }
    // Native successful reuse counts as imported; skipped means an unsupported or unattempted file.
    expect(failed).toBe(0);
    expect(skipped).toBe(0);
    expect(imported + skipped + failed).toBe(entries);
    await expect(page.getByTestId(testId("importReport"))).toContainText(`${String(imported)} imported`);
  } finally {
    page.off("response", record);
  }
}

async function assertRestoredWitness(
  page: Page,
  host: ReturnType<typeof ownerActor>,
  witness: RegexScriptRow,
  { exported, settleMs }: { readonly exported: ReturnType<typeof portableTextFileSchema.parse>; readonly settleMs: number },
): Promise<RegexScriptRow> {
  const restored = (await host.trpc.regex.listScripts.query(undefined)).filter((script) => script.name === witness.name);
  expect(restored).toHaveLength(1);
  const restoredScript = restored[0];
  if (restoredScript === undefined) {
    throw new Error("Backup import did not restore its removed script");
  }
  expect(restoredScript.id).not.toBe(witness.id);
  expect((await host.trpc.regex.exportScript.query({ scriptId: restoredScript.id })).fileText).toBe(exported.fileText);
  await openGroup(page, "regex");
  await page.getByRole("button", { name: witness.name, exact: true }).click();
  // The editor reads the script while the restored library's follow-up work still loads the server.
  await expect(page.getByRole("textbox", { name: "Replace with", exact: true })).toHaveValue(witness.replaceString, { timeout: settleMs });
  return restoredScript;
}

async function restoreBackup(
  page: Page,
  host: ReturnType<typeof ownerActor>,
  witness: RegexScriptRow,
  input: {
    readonly path: string;
    readonly folder: boolean;
    readonly entries: number;
    readonly exported: ReturnType<typeof portableTextFileSchema.parse>;
    readonly settleMs: number;
  },
): Promise<RegexScriptRow> {
  await host.trpc.regex.removeScript.mutate({ scriptId: witness.id });
  expect((await host.trpc.regex.listScripts.query(undefined)).some((script) => script.name === witness.name)).toBe(false);
  await chooseBackup(page, input.path, input.folder);
  await assertNativeRestore(page, host, input);
  if (!input.folder) {
    await page.getByRole("button", { name: "Import another", exact: true }).click();
  }
  return await assertRestoredWitness(page, host, witness, input);
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
    const before = (await host.trpc.settings.getUserSettings.query(undefined)).config.workloads.dupThreshold;
    const next = before === 0.9 ? 0.8 : 0.9;
    await openGroup(page, "workloads");
    const input = page.getByRole("textbox", { name: "Duplicate threshold", exact: true });
    await input.fill(String(next));
    await input.press("Tab");
    await expect.poll(async () => (await host.trpc.settings.getUserSettings.query(undefined)).config.workloads.dupThreshold).toBe(next);
    await page.reload();
    await openGroup(page, "workloads");
    await expect(input).toHaveValue(String(next));
    await host.trpc.settings.updateUserSettingsSection.mutate({ section: "workloads", patch: { dupThreshold: before } });
  });

  test("Automation saves the real owner rate limit", { tag: "@smoke" }, async ({ page, baseURL }) => {
    const host = ownerActor(baseURL ?? "");
    const before = await host.trpc.automation.getOwnerBudgets.query(undefined);
    const next = before.maxFiresPerHour === 20 ? 21 : 20;
    await openGroup(page, "automation");
    const input = page.getByRole("textbox", { name: "Runs per hour", exact: true });
    await input.fill(String(next));
    await input.press("Tab");
    await expect.poll(async () => (await host.trpc.automation.getOwnerBudgets.query(undefined)).maxFiresPerHour).toBe(next);
    await page.reload();
    await openGroup(page, "automation");
    await expect(input).toHaveValue(String(next));
    await host.trpc.automation.setOwnerBudgets.mutate({ maxFiresPerHour: before.maxFiresPerHour });
  });

  test("Admin saves a reversible runtime tuning value", { tag: "@smoke" }, async ({ page, baseURL }) => {
    const host = ownerActor(baseURL ?? "");
    const before = await host.trpc.settings.getAppSettingsWithOverrides.query(undefined);
    const next = before.resolved.promptCacheMinDepth === 1 ? 2 : 1;
    await openGroup(page, "admin");
    const input = page.getByRole("textbox", { name: "Prompt-cache depth floor (0–20)", exact: true });
    await input.fill(String(next));
    await page.getByRole("button", { name: "Save", exact: true }).filter({ visible: true }).last().click();
    await expect.poll(async () => (await host.trpc.settings.getAppSettingsWithOverrides.query(undefined)).resolved.promptCacheMinDepth).toBe(next);
    await page.reload();
    await openGroup(page, "admin");
    await expect(input).toHaveValue(String(next));
    await host.trpc.settings.updateAppSettings.mutate({ partial: { promptCacheMinDepth: before.overrides.promptCacheMinDepth ?? null } });
  });

  test("This install renders the actual version without performing an update check", { tag: "@smoke" }, async ({ page, baseURL }) => {
    const host = ownerActor(baseURL ?? "");
    const version = await host.trpc.settings.getVersion.query(undefined);
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

  test("Backup exports a real library and imports the downloaded bundle", { tag: "@smoke" }, async ({ page, baseURL }, testInfo) => {
    // The export size is unknown until the download lands, so the case starts with the folder bound's allowance.
    test.setTimeout(budget(BACKUP_CASE_BASE_MS + restoreAllowanceMs(IMPORT_TREE_MAX_TOTAL_BYTES)));
    const host = ownerActor(baseURL ?? "");
    const scriptId = SELECTED_CORPUS_FIXTURE?.wire.regexLibrary?.ids.scriptId;
    if (scriptId === undefined) {
      throw new Error("Backup restore requires the captured regex library");
    }
    // An unattached native duplicate makes the removable witness without deleting captured scope edges.
    const copy = await host.trpc.regex.duplicateScript.mutate({ scriptId });
    let witness: RegexScriptRow = await host.trpc.regex.updateScript.mutate({ scriptId: copy.id, input: { name: `Backup restore ${copy.id}` } });
    const exported = await host.trpc.regex.exportScript.query({ scriptId: witness.id });
    await openGroup(page, "backup");
    const downloaded = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download my library", exact: true }).click();
    const download = await downloaded;
    expect(await download.failure()).toBeNull();
    const filename = download.suggestedFilename();
    expect(filename).toMatch(/\.zip$/iu);
    const path = testInfo.outputPath(filename);
    await download.saveAs(path);
    const configResponse = await page.request.get("/api/auth/config");
    expect(configResponse.ok()).toBe(true);
    const caps = authConfigSchema.parse(await configResponse.json()).uploads;
    const archiveBytes = (await stat(path)).size;
    const allowance = restoreAllowanceMs(archiveBytes);
    // Narrow to this archive, so a small library still fails fast.
    test.setTimeout(budget(BACKUP_CASE_BASE_MS + allowance));
    const settleMs = budget(IMPORT_SETTLE_BASE_MS + allowance);
    // The served ZIP cap holds any export this build can write, so the library restores through its ZIP.
    expect(archiveBytes).toBeLessThanOrEqual(caps.importBundle);
    await using folder = await prepareBackupFolder(path, testInfo.outputPath("backup-folder"));
    witness = await restoreBackup(page, host, witness, { path, folder: false, entries: folder.entries, exported, settleMs });
    await openGroup(page, "backup");
    await restoreBackup(page, host, witness, { path: folder.directory, folder: true, entries: folder.entries, exported, settleMs });
  });
});
