// @subject packages/client/src/features/preset/components/params-limits.tsx
// The Params deck's two token caps against the chat connection's limits: a ceiling no tier stated reads as a guess with
// one door to the connection's own settings, a stated one reads as the model's, a blank Max output names the app default
// it sends, and an imported preset's larger values stay stored while their rows say the guess caps them.

import { CONNECTIONS_LIST_ADDRESS } from "@orb/client/lib";
import type { GenerationCapability } from "@orb/contracts/inference";
import { DEFAULT_MAX_OUTPUT_TOKENS, tryImportStChatCompletionPreset } from "@orb/contracts/preset";
import type { PresetId, UserConnectionId } from "@orb/kit/ids";
import { groupThousands } from "@orb/kit/strings";
import { windowInputRoom } from "@orb/kit/tokens";
import { setRootFontScale } from "@orb/testkit/browser/spec";
import type { TrpcRecorder } from "@orb/testkit/ct";
import { absenceWindow, channelName, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";
import type { Locator, Page, PlaywrightTestArgs } from "@playwright/test";
import {
  PRESET_EDITOR_VIEW_LABELS,
  PRESET_MAX_CONTEXT_LABEL,
  PRESET_MAX_OUTPUT_LABEL,
  PRESET_SET_REAL_LIMITS_NAME,
  PRESET_VERBATIM_TAIL_LABEL,
  presetBlankOutputNote,
  presetCappedByGuessNote,
  presetCappedOnConnectionNote,
  presetGuessedLimitsNotice,
  presetMaxContextHint,
  presetMaxOutputHint,
} from "#client/features/preset/lib/preset-names.ts";
import { DEFAULT_DEBOUNCE_MS } from "#client/forms/entity-form-base.ts";

import { hintTriggerName } from "#ui/primitives/hint-trigger/hint-trigger-names.ts";
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
// An OpenAI-compatible server that reports nothing about its model, as a hosted proxy behind Custom OpenAI-compatible does.
const PROVIDER = "custom-openai";
const BASE_URL = "http://127.0.0.1:8080/v1";
// What a model with a one-million-token window states once its limits are known.
const STATED = { window: 1_000_000, output: 32_768 } as const;
// A stated max output below the app's own default, so a blank row sends the model's cap.
const LOW_CAP = 1024;
// A value for a field outside the two limits, typed into the deck.
const EDITED_TAIL = 7;
// What the imported SillyTavern preset asks for: both above the guess.
const IMPORTED = { context: 128_000, output: 29_828 } as const;
// What a user types into Max output: above both the guess and the stated cap below.
const TYPED_OUTPUT = 40_000;
// Long enough for the editor's autosave to have written anything it would write.
const PAST_AUTOSAVE_MS = DEFAULT_DEBOUNCE_MS * 3;
const PHONE = { width: 390, height: 844 } as const;
const FONT_SCALES = [2, 3] as const;
type Caller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;

/** A chat connection on the provider above, stating the given limits or none, made the chat role's connection. */
async function chatConnection(
  caller: Caller,
  stated: { readonly window: number; readonly output: number } | null,
): Promise<{ readonly id: UserConnectionId; readonly capability: GenerationCapability }> {
  const connection = await caller.connection.create({
    providerId: PROVIDER,
    credentialId: null,
    baseUrl: BASE_URL,
    model: "witness-model",
    label: "Witness server",
    declared: {
      kind: "generation",
      features: { detectServer: false },
      ...(stated === null ? {} : { generation: { context: { window: stated.window }, output: { maxTokens: { min: 1, max: stated.output } } } }),
    },
  });
  await caller.connection.setBinding({ task: "chat", connectionId: connection.id });
  const resolved = await caller.connection.resolveChatCapability();
  if (resolved.capability.kind !== "generation") {
    throw new Error("The chat role resolved a connection that is not a generation model");
  }
  return { id: connection.id, capability: resolved.capability.generation };
}

/** The imported preset, the way the import dialog lands a SillyTavern file: the shared mapper, then `preset.create`. */
async function importedPreset(caller: Caller): Promise<PresetId> {
  const outcome = tryImportStChatCompletionPreset({
    ["openai_max_context"]: IMPORTED.context,
    ["openai_max_tokens"]: IMPORTED.output,
    temperature: 1,
    prompts: [{ identifier: "main", name: "Main Prompt", role: "system", content: "Write the next reply." }],
  });
  if (!outcome.ok) {
    throw new Error(`The SillyTavern preset was refused: ${outcome.reason}`);
  }
  const preset = await caller.preset.create({ name: "Imported long-context preset", kind: "generation", config: outcome.result.config });
  return preset.id;
}

async function mountDeck(page: Page, mount: PlaywrightTestArgs["mount"], presetId: PresetId, caller: Caller): Promise<TrpcRecorder> {
  const calls = await routeTrpc(page, serveCorpusProcedures(caller, PROCEDURES));
  await openDeck(page, mount, presetId);
  return calls;
}

/** The editor mounted fresh on the Params view, reading the preset as stored. */
async function openDeck(page: Page, mount: PlaywrightTestArgs["mount"], presetId: PresetId): Promise<() => Promise<void>> {
  const story = await mount<typeof GuessedLimitsPresetStory>(STORY, { presetId });
  await page.getByRole("tab", { name: PRESET_EDITOR_VIEW_LABELS.params, exact: true }).click();
  return () => story.unmount();
}

function valueBox(page: Page, label: string): Locator {
  return page.getByRole("textbox", { name: `${label} value`, exact: true });
}

function hintOf(page: Page, label: string): Locator {
  return page.getByRole("button", { name: hintTriggerName(label), exact: true });
}

function guessedNotice(capability: GenerationCapability): string {
  return presetGuessedLimitsNotice(groupThousands(capability.context.window), groupThousands(capability.output.maxTokens.max));
}

test("a guessed ceiling says it is a guess on both rows, and its one door asks for that connection's limit settings", async ({ mount, page }) => {
  await using root = await createServerHarness({ startJobs: false });
  const caller = await root.internalCallerFor(root.ownerId);
  const { id, capability } = await chatConnection(caller, null);
  expect(capability.context.windowEstimated).toBe(true);
  expect(capability.output.maxTokensEstimated).toBe(true);
  const preset = await caller.preset.create({ name: "Guessed limits", kind: "generation" });
  await mountDeck(page, mount, preset.id, caller);

  await expect(page.getByText(guessedNotice(capability), { exact: true })).toBeVisible();
  await expect(hintOf(page, PRESET_MAX_OUTPUT_LABEL)).toHaveAccessibleDescription(presetMaxOutputHint(groupThousands(capability.output.maxTokens.max), true));
  const window = capability.context.window;
  const reply = Math.min(DEFAULT_MAX_OUTPUT_TOKENS, capability.output.maxTokens.max);
  await expect(hintOf(page, PRESET_MAX_CONTEXT_LABEL)).toHaveAccessibleDescription(
    presetMaxContextHint(groupThousands(window), groupThousands(windowInputRoom(window, reply)), true),
  );
  const door = page.getByRole("button", { name: PRESET_SET_REAL_LIMITS_NAME, exact: true });
  await expect(page.getByRole("status", { name: GUESSED_LIMITS_PROBE.editor })).toHaveText("");
  await door.click();
  await expect(page.getByRole("status", { name: GUESSED_LIMITS_PROBE.group })).toHaveText(CONNECTIONS_LIST_ADDRESS.group);
  await expect(page.getByRole("status", { name: GUESSED_LIMITS_PROBE.editor })).toHaveText(`${id} true`);
});

test("a stated ceiling keeps the model's own hint and draws no guess line or door", async ({ mount, page }) => {
  await using root = await createServerHarness({ startJobs: false });
  const caller = await root.internalCallerFor(root.ownerId);
  const { capability } = await chatConnection(caller, STATED);
  expect(capability.output.maxTokens.max).toBe(STATED.output);
  const preset = await caller.preset.create({ name: "Stated limits", kind: "generation" });
  await mountDeck(page, mount, preset.id, caller);

  await expect(hintOf(page, PRESET_MAX_OUTPUT_LABEL)).toHaveAccessibleDescription(presetMaxOutputHint(groupThousands(STATED.output), false));
  await expect(page.getByRole("button", { name: PRESET_SET_REAL_LIMITS_NAME, exact: true })).toHaveCount(0);
});

test("a blank Max output names the app default it sends, after the connection's own cap is raised past it", async ({ mount, page }) => {
  await using root = await createServerHarness({ startJobs: false });
  const caller = await root.internalCallerFor(root.ownerId);
  const { capability } = await chatConnection(caller, STATED);
  expect(capability.output.maxTokens.max).toBeGreaterThan(DEFAULT_MAX_OUTPUT_TOKENS);
  const preset = await caller.preset.create({ name: "Blank output", kind: "generation" });
  await mountDeck(page, mount, preset.id, caller);

  const appDefault = groupThousands(DEFAULT_MAX_OUTPUT_TOKENS);
  await expect(page.getByText(presetBlankOutputNote(appDefault, appDefault), { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: `${PRESET_MAX_OUTPUT_LABEL} value`, exact: true })).toHaveAttribute(
    "placeholder",
    String(DEFAULT_MAX_OUTPUT_TOKENS),
  );
  // The request sends that default itself, so a screen reader hears the number as the default, not as the model's pick.
  const rail = page.getByRole("slider", { name: PRESET_MAX_OUTPUT_LABEL, exact: true });
  await expect(rail).toHaveAttribute("aria-valuetext", `${String(DEFAULT_MAX_OUTPUT_TOKENS)}: default`);
});

test("a blank Max output under a model cap below the app default names the cap it sends", async ({ mount, page }) => {
  await using root = await createServerHarness({ startJobs: false });
  const caller = await root.internalCallerFor(root.ownerId);
  const { capability } = await chatConnection(caller, { window: STATED.window, output: LOW_CAP });
  expect(capability.output.maxTokens.max).toBeLessThan(DEFAULT_MAX_OUTPUT_TOKENS);
  const preset = await caller.preset.create({ name: "Low cap", kind: "generation" });
  await mountDeck(page, mount, preset.id, caller);

  await expect(page.getByText(presetBlankOutputNote(groupThousands(LOW_CAP), groupThousands(DEFAULT_MAX_OUTPUT_TOKENS)), { exact: true })).toBeVisible();
});

test("editing another field of an imported preset over the guess saves that field and leaves both stored limits as they were", async ({ mount, page }) => {
  await using root = await createServerHarness({ startJobs: false });
  const caller = await root.internalCallerFor(root.ownerId);
  await chatConnection(caller, null);
  const presetId = await importedPreset(caller);
  const calls = await mountDeck(page, mount, presetId, caller);
  const tail = page.getByLabel(PRESET_VERBATIM_TAIL_LABEL, { exact: true });
  await tail.fill(String(EDITED_TAIL));
  // The number field commits its typed value when focus leaves it, as a person tabbing on does.
  await tail.blur();
  await expect.poll(() => calls.count("preset.update")).toBeGreaterThan(0);
  await expect
    .poll(async () => (await caller.preset.get({ id: presetId })).config.params)
    .toMatchObject({ maxOutputTokens: IMPORTED.output, maxContextTokens: IMPORTED.context, compaction: { verbatimTail: EDITED_TAIL } });
});

test("an imported preset over a guessed ceiling keeps its stored values, and each row says the guess caps it", async ({ mount, page }) => {
  await using root = await createServerHarness({ startJobs: false });
  const caller = await root.internalCallerFor(root.ownerId);
  const { capability } = await chatConnection(caller, null);
  const presetId = await importedPreset(caller);
  const calls = await mountDeck(page, mount, presetId, caller);

  await expect(
    page.getByText(presetCappedByGuessNote(groupThousands(IMPORTED.output), groupThousands(capability.output.maxTokens.max)), { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(presetCappedByGuessNote(groupThousands(IMPORTED.context), groupThousands(capability.context.window)), { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: PRESET_SET_REAL_LIMITS_NAME, exact: true })).toBeVisible();
  await absenceWindow(page, PAST_AUTOSAVE_MS);
  expect(calls.count("preset.update")).toBe(0);
  const stored = await caller.preset.get({ id: presetId });
  expect(stored.config.params).toMatchObject({ maxOutputTokens: IMPORTED.output, maxContextTokens: IMPORTED.context });
});

test("a Max output typed above a guessed ceiling is stored as typed, survives a fresh open, and the row says the guess caps it", async ({ mount, page }) => {
  await using root = await createServerHarness({ startJobs: false });
  const caller = await root.internalCallerFor(root.ownerId);
  const { capability } = await chatConnection(caller, null);
  const ceiling = capability.output.maxTokens.max;
  expect(ceiling).toBeLessThan(TYPED_OUTPUT);
  const preset = await caller.preset.create({ name: "Typed past the guess", kind: "generation" });
  await routeTrpc(page, serveCorpusProcedures(caller, PROCEDURES));
  const close = await openDeck(page, mount, preset.id);
  const box = valueBox(page, PRESET_MAX_OUTPUT_LABEL);
  await box.fill(String(TYPED_OUTPUT));
  await box.blur();
  await expect(box).toHaveValue(String(TYPED_OUTPUT));
  await expect.poll(async () => (await caller.preset.get({ id: preset.id })).config.params.maxOutputTokens).toBe(TYPED_OUTPUT);
  await absenceWindow(page, PAST_AUTOSAVE_MS);
  expect((await caller.preset.get({ id: preset.id })).config.params.maxOutputTokens).toBe(TYPED_OUTPUT);

  await close();
  await openDeck(page, mount, preset.id);
  await expect(valueBox(page, PRESET_MAX_OUTPUT_LABEL)).toHaveValue(String(TYPED_OUTPUT));
  await expect(page.getByText(presetCappedByGuessNote(groupThousands(TYPED_OUTPUT), groupThousands(ceiling)), { exact: true })).toBeVisible();
  await expect(page.getByRole("slider", { name: PRESET_MAX_OUTPUT_LABEL, exact: true })).toHaveAttribute("aria-valuenow", String(ceiling));
});

test("a Max output typed above a stated ceiling is stored as typed, and the row says the connection's limit caps it", async ({ mount, page }) => {
  await using root = await createServerHarness({ startJobs: false });
  const caller = await root.internalCallerFor(root.ownerId);
  await chatConnection(caller, STATED);
  expect(STATED.output).toBeLessThan(TYPED_OUTPUT);
  const preset = await caller.preset.create({ name: "Typed past the stated cap", kind: "generation" });
  await mountDeck(page, mount, preset.id, caller);
  const box = valueBox(page, PRESET_MAX_OUTPUT_LABEL);
  await box.fill(String(TYPED_OUTPUT));
  await box.blur();
  await expect.poll(async () => (await caller.preset.get({ id: preset.id })).config.params.maxOutputTokens).toBe(TYPED_OUTPUT);
  await expect(box).toHaveValue(String(TYPED_OUTPUT));
  await expect(page.getByText(presetCappedOnConnectionNote(groupThousands(TYPED_OUTPUT), groupThousands(STATED.output)), { exact: true })).toBeVisible();
});

test.describe("phone at enlarged text", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: PHONE });
  for (const factor of FONT_SCALES) {
    test(`at ${String(factor * 100)}% text the guess lines stay readable and the door stays pressable`, async ({ mount, page }) => {
      await using root = await createServerHarness({ startJobs: false });
      const caller = await root.internalCallerFor(root.ownerId);
      const { capability } = await chatConnection(caller, null);
      const presetId = await importedPreset(caller);
      await mountDeck(page, mount, presetId, caller);
      await setRootFontScale(page, channelName("fontScale"), factor);

      for (const line of [
        page.getByText(guessedNotice(capability), { exact: true }),
        page.getByText(presetCappedByGuessNote(groupThousands(IMPORTED.output), groupThousands(capability.output.maxTokens.max)), { exact: true }),
        page.getByText(presetCappedByGuessNote(groupThousands(IMPORTED.context), groupThousands(capability.context.window)), { exact: true }),
      ]) {
        await line.scrollIntoViewIfNeeded();
        await expectWithinPhone(line);
      }
      const door = page.getByRole("button", { name: PRESET_SET_REAL_LIMITS_NAME, exact: true });
      await door.scrollIntoViewIfNeeded();
      await expectWithinPhone(door);
      await expect(door).toBeEnabled();
      await door.click({ trial: true });
    });
  }
});

/** The box sits inside the phone's width and its words are not cut: it wraps rather than running past its own edge. */
async function expectWithinPhone(subject: Locator): Promise<void> {
  const box = await subject.boundingBox();
  if (box === null) {
    throw new Error("The subject has no box");
  }
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(PHONE.width + 1);
  expect(await subject.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
}
