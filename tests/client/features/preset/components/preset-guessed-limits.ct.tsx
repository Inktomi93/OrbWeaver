// @subject packages/client/src/features/preset/components/params-limits.tsx
// The Params deck's two token caps against the chat connection's limits. Each limit names where it comes from (the server
// reported it, the user overrode it, or nobody stated it and it is a guess) beside a door to that connection's limit
// settings. A reported or overridden ceiling is a hard cap on what is typed; a guessed one is passed with a warning. A
// blank row names what it falls to, and a thinking model says its Max output covers the thinking too.

import { CONNECTIONS_LIST_ADDRESS } from "@orb/client/lib";
import type { DeclaredCapability, GenerationCapability, LimitSource } from "@orb/contracts/inference";
import { BUILTIN_PROVIDERS, LIMIT_SOURCES, outputLimitSource } from "@orb/contracts/inference";
import { DEFAULT_MAX_OUTPUT_TOKENS, tryImportStChatCompletionPreset } from "@orb/contracts/preset";
import type { PresetId, UserConnectionId } from "@orb/kit/ids";
import { groupThousands } from "@orb/kit/strings";
import { windowInputRoom } from "@orb/kit/tokens";
import { setRootFontScale } from "@orb/testkit/browser/spec";
import type { TrpcRecorder } from "@orb/testkit/ct";
import { absenceWindow, channelName, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { PUBLIC_PEER_ADDRESS } from "@orb/testkit/iso";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";
import type { Locator, Page, PlaywrightTestArgs } from "@playwright/test";
import {
  PRESET_CONTEXT_LIMIT_NAME,
  PRESET_EDITOR_VIEW_LABELS,
  PRESET_MAX_CONTEXT_LABEL,
  PRESET_MAX_OUTPUT_LABEL,
  PRESET_OUTPUT_COVERS_THINKING_NOTE,
  PRESET_OUTPUT_LIMIT_NAME,
  PRESET_VERBATIM_TAIL_LABEL,
  presetBlankContextNote,
  presetBlankOutputNote,
  presetCappedOnConnectionNote,
  presetFillsGuessedWindowNote,
  presetHeldToWindowNote,
  presetLimitDoorName,
  presetLimitSourceLine,
  presetMaxContextHint,
  presetMaxOutputHint,
  presetPastGuessNote,
  presetPastGuessValueText,
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
// NanoGPT states each model's limits only in its detailed list: a listed model reports them, and one the list leaves null
// states none, so its limits are the floor's guess.
const PROVIDER = "nanogpt";
const KEY = "synthetic-nanogpt-key-never-returned";
const REPORTED_MODEL = "vendor/reports-its-limits";
const THINKING_MODEL = "vendor/reports-and-thinks";
const WINDOW_ONLY_MODEL = "vendor/reports-its-window-only";
const UNREPORTED_MODEL = "vendor/states-no-limits";
const REPORTED = { window: 262_144, output: 32_768 } as const;
// A server that reports a window and no output cap, as a local one does: a reply may take half of that window.
const WINDOW_ONLY = { window: 32_768, heldTo: 16_384 } as const;
const NANOGPT_LIST = {
  object: "list",
  data: [
    { id: REPORTED_MODEL, object: "model", ["context_length"]: REPORTED.window, ["max_output_tokens"]: REPORTED.output },
    {
      id: THINKING_MODEL,
      object: "model",
      ["context_length"]: REPORTED.window,
      ["max_output_tokens"]: REPORTED.output,
      capabilities: { reasoning: true },
    },
    { id: WINDOW_ONLY_MODEL, object: "model", ["context_length"]: WINDOW_ONLY.window, ["max_output_tokens"]: null },
    { id: UNREPORTED_MODEL, object: "model", ["context_length"]: null, ["max_output_tokens"]: null },
  ],
};
// What a user declares for a model whose server states nothing.
const OVERRIDE = { window: 65_536, output: 16_384 } as const;
// A declared max output below the app's own default, so a blank row sends the model's cap.
const LOW_CAP = 1024;
// A value for a field outside the two limits, typed into the deck.
const EDITED_TAIL = 7;
// What the imported SillyTavern preset asks for: both above the guess.
const IMPORTED = { context: 128_000, output: 29_828 } as const;
// What another model's preset asks for: both above the reported ceilings.
// A preset that sets its own window, far past the guess, with a reply that leaves history room inside it.
const OWN_WINDOW = { context: 32_768, output: 10_000 } as const;
const BEYOND_REPORTED = { context: 300_000, output: 40_000 } as const;
// What a user types into Max output: above the guess and the reported ceiling.
const TYPED_OUTPUT = 40_000;
// Long enough for the editor's autosave to have written anything it would write.
const PAST_AUTOSAVE_MS = DEFAULT_DEBOUNCE_MS * 3;
const PHONE = { width: 390, height: 844 } as const;
const FONT_SCALES = [2, 3] as const;
// The larger text a phone user sets that grows the header band past a third of the pane.
const LARGER_TEXT = 1.25;
type Caller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;

// A local Ollama whose `/api/show` states a trained maximum: its native chat route sends the window with each request.
const OLLAMA_ORIGIN = "http://127.0.0.1:11434";
const OLLAMA_MODEL = "witness:7b";
const OLLAMA_TRAINED = 131_072;
const OLLAMA_SHOW = { ["model_info"]: { ["general.architecture"]: "llama", ["llama.context_length"]: OLLAMA_TRAINED }, capabilities: ["completion"] };

/** The list NanoGPT's models route answers, and the native routes a local Ollama answers; the other lists (embedding,
 *  rerank) answer empty. */
const nanoGptHost: typeof fetch = (input, init) => {
  const request = new Request(input, init);
  const url = new URL(request.url);
  if (url.origin === OLLAMA_ORIGIN) {
    if (url.pathname === "/api/show") {
      return Promise.resolve(Response.json(OLLAMA_SHOW));
    }
    if (url.pathname === "/api/ps") {
      return Promise.resolve(Response.json({ models: [] }));
    }
    if (url.pathname === "/api/version") {
      return Promise.resolve(Response.json({ version: "0.12.0" }));
    }
    return Promise.resolve(Response.json({ data: [{ id: OLLAMA_MODEL }] }));
  }
  return Promise.resolve(Response.json(url.pathname.endsWith("/models") ? NANOGPT_LIST : { object: "list", data: [] }));
};

/** NanoGPT's own host resolves to a public address; any other lookup is a defect in the case. */
function resolveHost(hostname: string): Promise<string[]> {
  const base = BUILTIN_PROVIDERS.find((provider) => provider.id === PROVIDER)?.baseUrl;
  if (base !== undefined && new URL(base).hostname === hostname) {
    return Promise.resolve([PUBLIC_PEER_ADDRESS]);
  }
  return Promise.reject(new Error(`Unscripted address: ${hostname}`));
}

function freshRoot(): Promise<ServerTestHarness> {
  return createServerHarness({
    startJobs: false,
    providerFetch: nanoGptHost,
    networkExecution: { fetch: nanoGptHost, resolver: resolveHost },
    secretBoxKey: Buffer.alloc(32, 23),
  });
}

/** One way a limit's source comes about: which model, and what the user declared over it. */
interface Scenario {
  readonly model: string;
  readonly declared?: DeclaredCapability;
}

/** Every source, exhaustive by type: a new member fails `tsc` until it names how a chat connection comes by it. */
const SCENARIOS: Readonly<Record<LimitSource, Scenario>> = {
  reported: { model: REPORTED_MODEL },
  override: {
    model: UNREPORTED_MODEL,
    declared: { kind: "generation", generation: { context: { window: OVERRIDE.window }, output: { maxTokens: { min: 1, max: OVERRIDE.output } } } },
  },
  guessed: { model: UNREPORTED_MODEL },
};

/** A NanoGPT chat connection for the scenario, made the chat role's connection. */
async function chatConnection(caller: Caller, scenario: Scenario): Promise<{ readonly id: UserConnectionId; readonly capability: GenerationCapability }> {
  const credential = await caller.credentials.add({ provider: PROVIDER, key: KEY });
  const connection = await caller.connection.create({
    providerId: PROVIDER,
    credentialId: credential.id,
    baseUrl: null,
    model: scenario.model,
    label: "Witness server",
    ...(scenario.declared === undefined ? {} : { declared: scenario.declared }),
  });
  await caller.connection.setBinding({ task: "chat", connectionId: connection.id });
  const resolved = await caller.connection.resolveChatCapability();
  if (resolved.capability.kind !== "generation") {
    throw new Error("The chat role resolved a connection that is not a generation model");
  }
  return { id: connection.id, capability: resolved.capability.generation };
}

/** A preset the way the import dialog lands a SillyTavern file: the shared mapper, then `preset.create`. */
async function importedPreset(caller: Caller, asks: { readonly context: number; readonly output: number }): Promise<PresetId> {
  const outcome = tryImportStChatCompletionPreset({
    ["openai_max_context"]: asks.context,
    ["openai_max_tokens"]: asks.output,
    temperature: 1,
    prompts: [{ identifier: "main", name: "Main Prompt", role: "system", content: "Write the next reply." }],
  });
  if (!outcome.ok) {
    throw new Error(`The SillyTavern preset was refused: ${JSON.stringify(outcome)}`);
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

function outputLine(capability: GenerationCapability, source: LimitSource): string {
  return presetLimitSourceLine(PRESET_OUTPUT_LIMIT_NAME, groupThousands(capability.output.maxTokens.max), source);
}

function contextLine(capability: GenerationCapability, source: LimitSource): string {
  return presetLimitSourceLine(PRESET_CONTEXT_LIMIT_NAME, groupThousands(capability.context.window), source);
}

for (const source of LIMIT_SOURCES) {
  test(`a ${source} limit says so on both rows, and each door asks for that connection's limit settings`, async ({ mount, page }) => {
    await using root = await freshRoot();
    const caller = await root.internalCallerFor(root.ownerId);
    const { id, capability } = await chatConnection(caller, SCENARIOS[source]);
    const preset = await caller.preset.create({ name: "Limit sources", kind: "generation" });
    await mountDeck(page, mount, preset.id, caller);

    await expect(page.getByText(outputLine(capability, source), { exact: true })).toBeVisible();
    await expect(page.getByText(contextLine(capability, source), { exact: true })).toBeVisible();
    const outputDoor = page.getByRole("button", { name: presetLimitDoorName(PRESET_OUTPUT_LIMIT_NAME, source), exact: true });
    await expect(page.getByRole("status", { name: GUESSED_LIMITS_PROBE.editor })).toHaveText("");
    await outputDoor.click();
    await expect(page.getByRole("status", { name: GUESSED_LIMITS_PROBE.group })).toHaveText(CONNECTIONS_LIST_ADDRESS.group);
    await expect(page.getByRole("status", { name: GUESSED_LIMITS_PROBE.editor })).toHaveText(`${id} true max-output`);
    await expect(page.getByRole("button", { name: presetLimitDoorName(PRESET_CONTEXT_LIMIT_NAME, source), exact: true })).toBeVisible();
  });
}

test("a guessed ceiling says it is a guess in both hints", async ({ mount, page }) => {
  await using root = await freshRoot();
  const caller = await root.internalCallerFor(root.ownerId);
  const { capability } = await chatConnection(caller, SCENARIOS.guessed);
  const preset = await caller.preset.create({ name: "Guessed limits", kind: "generation" });
  await mountDeck(page, mount, preset.id, caller);

  await expect(hintOf(page, PRESET_MAX_OUTPUT_LABEL)).toHaveAccessibleDescription(presetMaxOutputHint(groupThousands(capability.output.maxTokens.max), true));
  const window = capability.context.window;
  const reply = Math.min(DEFAULT_MAX_OUTPUT_TOKENS, capability.output.maxTokens.max);
  await expect(hintOf(page, PRESET_MAX_CONTEXT_LABEL)).toHaveAccessibleDescription(
    presetMaxContextHint(groupThousands(window), groupThousands(windowInputRoom(window, reply)), true),
  );
});

test("a Max context hint counts the room against the window the preset itself sets, not the guess", async ({ mount, page }) => {
  await using root = await freshRoot();
  const caller = await root.internalCallerFor(root.ownerId);
  const { capability } = await chatConnection(caller, SCENARIOS.guessed);
  const guess = capability.context.window;
  expect(guess).toBeLessThan(OWN_WINDOW.context);
  const presetId = await importedPreset(caller, OWN_WINDOW);
  await mountDeck(page, mount, presetId, caller);

  await expect(hintOf(page, PRESET_MAX_CONTEXT_LABEL)).toHaveAccessibleDescription(
    presetMaxContextHint(groupThousands(guess), groupThousands(windowInputRoom(OWN_WINDOW.context, OWN_WINDOW.output)), true),
  );
});

test("a slider parked at a guess announces the saved value past it", async ({ mount, page }) => {
  await using root = await freshRoot();
  const caller = await root.internalCallerFor(root.ownerId);
  const { capability } = await chatConnection(caller, SCENARIOS.guessed);
  const presetId = await importedPreset(caller, IMPORTED);
  await mountDeck(page, mount, presetId, caller);

  await expect(page.getByRole("slider", { name: PRESET_MAX_OUTPUT_LABEL, exact: true })).toHaveAttribute(
    "aria-valuetext",
    presetPastGuessValueText(groupThousands(IMPORTED.output), groupThousands(capability.output.maxTokens.max)),
  );
  await expect(page.getByRole("slider", { name: PRESET_MAX_CONTEXT_LABEL, exact: true })).toHaveAttribute(
    "aria-valuetext",
    presetPastGuessValueText(groupThousands(IMPORTED.context), groupThousands(capability.context.window)),
  );
});

test("the past-guess note wears the warning tone and the reported-cap note does not", async ({ mount, page }) => {
  await using root = await freshRoot();
  const caller = await root.internalCallerFor(root.ownerId);
  const guessed = await chatConnection(caller, SCENARIOS.guessed);
  const presetId = await importedPreset(caller, IMPORTED);
  await mountDeck(page, mount, presetId, caller);
  const note = presetPastGuessNote(groupThousands(IMPORTED.output), groupThousands(guessed.capability.output.maxTokens.max));

  await expect(page.getByText(note, { exact: true })).toHaveAttribute("data-tone", "warning");
});

test("a reported cap's note stays in the neutral tone", async ({ mount, page }) => {
  await using root = await freshRoot();
  const caller = await root.internalCallerFor(root.ownerId);
  const { capability } = await chatConnection(caller, SCENARIOS.reported);
  const presetId = await importedPreset(caller, BEYOND_REPORTED);
  await mountDeck(page, mount, presetId, caller);
  const note = presetCappedOnConnectionNote(groupThousands(BEYOND_REPORTED.output), groupThousands(capability.output.maxTokens.max));

  await expect(page.getByText(note, { exact: true })).toBeVisible();
  await expect(page.getByText(note, { exact: true })).not.toHaveAttribute("data-tone", "warning");
});

test("a reported ceiling keeps the model's own hint and says nothing of a guess", async ({ mount, page }) => {
  await using root = await freshRoot();
  const caller = await root.internalCallerFor(root.ownerId);
  const { capability } = await chatConnection(caller, SCENARIOS.reported);
  expect(capability.output.maxTokens.max).toBe(REPORTED.output);
  const preset = await caller.preset.create({ name: "Reported limits", kind: "generation" });
  await mountDeck(page, mount, preset.id, caller);

  await expect(hintOf(page, PRESET_MAX_OUTPUT_LABEL)).toHaveAccessibleDescription(presetMaxOutputHint(groupThousands(REPORTED.output), false));
  await expect(page.getByText(outputLine(capability, "reported"), { exact: true })).toBeVisible();
  await expect(page.getByText(outputLine(capability, "guessed"), { exact: true })).toHaveCount(0);
});

test("a blank Max output names the app default it sends, after the connection's own cap is raised past it", async ({ mount, page }) => {
  await using root = await freshRoot();
  const caller = await root.internalCallerFor(root.ownerId);
  const { capability } = await chatConnection(caller, SCENARIOS.reported);
  expect(capability.output.maxTokens.max).toBeGreaterThan(DEFAULT_MAX_OUTPUT_TOKENS);
  const preset = await caller.preset.create({ name: "Blank output", kind: "generation" });
  await mountDeck(page, mount, preset.id, caller);

  const appDefault = groupThousands(DEFAULT_MAX_OUTPUT_TOKENS);
  await expect(page.getByText(presetBlankOutputNote(appDefault, appDefault), { exact: true })).toBeVisible();
  await expect(valueBox(page, PRESET_MAX_OUTPUT_LABEL)).toHaveAttribute("placeholder", String(DEFAULT_MAX_OUTPUT_TOKENS));
  // The request sends that default itself, so a screen reader hears the number as the default, not as the model's pick.
  const rail = page.getByRole("slider", { name: PRESET_MAX_OUTPUT_LABEL, exact: true });
  await expect(rail).toHaveAttribute("aria-valuetext", `${String(DEFAULT_MAX_OUTPUT_TOKENS)}: default`);
});

test("a blank Max output under a cap below the app default names the cap it sends", async ({ mount, page }) => {
  await using root = await freshRoot();
  const caller = await root.internalCallerFor(root.ownerId);
  const scenario: Scenario = {
    model: UNREPORTED_MODEL,
    declared: { kind: "generation", generation: { context: { window: OVERRIDE.window }, output: { maxTokens: { min: 1, max: LOW_CAP } } } },
  };
  const { capability } = await chatConnection(caller, scenario);
  expect(capability.output.maxTokens.max).toBeLessThan(DEFAULT_MAX_OUTPUT_TOKENS);
  const preset = await caller.preset.create({ name: "Low cap", kind: "generation" });
  await mountDeck(page, mount, preset.id, caller);

  await expect(page.getByText(presetBlankOutputNote(groupThousands(LOW_CAP), groupThousands(DEFAULT_MAX_OUTPUT_TOKENS)), { exact: true })).toBeVisible();
});

for (const source of LIMIT_SOURCES) {
  test(`a blank Max context names what the history is trimmed to when its window is ${source}`, async ({ mount, page }) => {
    await using root = await freshRoot();
    const caller = await root.internalCallerFor(root.ownerId);
    const { capability } = await chatConnection(caller, SCENARIOS[source]);
    const preset = await caller.preset.create({ name: "Blank context", kind: "generation" });
    await mountDeck(page, mount, preset.id, caller);

    await expect(page.getByText(presetBlankContextNote(groupThousands(capability.context.window), source, false), { exact: true })).toBeVisible();
  });
}

test("a model that thinks says its Max output covers the thinking and the reply", async ({ mount, page }) => {
  await using root = await freshRoot();
  const caller = await root.internalCallerFor(root.ownerId);
  const { capability } = await chatConnection(caller, { model: THINKING_MODEL });
  expect(capability.reasoning.enabled).toBe(true);
  const preset = await caller.preset.create({ name: "Thinking model", kind: "generation" });
  await mountDeck(page, mount, preset.id, caller);

  await expect(page.getByText(PRESET_OUTPUT_COVERS_THINKING_NOTE, { exact: true })).toBeVisible();
});

test("a model that does not think draws no such line beside its other limit lines", async ({ mount, page }) => {
  await using root = await freshRoot();
  const caller = await root.internalCallerFor(root.ownerId);
  const { capability } = await chatConnection(caller, SCENARIOS.reported);
  expect(capability.reasoning.enabled).toBe(false);
  const preset = await caller.preset.create({ name: "Plain model", kind: "generation" });
  await mountDeck(page, mount, preset.id, caller);

  await expect(page.getByText(outputLine(capability, "reported"), { exact: true })).toBeVisible();
  await expect(page.getByText(PRESET_OUTPUT_COVERS_THINKING_NOTE, { exact: true })).toHaveCount(0);
});

test("editing another field of an imported preset over the guess saves that field and leaves both stored limits as they were", async ({ mount, page }) => {
  await using root = await freshRoot();
  const caller = await root.internalCallerFor(root.ownerId);
  await chatConnection(caller, SCENARIOS.guessed);
  const presetId = await importedPreset(caller, IMPORTED);
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

test("an imported preset over a guessed ceiling keeps its stored values, and each row warns that it passes the guess", async ({ mount, page }) => {
  await using root = await freshRoot();
  const caller = await root.internalCallerFor(root.ownerId);
  const { capability } = await chatConnection(caller, SCENARIOS.guessed);
  const presetId = await importedPreset(caller, IMPORTED);
  const calls = await mountDeck(page, mount, presetId, caller);

  await expect(
    page.getByText(presetPastGuessNote(groupThousands(IMPORTED.output), groupThousands(capability.output.maxTokens.max)), { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(presetPastGuessNote(groupThousands(IMPORTED.context), groupThousands(capability.context.window)), { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: presetLimitDoorName(PRESET_OUTPUT_LIMIT_NAME, "guessed"), exact: true })).toBeVisible();
  await absenceWindow(page, PAST_AUTOSAVE_MS);
  expect(calls.count("preset.update")).toBe(0);
  const stored = await caller.preset.get({ id: presetId });
  expect(stored.config.params).toMatchObject({ maxOutputTokens: IMPORTED.output, maxContextTokens: IMPORTED.context });
});

test("a preset over a reported ceiling keeps its stored values, and each row says the connection's limit caps it", async ({ mount, page }) => {
  await using root = await freshRoot();
  const caller = await root.internalCallerFor(root.ownerId);
  const { capability } = await chatConnection(caller, SCENARIOS.reported);
  const presetId = await importedPreset(caller, BEYOND_REPORTED);
  const calls = await mountDeck(page, mount, presetId, caller);

  await expect(
    page.getByText(presetCappedOnConnectionNote(groupThousands(BEYOND_REPORTED.output), groupThousands(capability.output.maxTokens.max)), { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(presetCappedOnConnectionNote(groupThousands(BEYOND_REPORTED.context), groupThousands(capability.context.window)), { exact: true }),
  ).toBeVisible();
  await absenceWindow(page, PAST_AUTOSAVE_MS);
  expect(calls.count("preset.update")).toBe(0);
  const stored = await caller.preset.get({ id: presetId });
  expect(stored.config.params).toMatchObject({ maxOutputTokens: BEYOND_REPORTED.output, maxContextTokens: BEYOND_REPORTED.context });
});

test("a Max output typed above a guessed ceiling is stored as typed, survives a fresh open, and the row warns that it passes the guess", async ({
  mount,
  page,
}) => {
  await using root = await freshRoot();
  const caller = await root.internalCallerFor(root.ownerId);
  const { capability } = await chatConnection(caller, SCENARIOS.guessed);
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
  await expect(page.getByText(presetPastGuessNote(groupThousands(TYPED_OUTPUT), groupThousands(ceiling)), { exact: true })).toBeVisible();
  await expect(page.getByRole("slider", { name: PRESET_MAX_OUTPUT_LABEL, exact: true })).toHaveAttribute("aria-valuenow", String(ceiling));
});

test("a reply ask over a guessed max output beside a reported window says the window holds it", async ({ mount, page }) => {
  await using root = await freshRoot();
  const caller = await root.internalCallerFor(root.ownerId);
  const { capability } = await chatConnection(caller, { model: WINDOW_ONLY_MODEL });
  expect(capability.context.window).toBe(WINDOW_ONLY.window);
  const presetId = await importedPreset(caller, IMPORTED);
  await mountDeck(page, mount, presetId, caller);

  const held = presetHeldToWindowNote(groupThousands(IMPORTED.output), groupThousands(WINDOW_ONLY.heldTo), groupThousands(WINDOW_ONLY.window));
  await expect(page.getByText(held, { exact: true })).toBeVisible();
  await expect(page.getByText(outputLine(capability, "guessed"), { exact: true })).toBeVisible();
  // The one note states the clamp, as the Max output row's own description rather than a line apart from it.
  await expect(page.getByRole("slider", { name: PRESET_MAX_OUTPUT_LABEL, exact: true })).toHaveAccessibleDescription(held);
  // The row's own note stays quiet: it would say the guess passes, which the window does not allow.
  await expect(
    page.getByText(presetPastGuessNote(groupThousands(IMPORTED.output), groupThousands(capability.output.maxTokens.max)), { exact: true }),
  ).toHaveCount(0);
});

test("a reply ask as large as a guessed window says only the newest message is sent", async ({ mount, page }) => {
  await using root = await freshRoot();
  const caller = await root.internalCallerFor(root.ownerId);
  const { capability } = await chatConnection(caller, SCENARIOS.guessed);
  const preset = await caller.preset.create({ name: "Reply fills the guess", kind: "generation" });
  await mountDeck(page, mount, preset.id, caller);
  const box = valueBox(page, PRESET_MAX_OUTPUT_LABEL);
  await box.fill(String(TYPED_OUTPUT));
  await box.blur();

  await expect(
    page.getByText(presetFillsGuessedWindowNote(groupThousands(TYPED_OUTPUT), groupThousands(capability.context.window)), { exact: true }),
  ).toBeVisible();
});

test("a Max output typed above a reported ceiling stops at it", async ({ mount, page }) => {
  await using root = await freshRoot();
  const caller = await root.internalCallerFor(root.ownerId);
  const { capability } = await chatConnection(caller, SCENARIOS.reported);
  const ceiling = capability.output.maxTokens.max;
  expect(ceiling).toBeLessThan(TYPED_OUTPUT);
  const preset = await caller.preset.create({ name: "Typed past the reported cap", kind: "generation" });
  await mountDeck(page, mount, preset.id, caller);
  const box = valueBox(page, PRESET_MAX_OUTPUT_LABEL);
  await box.fill(String(TYPED_OUTPUT));
  await box.blur();
  await expect(box).toHaveValue(String(ceiling));
  await expect.poll(async () => (await caller.preset.get({ id: preset.id })).config.params.maxOutputTokens).toBe(ceiling);
});

test.describe("phone at enlarged text", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: PHONE });
  for (const factor of FONT_SCALES) {
    test(`at ${String(factor * 100)}% text the guess lines stay readable and the door stays pressable`, async ({ mount, page }) => {
      await using root = await freshRoot();
      const caller = await root.internalCallerFor(root.ownerId);
      const { capability } = await chatConnection(caller, SCENARIOS.guessed);
      const presetId = await importedPreset(caller, IMPORTED);
      await mountDeck(page, mount, presetId, caller);
      await setRootFontScale(page, channelName("fontScale"), factor);

      for (const line of [
        page.getByText(outputLine(capability, "guessed"), { exact: true }),
        page.getByText(contextLine(capability, "guessed"), { exact: true }),
        page.getByText(presetPastGuessNote(groupThousands(IMPORTED.output), groupThousands(capability.output.maxTokens.max)), { exact: true }),
        page.getByText(presetPastGuessNote(groupThousands(IMPORTED.context), groupThousands(capability.context.window)), { exact: true }),
      ]) {
        await line.scrollIntoViewIfNeeded();
        await expectWithinPhone(line);
      }
      const door = page.getByRole("button", { name: presetLimitDoorName(PRESET_OUTPUT_LIMIT_NAME, "guessed"), exact: true });
      await door.scrollIntoViewIfNeeded();
      await expectWithinPhone(door);
      await expect(door).toBeEnabled();
      await door.click({ trial: true });
    });
  }
});

test.describe("phone at larger text", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: PHONE });
  test("the editor's header band stops pinning once it takes more than its share, so the Output rows keep the pane", async ({ mount, page }) => {
    await using root = await freshRoot();
    const caller = await root.internalCallerFor(root.ownerId);
    await chatConnection(caller, SCENARIOS.guessed);
    const presetId = await importedPreset(caller, IMPORTED);
    await mountDeck(page, mount, presetId, caller);
    const band = page.locator('[data-slot="content-pane-band"]');
    await expect.poll(() => band.evaluate((node) => getComputedStyle(node).position)).toBe("sticky");
    await setRootFontScale(page, channelName("fontScale"), LARGER_TEXT);
    await expect.poll(() => band.evaluate((node) => getComputedStyle(node).position)).not.toBe("sticky");
  });
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

test("a route that sends the window hides the context limit door and says the server runs the preset's window", async ({ mount, page }) => {
  await using root = await freshRoot();
  const caller = await root.internalCallerFor(root.ownerId);
  const connection = await caller.connection.create({
    providerId: "ollama",
    credentialId: null,
    baseUrl: `${OLLAMA_ORIGIN}/v1`,
    model: OLLAMA_MODEL,
    label: "Witness Ollama",
  });
  await caller.connection.setBinding({ task: "chat", connectionId: connection.id });
  const resolved = await caller.connection.resolveChatCapability();
  if (resolved.capability.kind !== "generation") {
    throw new Error("The chat role resolved a connection that is not a generation model");
  }
  const capability = resolved.capability.generation;
  // Control: the route is the window-sending one, so the deck's rows below are not the plain-connection arm.
  expect(capability.context.settable).toEqual({ max: OLLAMA_TRAINED });
  const preset = await caller.preset.create({ name: "Sent window", kind: "generation" });
  await mountDeck(page, mount, preset.id, caller);

  await expect(page.getByText(presetBlankContextNote(groupThousands(capability.context.window), "reported", true), { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: presetLimitDoorName(PRESET_CONTEXT_LIMIT_NAME, "reported"), exact: true })).toHaveCount(0);
  // Positive control: the output row still offers its door, so the context row's missing door is the route, not the deck.
  await expect(page.getByRole("button", { name: presetLimitDoorName(PRESET_OUTPUT_LIMIT_NAME, outputLimitSource(capability)), exact: true })).toBeVisible();
});
