// @subject packages/ui/src/primitives/sortable/variants.ts
// The Params deck's sampler order at 200% text on a phone: each row's stacked grip sits nearer its own row than the row above it.

import { boxOf, setRootFontScale } from "@orb/testkit/browser/spec";
import { channelName, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createServerHarness } from "@orb/testkit/node/composed";
import { PRESET_EDITOR_VIEW_LABELS } from "#client/features/preset/lib/preset-names.ts";
import { SAMPLING_FLAG_LABELS } from "#client/features/preset/lib/sampling-knob-catalog.ts";
import type { PresetListLifetimeStory } from "./_list-lifetime-stories.tsx";

const STORY = "tests/client/features/preset/components/_list-lifetime-stories/PresetListLifetimeStory";
const PROCEDURES = [
  "settings.getUserSettings",
  "sessions.me",
  "preset.get",
  "preset.update",
  "preset.list",
  "preset.resolveEffective",
  "connection.resolveChatCapability",
  "connection.providersAvailable",
  "connection.list",
  "connection.tokenizeWords",
] as const;
// A provider whose server orders its sampler stages, so the deck shows the list.
const PROVIDER = "llama-cpp";
const TEXT_SCALE = 2;
const PAIRS_CHECKED = 2;

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

test("at 200% text on a phone each sampler-order grip is nearer its own row than the row above", async ({ mount, page }) => {
  await using root = await createServerHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const preset = await caller.preset.create({ name: "Sampler order witness", kind: "generation" });
  const connection = await caller.connection.create({
    providerId: PROVIDER,
    credentialId: null,
    label: "Sampler order server",
    model: "witness-model",
    baseUrl: "http://127.0.0.1:8080",
  });
  await caller.connection.useForEverything({ connectionId: connection.id });
  await routeTrpc(page, serveCorpusProcedures(caller, PROCEDURES));
  await mount<typeof PresetListLifetimeStory>(STORY, { presetId: preset.id });
  await page.getByRole("tab", { name: PRESET_EDITOR_VIEW_LABELS.params, exact: true }).click();
  await setRootFontScale(page, channelName("fontScale"), TEXT_SCALE);
  const list = page.getByRole("list", { name: SAMPLING_FLAG_LABELS.samplerOrder, exact: true });
  const items = list.locator('[data-slot="sortable-item"]');
  await expect(items.nth(PAIRS_CHECKED)).toBeVisible();
  for (let at = 1; at <= PAIRS_CHECKED; at += 1) {
    const item = items.nth(at);
    await item.scrollIntoViewIfNeeded();
    const [above, grip, content] = await Promise.all([
      boxOf(items.nth(at - 1)),
      boxOf(item.locator('[data-slot="sortable-handle"]')),
      boxOf(item.locator('[data-slot="sortable-content"]')),
    ]);
    expect(content.y - (grip.y + grip.height)).toBeLessThan(grip.y - (above.y + above.height));
  }
});
