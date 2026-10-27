import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { actionGroupGeometry } from "@orb/testkit/browser/spec";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { ENLARGED_APPEARANCE_SETTINGS } from "@orb/testkit/iso";
import { createServerHarness } from "@orb/testkit/node/composed";
import type { ConnectionActionGroupsStory, CredentialActionGroupsStory } from "./_connection-action-groups-stories.tsx";

const KEYS_STORY = "tests/client/features/credentials/components/_connection-action-groups-stories/CredentialActionGroupsStory";
const CONNECTION_STORY = "tests/client/features/credentials/components/_connection-action-groups-stories/ConnectionActionGroupsStory";
const KEY_LABEL = "The shared key for the long-running collaborative story and its alternate model";
const CONNECTION_LABEL = "The connection whose declared facts are being edited";
const SECRET = "synthetic-layout-key-never-returned";
const MODEL = "gpt-6-sol";
const READS = [
  "sessions.me",
  "settings.getUserSettings",
  "connection.list",
  "connection.listBindings",
  "credentials.list",
  "connection.providersAvailable",
  "connection.catalogModels",
  "connection.get",
  "connection.capabilities",
] as const;
const REGIMES = [
  { name: "wide desktop", width: 960, viewport: { width: 1280, height: 900 }, coarse: false, appearance: appearanceSettingsSchema.parse({}) },
  { name: "narrow desktop enlarged", width: 300, viewport: { width: 1280, height: 900 }, coarse: false, appearance: ENLARGED_APPEARANCE_SETTINGS },
  { name: "phone portrait enlarged", width: 390, viewport: { width: 390, height: 844 }, coarse: true, appearance: ENLARGED_APPEARANCE_SETTINGS },
  { name: "phone landscape enlarged", width: 844, viewport: { width: 844, height: 390 }, coarse: true, appearance: ENLARGED_APPEARANCE_SETTINGS },
] as const;

