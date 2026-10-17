// Collection edits retain native grammar, relationships and persistence across a browser reload.

import { connectionSummary } from "@orb/client/lib";
import type { CorpusWire } from "@orb/testkit/iso/corpus.ts";
import { ownerActor } from "./support/actors.ts";
import { openConfigGroup } from "./support/config-flow.ts";
import { expect, test } from "./support/corpus-test.ts";
import { SELECTED_CORPUS_FIXTURE } from "./support/modes.ts";

function corpus(): CorpusWire {
  if (SELECTED_CORPUS_FIXTURE === undefined) {
    throw new Error("Collection smoke requires the committed corpus");
  }
  return SELECTED_CORPUS_FIXTURE.wire;
}

test.describe("committed corpus collection settings", () => {
  test.skip(SELECTED_CORPUS_FIXTURE === undefined, "Requires the committed corpus");

  test("Regex scripts edit a captured member and persist it through reload", { tag: "@smoke" }, async ({ page, baseURL }) => {
    const host = ownerActor(baseURL ?? "");
    const id = corpus().regexLibrary?.ids.scriptId;
    const before = (await host.query("regex.listScripts", undefined)).find((item) => item.id === id);
    if (before === undefined) {
      throw new Error("Corpus regex member is absent");
    }
    await openConfigGroup(page, "regex");
    await page.getByRole("button", { name: before.name, exact: true }).click();
    const field = page.getByRole("textbox", { name: "Replace with", exact: true });
    const original = await field.inputValue();
    const next = `${original} corpus smoke`;
    await field.fill(next);
    await field.press("Tab");
    await expect.poll(async () => (await host.query("regex.listScripts", undefined)).find((item) => item.id === id)?.replaceString).toBe(next);
    await page.reload();
    await openConfigGroup(page, "regex");
    await page.getByRole("button", { name: before.name, exact: true }).click();
    await expect(field).toHaveValue(next);
    const saved = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("regex.updateScript"));
    await field.fill(original);
    await field.press("Tab");
    expect((await saved).ok()).toBe(true);
  });

  test("World Info edits the captured book through its details dialog", { tag: "@smoke" }, async ({ page, baseURL }) => {
    const host = ownerActor(baseURL ?? "");
    const bookId = corpus().worldInfoLibrary?.ids.libraryBookId;
    if (bookId === undefined) {
      throw new Error("Corpus world book is absent");
    }
    const before = await host.query("worldInfo.getBook", { bookId });
    await openConfigGroup(page, "worldInfo");
    await page.getByRole("button", { name: before.name, exact: true }).click();
    await page.getByRole("button", { name: "Edit details", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Book details", exact: true });
    const description = `${before.description ?? ""} corpus smoke`;
    await dialog.getByRole("textbox", { name: "Description", exact: true }).fill(description);
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(async () => (await host.query("worldInfo.getBook", { bookId })).description).toBe(description.trim());
    await page.reload();
    await openConfigGroup(page, "worldInfo");
    await page.getByRole("button", { name: before.name, exact: true }).click();
    await page.getByRole("button", { name: "Edit details", exact: true }).click();
    await expect(dialog.getByRole("textbox", { name: "Description", exact: true })).toHaveValue(description.trim());
    await dialog.getByRole("textbox", { name: "Description", exact: true }).fill(before.description ?? "");
    const saved = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("worldInfo.updateBook"));
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    expect((await saved).ok()).toBe(true);
  });

  test("Rosters save a description without replacing their members or rules", { tag: "@smoke" }, async ({ page, baseURL }) => {
    const host = ownerActor(baseURL ?? "");
    const presetId = corpus().libraryRelations?.ids.rosterPresetId;
    if (presetId === undefined) {
      throw new Error("Corpus roster is absent");
    }
    const before = await host.query("rosterPreset.get", { presetId });
    await openConfigGroup(page, "rosterPreset");
    await page.getByRole("button", { name: before.name, exact: true }).click();
    const input = page.getByRole("textbox", { name: "Description", exact: true });
    const next = `${before.description} corpus smoke`;
    await input.fill(next);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(async () => (await host.query("rosterPreset.get", { presetId })).description).toBe(next);
    const after = await host.query("rosterPreset.get", { presetId });
    expect(after.members).toEqual(before.members);
    expect(after.rules).toEqual(before.rules);
    await page.reload();
    await openConfigGroup(page, "rosterPreset");
    await page.getByRole("button", { name: before.name, exact: true }).click();
    await expect(input).toHaveValue(next);
    const saved = page.waitForResponse((response) => response.request().method() === "POST" && response.url().includes("rosterPreset.update"));
    await input.fill(before.description);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    expect((await saved).ok()).toBe(true);
  });

  test("Connections edit an owned endpoint label without changing its transport", { tag: "@smoke" }, async ({ page, baseURL }) => {
    const host = ownerActor(baseURL ?? "");
    const id = corpus().libraryRelations?.ids.connectionId;
    const before = (await host.query("connection.list", undefined)).find((connection) => connection.id === id);
    if (before === undefined) {
      throw new Error("Corpus endpoint is absent");
    }
    await openConfigGroup(page, "connections");
    await page.getByRole("button", { name: connectionSummary(before), exact: true }).click();
    await expect.poll(async () => (await host.query("connection.list", undefined)).find((connection) => connection.id === id)?.modelCheck).toBe("listed");
    const field = page.getByRole("textbox", { name: "Name", exact: true });
    const next = `${before.label} smoke`;
    await field.fill(next);
    await field.press("Tab");
    await expect.poll(async () => (await host.query("connection.list", undefined)).find((connection) => connection.id === id)?.label).toBe(next);
    await page.reload();
    await openConfigGroup(page, "connections");
    await page.getByRole("button", { name: connectionSummary({ ...before, label: next }), exact: true }).click();
    await expect(field).toHaveValue(next);
    const after = (await host.query("connection.list", undefined)).find((connection) => connection.id === id);
    expect(after?.baseUrl).toBe(before.baseUrl);
    await host.mutation("connection.update", { connectionId: before.id, patch: { label: before.label } });
  });

  test("Plugins toggle the actual installed corpus plugin and persist its activation", { tag: "@smoke" }, async ({ page, baseURL }) => {
    const host = ownerActor(baseURL ?? "");
    const id = corpus().pluginLibrary?.ownerActive.ids.pluginId;
    const before = (await host.query("plugin.list", undefined)).find((plugin) => plugin.id === id);
    if (before === undefined) {
      throw new Error("Corpus plugin is absent");
    }
    await openConfigGroup(page, "plugins");
    const enabled = before.status === "enabled";
    await page.getByRole("switch", { name: `Turn ${before.name} ${enabled ? "off" : "on"}`, exact: true }).click();
    await expect
      .poll(async () => (await host.query("plugin.list", undefined)).find((plugin) => plugin.id === id)?.status)
      .toBe(enabled ? "disabled" : "enabled");
    await page.reload();
    await openConfigGroup(page, "plugins");
    const restore = page.getByRole("switch", { name: `Turn ${before.name} ${enabled ? "on" : "off"}`, exact: true });
    await expect(restore).toBeVisible();
    await restore.click();
    await expect.poll(async () => (await host.query("plugin.list", undefined)).find((plugin) => plugin.id === id)?.status).toBe(before.status);
  });
});
