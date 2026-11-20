// @subject packages/client/src/features/preset/components/readout/readout-parts.tsx
// The Presets readout tags a guessed output cap as estimated like the guessed window, leaves a stated one untagged, and
// with no model set for chat says so plainly with a door to Connections instead of a Retry.

import { routeAuthConfig, routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";
import type { Locator, Page, PlaywrightTestArgs } from "@playwright/test";
import {
  PRESET_ESTIMATED_LIMIT_SUFFIX,
  PRESET_NO_CHAT_MODEL_TITLE,
  PRESET_OPEN_CONNECTIONS_NAME,
  PRESET_READOUT_OUTPUT_CAP_LABEL,
} from "#client/features/preset/lib/preset-names.ts";
import { DIALOG_VERBS } from "#client/lib/dialog-verbs.ts";
import type { PresetReadoutStory } from "./_preset-readout-stories.tsx";

const STORY = "tests/client/features/preset/components/_preset-readout-stories/PresetReadoutStory";
const READOUT_READS = [
  ...SECTION_PROCEDURES,
  ...SHELL_MOUNT_PROCEDURES,
  "preset.listUsage",
  "preset.resolveEffective",
  "connection.resolveChatCapability",
  "connection.providersAvailable",
  "connection.list",
] as const;
// What a model states once its limits are known.
const STATED = { window: 1_000_000, output: 32_768 } as const;
type Root = ServerTestHarness;

test.use({ viewport: { width: 1280, height: 900 } });

async function openReadout(page: Page, mount: PlaywrightTestArgs["mount"], root: Root, stated: typeof STATED | null | "unbound"): Promise<void> {
  const caller = await root.internalCallerFor(root.ownerId);
  if (stated !== "unbound") {
    const connection = await caller.connection.create({
      providerId: "custom-openai",
      credentialId: null,
      baseUrl: "http://127.0.0.1:8080/v1",
      model: "witness-model",
      label: "Witness server",
      declared: {
        kind: "generation",
        features: { detectServer: false },
        ...(stated === null ? {} : { generation: { context: { window: stated.window }, output: { maxTokens: { min: 1, max: stated.output } } } }),
      },
    });
    await caller.connection.setBinding({ task: "chat", connectionId: connection.id });
  }
  const preset = await caller.preset.create({ name: "Readout limits", kind: "generation" });
  await routeAuthConfig(page, await (await root.http.request("/api/auth/config")).text());
  await routeTrpc(page, serveCorpusProcedures(caller, READOUT_READS));
  await mount<typeof PresetReadoutStory>(STORY, { presetId: preset.id, view: "params", chatId: null });
}

function outputCapRow(page: Page): Locator {
  return page.getByText(PRESET_READOUT_OUTPUT_CAP_LABEL, { exact: true }).locator("..");
}

test("a guessed output cap is tagged estimated", async ({ mount, page }) => {
  await using root = await createServerHarness({ startJobs: false });
  await openReadout(page, mount, root, null);
  await expect(outputCapRow(page).getByText(PRESET_ESTIMATED_LIMIT_SUFFIX, { exact: true })).toBeVisible();
});

test("a stated output cap carries no estimate tag", async ({ mount, page }) => {
  await using root = await createServerHarness({ startJobs: false });
  await openReadout(page, mount, root, STATED);
  await expect(outputCapRow(page)).toBeVisible();
  await expect(outputCapRow(page).getByText(PRESET_ESTIMATED_LIMIT_SUFFIX, { exact: true })).toHaveCount(0);
});

test("with no model set for chat, the readout says so with a door to Connections and no Retry", async ({ mount, page }) => {
  await using root = await createServerHarness({ startJobs: false });
  await openReadout(page, mount, root, "unbound");
  const state = page.locator('[data-slot="notice"]').filter({ hasText: PRESET_NO_CHAT_MODEL_TITLE });
  await expect(state).toHaveCount(1);
  await expect(state.getByRole("button", { name: PRESET_OPEN_CONNECTIONS_NAME, exact: true })).toBeVisible();
  await expect(state.getByRole("button", { name: DIALOG_VERBS.retry, exact: true })).toHaveCount(0);
});
