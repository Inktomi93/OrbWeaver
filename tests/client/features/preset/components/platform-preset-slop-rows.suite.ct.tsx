// @subject packages/client/src/features/preset/components/params-limits.tsx
// The slop list and strength rows, which only an antislop connection offers, fit a phone width in every engine: neither box
// leaves the viewport, and the page never scrolls sideways.

import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createServerHarness } from "@orb/testkit/node/composed";
import { PRESET_EDITOR_VIEW_LABELS, PRESET_SLOP_LIST_LABEL, PRESET_SLOP_STRENGTH_LABEL } from "#client/features/preset/lib/preset-names.ts";
import type { GuessedLimitsPresetStory } from "./_guessed-limits-stories.tsx";

const STORY = "tests/client/features/preset/components/_guessed-limits-stories/GuessedLimitsPresetStory";
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
] as const;
const PHONE = { width: 390, height: 844 } as const;
const LOCAL_ORIGIN = "http://127.0.0.1:8000";

/** A local server that lists no models: the connection states its own capability. */
const emptyHost: typeof fetch = () => Promise.resolve(Response.json({ object: "list", data: [] }));

test.use({ viewport: PHONE });

test("the slop list and strength stay inside a phone width", async ({ mount, page }) => {
  await using root = await createServerHarness({
    startJobs: false,
    providerFetch: emptyHost,
    networkExecution: { fetch: emptyHost, resolver: () => Promise.reject(new Error("Unscripted address")) },
    secretBoxKey: Buffer.alloc(32, 23),
  });
  const caller = await root.internalCallerFor(root.ownerId);
  const connection = await caller.connection.create({
    providerId: "vllm",
    credentialId: null,
    baseUrl: `${LOCAL_ORIGIN}/v1`,
    model: "witness-model",
    label: "Witness antislop proxy",
    declared: { kind: "generation", features: { detectServer: false, antislop: true } },
  });
  await caller.connection.setBinding({ task: "chat", connectionId: connection.id });
  const preset = await caller.preset.create({ name: "Slop phone", kind: "generation" });
  await routeTrpc(page, serveCorpusProcedures(caller, PROCEDURES));
  await mount<typeof GuessedLimitsPresetStory>(STORY, { presetId: preset.id });
  await page.getByRole("tab", { name: PRESET_EDITOR_VIEW_LABELS.params, exact: true }).click();

  const list = page.getByRole("textbox", { name: PRESET_SLOP_LIST_LABEL, exact: true });
  const strength = page.getByRole("textbox", { name: PRESET_SLOP_STRENGTH_LABEL, exact: true });
  await list.scrollIntoViewIfNeeded();
  await expect(strength).toBeVisible();
  for (const box of [list, strength]) {
    const edges = await box.evaluate((element) => {
      const { left, right } = element.getBoundingClientRect();
      return { left, right, viewport: document.documentElement.clientWidth };
    });
    expect(edges.left).toBeGreaterThanOrEqual(0);
    expect(edges.right).toBeLessThanOrEqual(edges.viewport);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
