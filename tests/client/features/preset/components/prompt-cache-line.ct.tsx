// @subject packages/client/src/features/preset/components/prompt-assembly/assembly-rack.tsx
// The Prompt rack names entries that break the prompt cache only for a chat connection that caches prompts, and then in
// one quiet line with a count and a disclosure, so on a phone the first entry is still on the first screen.

import { mintPromptSectionId } from "@orb/contracts/preset";
import type { PresetId } from "@orb/kit/ids";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";
import type { Page, PlaywrightTestArgs } from "@playwright/test";
import { PRESET_CACHE_BUSTERS_SHOW_NAME, PRESET_EDITOR_VIEW_LABELS, presetCacheBustersLine } from "#client/features/preset/lib/preset-names.ts";
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
// A variable read: its value can change between turns, so above Chat History it ends the reusable prefix.
const PER_TURN_TEXT = "The mood is {{getvar::mood}}.";
// The entries the seed rewrites to read the variable.
const BUSTER_NAMES = ["Mood line", "Weather line"] as const;
const PHONE = { width: 390, height: 844 } as const;
type Caller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;

/** A chat connection that caches prompts on its own, or one that states nothing about caching. */
async function chatConnection(caller: Caller, caches: boolean): Promise<void> {
  const connection = await caller.connection.create({
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: "http://127.0.0.1:8080/v1",
    model: "witness-model",
    label: "Witness server",
    declared: {
      kind: "generation",
      features: { detectServer: false },
      ...(caches ? { generation: { turns: { providerImplicitPromptCache: true } } } : {}),
    },
  });
  await caller.connection.setBinding({ task: "chat", connectionId: connection.id });
}

/** A preset whose system entries above Chat History read a per-turn variable, written through the real verb. */
async function bustingPreset(caller: Caller): Promise<PresetId> {
  const preset = await caller.preset.create({ name: "Per-turn above history", kind: "generation" });
  const { config } = await caller.preset.get({ id: preset.id });
  if (!config.sections.some((section) => section.type === "marker" && section.marker === "chat_history")) {
    throw new Error("The starter arrangement has no Chat History marker to sit above");
  }
  const busters = BUSTER_NAMES.map((name, index) => ({
    type: "literal" as const,
    id: mintPromptSectionId(`per-turn-${String(index)}`),
    name,
    role: "system" as const,
    enabled: true,
    content: PER_TURN_TEXT,
  }));
  // At the top of the rack, so they sit above Chat History and the first of them is the rack's first entry.
  await caller.preset.update({ id: preset.id, config: { ...config, sections: [...busters, ...config.sections] } });
  return preset.id;
}

async function openPrompt(page: Page, mount: PlaywrightTestArgs["mount"], caller: Caller, presetId: PresetId): Promise<void> {
  await routeTrpc(page, serveCorpusProcedures(caller, PROCEDURES));
  await mount<typeof GuessedLimitsPresetStory>(STORY, { presetId });
  await page.getByRole("tab", { name: PRESET_EDITOR_VIEW_LABELS.prompt, exact: true }).click();
}

test("on a connection that caches prompts, one line counts the entries and its disclosure names them", async ({ mount, page }) => {
  await using root = await createServerHarness({ startJobs: false });
  const caller = await root.internalCallerFor(root.ownerId);
  await chatConnection(caller, true);
  const id = await bustingPreset(caller);
  await openPrompt(page, mount, caller, id);

  await expect(page.getByText(presetCacheBustersLine(BUSTER_NAMES.length), { exact: true })).toBeVisible();
  const names = page.getByText(BUSTER_NAMES.join(", "), { exact: true });
  await expect(names).toBeHidden();
  await page.getByRole("button", { name: PRESET_CACHE_BUSTERS_SHOW_NAME, exact: true }).click();
  await expect(names).toBeVisible();
});

test("on a connection that states no prompt caching, the rack draws no cache line", async ({ mount, page }) => {
  await using root = await createServerHarness({ startJobs: false });
  const caller = await root.internalCallerFor(root.ownerId);
  await chatConnection(caller, false);
  const id = await bustingPreset(caller);
  await openPrompt(page, mount, caller, id);

  // The seeded entries are in the rack, so the absent line is the caching rule's answer, not an empty rack's.
  await expect(page.getByText(BUSTER_NAMES[0], { exact: true }).first()).toBeVisible();
  await expect(page.getByText(presetCacheBustersLine(BUSTER_NAMES.length), { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: PRESET_CACHE_BUSTERS_SHOW_NAME, exact: true })).toHaveCount(0);
  // No warning of any wording lists the entries.
  await expect(page.getByText(BUSTER_NAMES.join(", "))).toHaveCount(0);
});

test.describe("phone", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: PHONE });
  test("with the cache line drawn, the rack's first entry is on the first screen", async ({ mount, page }) => {
    await using root = await createServerHarness({ startJobs: false });
    const caller = await root.internalCallerFor(root.ownerId);
    await chatConnection(caller, true);
    const id = await bustingPreset(caller);
    await openPrompt(page, mount, caller, id);

    await expect(page.getByText(presetCacheBustersLine(BUSTER_NAMES.length), { exact: true })).toBeVisible();
    await expect(page.getByText(BUSTER_NAMES[0], { exact: true }).first()).toBeInViewport();
  });
});
