// CT: the real System settings pane (Task #37 — system-settings-surface.tsx, the APP-tier AppSettings home).
// Drives the production DELTA-autosave path: `getAppSettings` (the resolved effective config) + `sessions.me`
// (the viewer role) seed the form; each control change debounces then fires `updateAppSettings` with a
// PARTIAL carrying ONLY the moved fields (system-settings-model.ts `diffSystemPatch` — the env-floor-honest
// write, unlike appearance's whole-section patch). Assertions anchor to the real bound-field labels + the
// wire being BYTES (the MB↔bytes projection).

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { BYTES_PER_MB } from "../../../../../packages/client/src/features/settings/lib/system-settings-model";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { SystemSettingsStory } from "../_ct-stories";

// A resolved EffectiveAppConfig (every field present — env floor ⊕ override). `maxImageBytes` is 5 MB, so
// the MB field renders 5; `vllmConcurrency` embed/summarize render as numbers.
const APP_CONFIG = {
  corpusAutoindex: false,
  importSkipCharacters: [],
  logLevel: "info",
  forbidExternalMedia: true,
  trustHtml: false,
  memoryDefaults: {},
  memorySummarizer: {},
  rateLimits: { general: 100, aiTurn: 10, publicIp: 50, authed: 200 },
  vllmConcurrency: { embed: 4, summarize: 2 },
  allowNonOwnerLocalCompute: true,
  nonOwnerLocalComputeBudget: null,
  allowNonOwnerMaxProSub: false,
  maxImageBytes: 5 * BYTES_PER_MB,
};

const OWNER = { userId: "user_owner", handle: "owner", globalRole: "owner" };
const ADMIN = { userId: "user_admin", handle: "admin", globalRole: "admin" };

const UPDATE_PROC = "settings.updateAppSettings";

function stub(page: Page, viewer: typeof OWNER): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "settings.getAppSettings": () => APP_CONFIG,
    "sessions.me": () => viewer,
    [UPDATE_PROC]: () => APP_CONFIG,
  });
}

/** The most recent override PARTIAL sent to `updateAppSettings`. */
function lastPatch(trpc: TrpcRecorder): Record<string, unknown> | undefined {
  const input = trpc.lastInput(UPDATE_PROC) as { partial?: Record<string, unknown> } | undefined;
  return input?.partial;
}

test("mounts with the resolved effective values rendered", async ({ mount, page }) => {
  await stub(page, OWNER);
  await mount(<SystemSettingsStory />);
  // Booleans reflect the effective config (forbidExternalMedia true → checked; trustHtml false).
  await expect(page.getByRole("switch", { name: "Block external media" })).toBeChecked();
  await expect(page.getByRole("switch", { name: "Render rich HTML as trusted" })).not.toBeChecked();
  // logLevel resolves to Info; the MB projection shows 5 (5_000_000 bytes / 1e6).
  await expect(page.getByRole("combobox", { name: "Log level" })).toContainText("Info");
  await expect(page.getByRole("textbox", { name: "Max generated-image download (MB)" })).toHaveValue("5");
});

test("toggling a switch sends a DELTA partial — only the moved field, not the whole config", async ({ mount, page }) => {
  const trpc = await stub(page, OWNER);
  await mount(<SystemSettingsStory />);

  await page.getByRole("switch", { name: "Block external media" }).click();
  // No DOM correlate for the debounced write landing (busDriven, no refetch) — tighten the poll.
  await expect.poll(() => lastPatch(trpc)?.["forbidExternalMedia"], { intervals: [20, 50, 100] }).toBe(false);
  // Env-floor honesty: an UNTOUCHED env-mirrored field is NOT pinned into the override.
  expect(lastPatch(trpc)).not.toHaveProperty("logLevel");
  expect(lastPatch(trpc)).not.toHaveProperty("corpusAutoindex");
});

test("maxImageBytes: the MB field maps back to BYTES on the wire", async ({ mount, page }) => {
  const trpc = await stub(page, OWNER);
  await mount(<SystemSettingsStory />);

  // Step the MB field 5 → 6; the override must carry BYTES (6 MB = 6_000_000), never the MB display value.
  await page.getByRole("textbox", { name: "Max generated-image download (MB)" }).focus();
  await page.getByRole("button", { name: "Increase" }).first().click();
  await expect(page.getByRole("textbox", { name: "Max generated-image download (MB)" })).toHaveValue("6");
  await expect.poll(() => lastPatch(trpc)?.["maxImageBytes"], { intervals: [20, 50, 100] }).toBe(6 * BYTES_PER_MB);
});

test("as a non-owner admin, the D17 Shared-access governance controls are disabled", async ({ mount, page }) => {
  await stub(page, ADMIN);
  await mount(<SystemSettingsStory />);
  // requireOwner server-side → a delegated admin sees the box-governance toggles read-only.
  await expect(page.getByRole("switch", { name: "Members may use shared local compute" })).toBeDisabled();
  await expect(page.getByRole("switch", { name: "Members may use the hosted subscription" })).toBeDisabled();
  // A non-governance field (Media & trust) stays editable for the admin.
  await expect(page.getByRole("switch", { name: "Block external media" })).toBeEnabled();
});

test("as the owner, the D17 Shared-access controls are editable and patch on change", async ({ mount, page }) => {
  const trpc = await stub(page, OWNER);
  await mount(<SystemSettingsStory />);
  const localCompute = page.getByRole("switch", { name: "Members may use shared local compute" });
  await expect(localCompute).toBeEnabled();
  // Effective config has it ON → flip OFF; the delta carries just that governance field.
  await localCompute.click();
  await expect.poll(() => lastPatch(trpc)?.["allowNonOwnerLocalCompute"], { intervals: [20, 50, 100] }).toBe(false);
});
