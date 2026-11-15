// @subject packages/client/src/features/preset/components/capability-gate.tsx
// An account with no model set for chat opens the preset editor to a plain state, one door to Connections and no
// server sentence, while the clusters that need no model still render; a bound chat model draws no such state.

import { CONNECTIONS_LIST_ADDRESS } from "@orb/client/lib";
import type { PresetId } from "@orb/kit/ids";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";
import type { Locator, Page, PlaywrightTestArgs } from "@playwright/test";
import {
  PRESET_EDITOR_VIEW_LABELS,
  PRESET_NO_CHAT_MODEL_DETAIL,
  PRESET_NO_CHAT_MODEL_TITLE,
  PRESET_OPEN_CONNECTIONS_NAME,
  PRESET_QUALITY_LABEL,
  PRESET_VERBATIM_TAIL_LABEL,
} from "#client/features/preset/lib/preset-names.ts";
import { DIALOG_VERBS } from "#client/lib/dialog-verbs.ts";
import { GUESSED_LIMITS_PROBE } from "./_guessed-limits-probe.ts";
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
type Caller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;

test.use({ viewport: { width: 1280, height: 900 } });

async function openParams(page: Page, mount: PlaywrightTestArgs["mount"], caller: Caller, presetId: PresetId): Promise<void> {
  await routeTrpc(page, serveCorpusProcedures(caller, PROCEDURES));
  await mount<typeof GuessedLimitsPresetStory>(STORY, { presetId });
  await page.getByRole("tab", { name: PRESET_EDITOR_VIEW_LABELS.params, exact: true }).click();
}

function noModelStates(page: Page): Locator {
  return page.locator('[data-slot="notice"]').filter({ hasText: PRESET_NO_CHAT_MODEL_TITLE });
}

test("with no model set for chat, the deck says so plainly with one door to Connections, and the model-free clusters render", async ({ mount, page }) => {
  await using root = await createServerHarness({ startJobs: false });
  const caller = await root.internalCallerFor(root.ownerId);
  // A fresh account holds only the built-in embedder and reranker: no connection serves chat.
  expect((await caller.connection.list()).filter((row) => row.tasks.includes("chat"))).toEqual([]);
  const preset = await caller.preset.create({ name: "No model yet", kind: "generation" });
  await openParams(page, mount, caller, preset.id);

  // One plain state with no Retry, the failure arms' verb; its only words are the title, the detail and the door, so no
  // server sentence reaches it.
  const gate = noModelStates(page);
  await expect(gate).toHaveCount(1);
  await expect(gate.getByRole("button", { name: DIALOG_VERBS.retry, exact: true })).toHaveCount(0);
  await expect(gate).toHaveText(`${PRESET_NO_CHAT_MODEL_TITLE}${PRESET_NO_CHAT_MODEL_DETAIL}${PRESET_OPEN_CONNECTIONS_NAME}`);
  await expect(page.getByText(PRESET_QUALITY_LABEL, { exact: true }).first()).toBeVisible();
  await expect(page.getByLabel(PRESET_VERBATIM_TAIL_LABEL, { exact: true })).toBeVisible();

  await gate.getByRole("button", { name: PRESET_OPEN_CONNECTIONS_NAME, exact: true }).click();
  await expect(page.getByRole("status", { name: GUESSED_LIMITS_PROBE.group })).toHaveText(CONNECTIONS_LIST_ADDRESS.group);
});

test("a model bound for chat draws no no-model state, and the sampling knobs render", async ({ mount, page }) => {
  await using root = await createServerHarness({ startJobs: false });
  const caller = await root.internalCallerFor(root.ownerId);
  const connection = await caller.connection.create({
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: "http://127.0.0.1:8080/v1",
    model: "witness-model",
    label: "Witness server",
    declared: { kind: "generation", features: { detectServer: false } },
  });
  await caller.connection.setBinding({ task: "chat", connectionId: connection.id });
  const preset = await caller.preset.create({ name: "Has a model", kind: "generation" });
  await openParams(page, mount, caller, preset.id);

  await expect(page.getByRole("textbox", { name: "Temperature value", exact: true })).toBeVisible();
  await expect(noModelStates(page)).toHaveCount(0);
});