for (const regime of REGIMES) {
  test.describe(regime.name, () => {
    test.use({ viewport: regime.viewport, isMobile: regime.coarse, hasTouch: regime.coarse });
    test("saved-key actions remain state-exclusive and canceled secret/destructive prompts do not write", async ({ mount, page }, testInfo) => {
      await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark", forcedColors: "none" });
      await using root = await createServerHarness({ startJobs: false, secretBoxKey: Buffer.alloc(32, 17) });
      const caller = await root.internalCallerFor(root.ownerId);
      await caller.settings.updateUserSettingsSection({ section: "appearance", patch: regime.appearance });
      const credential = await caller.credentials.add({ provider: "openai", key: SECRET, label: KEY_LABEL });
      await caller.connection.create({ providerId: "openai", credentialId: credential.id, baseUrl: null, model: MODEL, label: CONNECTION_LABEL });
      const routes = await routeTrpc(page, {
        ...serveCorpusProcedures(caller, READS),
        ...serveCorpusProcedures(caller, ["credentials.replace", "credentials.markRevokedByUser", "credentials.clearRevoked", "credentials.remove"]),
      });
      await mount<typeof CredentialActionGroupsStory>(KEYS_STORY, { width: regime.width, appearance: regime.appearance });
      const row = page.locator('[data-slot="list-row-root"]').filter({ hasText: KEY_LABEL });
      const replace = row.getByRole("button", { name: /^Replace the /u });
      const revoke = row.getByRole("button", { name: /^Revoke the /u });
      await expect(replace).toBeVisible();
      await expect(row.getByRole("button")).toHaveCount(2);
      await expect(page.getByText(SECRET, { exact: false })).toHaveCount(0);
      let geometry = await actionGroupGeometry(page.locator('[data-slot="credential-action-host"]'), [replace, revoke]);
      expect(geometry.inlineOverflow).toBeLessThanOrEqual(1);
      await replace.focus();
      await page.keyboard.press("Tab");
      await expect(revoke).toBeFocused();
      await replace.click();
      const replacement = page.getByRole("dialog", { name: /^Replace the /u });
      await expect(replacement).toContainText("the old key is overwritten");
      await replacement.getByLabel(/^New /u).fill("synthetic-unsaved-replacement-key");
      await replacement.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(replacement).toHaveCount(0);
      await expect(replace).toBeFocused();
      expect(routes.count("credentials.replace")).toBe(0);
      await revoke.click();
      const revocation = page.getByRole("alertdialog", { name: /^Revoke the /u });
      await expect(revocation).toContainText("so no turn uses it");
      await revocation.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(revoke).toBeFocused();
      expect(routes.count("credentials.markRevokedByUser")).toBe(0);
      await revoke.click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Revoke", exact: true }).click();
      const clear = row.getByRole("button", { name: "Clear revoked", exact: true });
      const remove = row.getByRole("button", { name: /^Remove the /u });
      await expect(clear).toBeVisible();
      await expect(row.getByText("Revoked by you", { exact: false })).toBeVisible();
      await expect(row.getByRole("button")).toHaveCount(2);
      geometry = await actionGroupGeometry(page.locator('[data-slot="credential-action-host"]'), [clear, remove]);
      await testInfo.attach("revoked-key-action-boxes", { body: JSON.stringify(geometry), contentType: "application/json" });
      expect(geometry.inlineOverflow).toBeLessThanOrEqual(1);
      await clear.focus();
      await page.keyboard.press("Tab");
      await expect(remove).toBeFocused();
      await remove.press("Enter");
      const removal = page.getByRole("alertdialog", { name: /^Remove the /u });
      await expect(removal).toContainText("This can't be undone");
      await removal.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(remove).toBeFocused();
      expect(routes.count("credentials.remove")).toBe(0);
      expect((await caller.credentials.list()).find((key) => key.id === credential.id)).toMatchObject({ revokedReason: "user" });
      await clear.click();
      await expect(replace).toBeVisible();
      expect((await caller.credentials.list()).find((key) => key.id === credential.id)?.revokedAt).toBeNull();
    });
    test("the real Advanced fact editor keeps Override, Cancel/Save and Reset contained and cancellation preserves the server value", async ({
      mount,
      page,
    }, testInfo) => {
      await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark", forcedColors: "none" });
      const providerFetch: typeof fetch = (input, init) => {
        const request = new Request(input, init);
        if (request.method !== "GET" || new URL(request.url).pathname !== "/v1/models") {
          throw new Error(`Unexpected fact editor request: ${request.method} ${request.url}`);
        }
        return Promise.resolve(Response.json({ data: [{ id: MODEL }] }));
      };
      await using root = await createServerHarness({ startJobs: false, providerFetch, secretBoxKey: Buffer.alloc(32, 17) });
      const caller = await root.internalCallerFor(root.ownerId);
      await caller.settings.updateUserSettingsSection({ section: "appearance", patch: regime.appearance });
      const key = await caller.credentials.add({ provider: "openai", key: SECRET });
      const connection = await caller.connection.create({ providerId: "openai", credentialId: key.id, baseUrl: null, model: MODEL, label: CONNECTION_LABEL });
      const routes = await routeTrpc(page, {
        ...serveCorpusProcedures(caller, READS),
        ...serveCorpusProcedures(caller, ["connection.update", "connection.embedSpaceChangePreview"]),
      });
      await mount<typeof ConnectionActionGroupsStory>(CONNECTION_STORY, { width: regime.width, appearance: regime.appearance });
      await page.locator('[data-slot="list-row-body"]').filter({ hasText: CONNECTION_LABEL }).click();
      await page.getByRole("button", { name: /^Advanced/u }).click();
      const row = page.locator('[data-slot="connection-fact-row"]').filter({ has: page.getByRole("button", { name: "Override max output", exact: true }) });
      const override = row.getByRole("button", { name: "Override max output", exact: true });
      await expect(override).toBeVisible();
      expect((await actionGroupGeometry(row, [override])).inlineOverflow).toBeLessThanOrEqual(1);
      await override.click();
      const field = row.getByRole("textbox", { name: "max output — your value", exact: true });
      const before = await field.inputValue();
      const save = row.getByRole("button", { name: "Save your max output", exact: true });
      const cancel = row.getByRole("button", { name: "Cancel", exact: true });
      const geometry = await actionGroupGeometry(row, [cancel, save]);
      await testInfo.attach("actual-fact-editor-action-boxes", { body: JSON.stringify(geometry), contentType: "application/json" });
      expect(geometry.inlineOverflow).toBeLessThanOrEqual(1);
      await field.fill(String(Number(before) + 1));
      await cancel.focus();
      await page.keyboard.press("Tab");
      await expect(save).toBeFocused();
      await cancel.click();
      await expect(field).toHaveCount(0);
      expect(routes.count("connection.update")).toBe(0);
      expect((await caller.connection.get({ connectionId: connection.id })).declared).toBeNull();
      await override.click();
      await expect(field).toHaveValue(before);
      await field.fill(String(Number(before) + 1));
      await save.click();
      const reset = page.getByRole("button", { name: "Reset max output", exact: true });
      await expect(reset).toBeVisible();
      const resetRow = page.locator('[data-slot="connection-fact-row"]').filter({ has: reset });
      await expect(resetRow).toBeFocused();
      expect((await actionGroupGeometry(resetRow, [reset])).inlineOverflow).toBeLessThanOrEqual(1);
      await reset.click();
      await expect(page.getByRole("button", { name: "Override max output", exact: true })).toBeVisible();
      expect((await caller.connection.get({ connectionId: connection.id })).declared).toBeNull();
    });
  });
}
