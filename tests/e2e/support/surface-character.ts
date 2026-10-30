import { readFile } from "node:fs/promises";
import { CHARACTER_HANDLE_CONFLICT_OP_CODE, CHARACTER_HANDLE_WIRE_KEY, CHARACTER_LIST_SORTS, characterCardV3Schema } from "@orb/contracts/character";
import { THEME_FONT_ALLOWLIST } from "@orb/contracts/theme";
import type { CharacterId, PersonaId, TagId } from "@orb/kit/ids";
import { isPng, readCardChunk } from "@orb/kit/png-card-chunk";
import type { DistributiveOmit } from "@orb/testkit/browser/spec";
import { controlledPanel, markExpectedSurfaceHttpFailure, publishSurfaceInventory } from "@orb/testkit/browser/spec";
import type { SurfaceAuditRequest } from "@orb/testkit/ct";
import type { SurfaceCoverageInventory } from "@orb/testkit/iso";
import { parseSurfaceProviderEvidence, surfaceCoverageKey } from "@orb/testkit/iso";
import { attachNativeFile, isTrpcRequestFor, SURFACE_CHECKS } from "@orb/testkit/node/helpers";
import type { Locator, Page, Route } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { CHARACTER_ACTION_SCOPE_IDS, CHARACTER_ACTIONS, EXPORT_CHARACTER_PATH } from "#client/features/character/lib/character-actions.ts";
import { CHARACTER_CARD_FACETS } from "#client/features/character/lib/character-card-facets.ts";
import { characterCardFormFromDetail, characterUpdateDiff } from "#client/features/character/lib/character-card-form-model.ts";
import { CHARACTERS_SECTION_LABEL } from "#client/features/character/lib/characters-section-label.ts";
import { rowActionsName } from "#client/lib/row-qualifiers.ts";
import { charactersRailButton, waitForAppReady } from "./chat-room.ts";
import type { SurfaceFlow } from "./surface-flow.ts";
import type { HeldTrpcProcedure } from "./trpc.ts";
import { holdTrpcProcedure } from "./trpc.ts";

const LIST = '.shell-panel[data-panel-side="list"]';
const CONTEXT = '.shell-panel[data-panel-side="context"]';
const EDITOR_NAME = "Edit character";
const TABLIST_NAME = "Character";
const UNEXERCISED_ACTIONS = [
  "greeting Rewrite and transform permutations",
  "portrait OS file chooser",
  "character file import",
  "populated Chats projection when the recorded original has no chats",
  "gallery asset mutation",
  "welcome greeter/global preference mutation",
  "embedded-book file restore",
  "source identity/appearance mutation",
] as const;

const ACTION_DISPOSITIONS = {
  openInRefinery: {
    disposition: "skipped",
    reason: "The cross-section session-opening action is not executed by this Character-only itinerary; no model operation is requested.",
  },
  setWelcomeGreeter: { disposition: "excluded", reason: "Changing the account's original welcome preference is outside disposable Character mutations." },
} as const satisfies Readonly<
  Partial<Record<keyof typeof CHARACTER_ACTIONS, Pick<SurfaceCoverageInventory["observations"][number], "disposition" | "reason">>>
>;

const COMMAND_ACTION_IDS = [
  "duplicate",
  "tag",
  "archive",
  "exportCard",
  "convertToPersona",
  "delete",
] as const satisfies readonly (keyof typeof CHARACTER_ACTIONS)[];

/** Independent native scopes prevent a failed read from hiding unrelated editors. */
export const CHARACTER_WALK_AREAS = [
  "library",
  "source-context",
  "editor",
  "greeting",
  "relations",
  "look",
  "history",
  "history-recovery",
  "look-recovery",
  "trust-actions",
  "commands",
  "library-recovery",
] as const;
export type CharacterWalkArea = (typeof CHARACTER_WALK_AREAS)[number];

interface CharacterFlow extends SurfaceFlow {
  readonly area: CharacterWalkArea;
  readonly expected: Map<string, SurfaceCoverageInventory["expected"][number]>;
  readonly observations: SurfaceCoverageInventory["observations"][number][];
  readonly provenance: { original?: CharacterId; disposable?: CharacterId };
}

function expectSubject(flow: CharacterFlow, id: string, kind: string): void {
  const subject = { id, kind };
  flow.expected.set(surfaceCoverageKey(subject), subject);
}

function alternateFont(current: string | undefined): (typeof THEME_FONT_ALLOWLIST)[number] {
  const next = THEME_FONT_ALLOWLIST.find((candidate) => candidate !== current);
  if (next === undefined) {
    throw new Error("The production font catalog has no alternate for a changed-value save");
  }
  return next;
}

async function record(flow: CharacterFlow, name: string, scope: Locator, witnesses: SurfaceAuditRequest["witnesses"]): Promise<void> {
  expectSubject(flow, name, "checkpoint");
  await flow.checkpoint({ name: `characters-${name}`, scope, state: "loaded", witnesses, checks: SURFACE_CHECKS });
  flow.observations.push({ id: name, kind: "checkpoint", disposition: "visited" });
}

async function recordState(
  flow: CharacterFlow,
  name: string,
  scope: Locator,
  state: DistributiveOmit<SurfaceAuditRequest, "name" | "scope" | "checks">,
): Promise<void> {
  expectSubject(flow, name, "checkpoint");
  await flow.checkpoint({ name: `characters-${name}`, scope, ...state, checks: SURFACE_CHECKS });
  flow.observations.push({ id: name, kind: "checkpoint", disposition: "visited" });
}

async function closeOverlay(page: Page): Promise<void> {
  const context = page.locator(CONTEXT);
  if ((await context.getAttribute("data-panel-mode")) === "overlay") {
    await context.getByRole("button", { name: "Close Characters details", exact: true }).click();
  }
  await expect(context).not.toHaveAttribute("data-panel-mode", "overlay");
}

async function openList(flow: CharacterFlow): Promise<Locator> {
  const { page } = flow;
  await closeOverlay(page);
  const search = page.getByRole("textbox", { name: "Search characters", exact: true });
  const back = page.getByRole("button", { name: "Back to Characters", exact: true });
  const show = page.getByRole("button", { name: /^Show (?:list panel|Characters(?: · .+)? list)$/u });
  await expect.poll(async () => (await search.isVisible()) || (await back.isVisible()) || (await show.isVisible())).toBe(true);
  if (await back.isVisible()) {
    await back.click();
  } else if (!(await search.isVisible())) {
    await show.click();
  }
  await expect(search).toBeVisible();
  return page.locator(LIST);
}

async function openCard(flow: CharacterFlow, name: string, rowName = name): Promise<Locator> {
  const list = await openList(flow);
  const search = list.getByRole("textbox", { name: "Search characters", exact: true });
  await search.fill(name);
  const row = list.getByRole("list", { name: "Character library", exact: true }).getByRole("button", { name: rowName, exact: true });
  await row.click();
  const form = flow.page.getByRole("form", { name: EDITOR_NAME, exact: true });
  await expect(form.getByRole("textbox", { name: "Name", exact: true })).toHaveValue(name);
  await flow.requestPanes();
  await closeOverlay(flow.page);
  if ((await list.getAttribute("data-panel-mode")) === "overlay") {
    await list.getByRole("button", { name: /^Close Characters(?: · .+)? list$/u }).click();
  }
  await expect(list).not.toHaveAttribute("data-panel-mode", "overlay");
  return form;
}

async function contextTab(flow: CharacterFlow, name: string): Promise<Locator> {
  const { page } = flow;
  const context = page.locator(CONTEXT);
  if ((await context.getAttribute("data-panel-mode")) === "collapsed") {
    await page.getByRole("button", { name: "Show details", exact: true }).click();
  }
  expectSubject(flow, name, "tab");
  if (flow.area === "source-context") {
    for (const label of await context.getByRole("tab").allTextContents()) {
      expectSubject(flow, label.trim(), "tab");
    }
  }
  // eslint-disable-next-line orb/no-hand-copied-label -- The Character context tablist is not RPG's NPC journal type label.
  const tab = context.getByRole("tablist", { name: TABLIST_NAME, exact: true }).getByRole("tab", { name, exact: true });
  await tab.scrollIntoViewIfNeeded();
  await flow.action(`characters-tab-${name}`, {
    action: async (): Promise<void> => {
      await tab.click();
    },
    ready: async (): Promise<void> => {
      await expect(tab).toHaveAttribute("aria-selected", "true");
    },
  });
  flow.observations.push({ id: name, kind: "tab", disposition: "visited" });
  return context.getByRole("region", { name, exact: true });
}

async function dialogCancel(flow: CharacterFlow, dialog: Locator, name: string, label = "Cancel"): Promise<void> {
  const cancel = dialog.getByRole("button", { name: label, exact: true });
  await flow.checkpoint({ name: `characters-${name}-exit-control`, scope: cancel, state: "loaded", witnesses: [cancel], checks: SURFACE_CHECKS }, [
    { region: dialog, actions: [cancel] },
  ]);
  await cancel.click();
  await expect(dialog).toBeHidden();
}

async function listJourney(flow: CharacterFlow, originalName: string, rowName: string): Promise<void> {
  const list = await openList(flow);
  const search = list.getByRole("textbox", { name: "Search characters", exact: true });
  await record(flow, "list-search-sort", list, [search, list.getByRole("combobox", { name: "Sort characters", exact: true })]);
  const sort = list.getByRole("combobox", { name: "Sort characters", exact: true });
  await sort.click();
  const options = await controlledPanel(sort);
  await expect(options.getByRole("option")).toHaveCount(CHARACTER_LIST_SORTS.length);
  await record(flow, "sort-catalog", options, [options.getByRole("option", { selected: true })]);
  await flow.page.keyboard.press("Escape");
  await expect(options).toBeHidden();

  const disclosure = list.getByRole("button", { name: /show more filters/u });
  if (await disclosure.isVisible()) {
    await disclosure.click();
  }
  const filters = list.getByRole("group", { name: "Filters", exact: true });
  await record(flow, "filter-vocabulary", filters, [filters.getByRole("button", { name: "Show only favorites", exact: true })]);
  const vocabularyRows = await flow.client.tag.listTagFilterVocabulary.query(undefined);
  const leadingTag = vocabularyRows[0];
  if (leadingTag !== undefined) {
    await filters.getByText(leadingTag.name, { exact: true }).waitFor({ state: "visible" });
  }
  const more = filters.getByRole("button", { name: /^Show \d+ more tags$/u });
  if (await more.isVisible()) {
    await more.click();
    const vocabulary = filters.getByRole("region", { name: "Tag vocabulary", exact: true });
    await record(flow, "expanded-tag-vocabulary", filters, [filters.getByRole("searchbox", { name: "Filter tags", exact: true }), vocabulary]);
    await filters.getByRole("button", { name: "Show fewer tags", exact: true }).click();
  }
  const fewerFilters = filters.getByRole("button", { name: /hide the tag vocabulary/u });
  if (await fewerFilters.isVisible()) {
    await fewerFilters.click();
  }
  await search.fill(`No matching surface subject ${flow.info.project.name} ${flow.pass}`);
  const clear = list.getByRole("button", { name: "Clear search", exact: true });
  await recordState(flow, "filtered-empty", list, { witnesses: [clear], state: "empty" });
  await flow.action("characters-recover-search", {
    action: async (): Promise<void> => {
      await clear.click();
    },
    ready: async (): Promise<void> => {
      await expect(search).toHaveValue("");
    },
  });
  await search.fill(originalName);
  await expect(list.getByRole("list", { name: "Character library", exact: true }).getByRole("button", { name: rowName, exact: true })).toBeVisible();
  const group = list.getByRole("button", { name: "Group by tag", exact: true });
  await group.click();
  await expect(group).toHaveAttribute("aria-pressed", "true");
  await record(flow, "categorized-library", list, [group]);
  await group.click();
  await expect(group).toHaveAttribute("aria-pressed", "false");
}

async function creationDialogs(flow: CharacterFlow): Promise<void> {
  await openList(flow);
  await flow.page.getByRole("button", { name: /^(?:New|New character)$/u }).click();
  const create = flow.page.getByRole("dialog", { name: "New character", exact: true });
  await record(flow, "new-dialog", create, [create.getByRole("textbox", { name: "Character name", exact: true })]);
  await dialogCancel(flow, create, "new-dialog-cancel");
  await flow.page.getByRole("button", { name: "Import a character card", exact: true }).click();
  await dialogCancel(flow, flow.page.getByRole("dialog", { name: "Import a character card", exact: true }), "import-dialog");
}

async function createRefusalJourney(flow: CharacterFlow): Promise<void> {
  const { page, client } = flow;
  const name = `Surface authored ${flow.info.project.name.slice(0, 70)} ${flow.pass} ${flow.info.testId.slice(-8)}`;
  const before = new Set((await client.character.list.query({ search: name })).items.map((row) => row.id));
  const description = "A disposable card created through the native character dialog.";
  const open = async (): Promise<Locator> => {
    await openList(flow);
    await page.getByRole("button", { name: /^(?:New|New character)$/u }).click();
    const dialog = page.getByRole("dialog", { name: "New character", exact: true });
    await dialog.getByRole("textbox", { name: "Character name", exact: true }).fill(name);
    await dialog.getByRole("textbox", { name: "Character description", exact: true }).fill(description);
    return dialog;
  };
  try {
    const create = await open();
    await flow.action("characters-native-create", {
      action: async (): Promise<void> => {
        // eslint-disable-next-line orb/no-hand-copied-label -- The character dialog submit is not a slash-command group label.
        await create.getByRole("button", { name: "Create", exact: true }).click();
      },
      ready: async (): Promise<void> => {
        await expect(create).toBeHidden();
        await expect(page.getByRole("form", { name: EDITOR_NAME, exact: true }).getByRole("textbox", { name: "Name", exact: true })).toHaveValue(name);
      },
    });
    const persisted = (await client.character.list.query({ search: name })).items.filter((row) => row.name === name && !before.has(row.id));
    expect(persisted).toHaveLength(1);
    const refused = await open();
    const refusedResponse = page.waitForResponse((candidate) => isTrpcRequestFor(candidate.url(), "character.create"));
    // eslint-disable-next-line orb/no-hand-copied-label -- The character dialog submit is not a slash-command group label.
    await refused.getByRole("button", { name: "Create", exact: true }).click();
    const response = await refusedResponse;
    expect(response.status()).toBe(400);
    expect(await response.json()).toMatchObject([{ error: { data: { code: "BAD_REQUEST", reason: CHARACTER_HANDLE_CONFLICT_OP_CODE } } }]);
    const field = refused.getByRole("textbox", { name: "Character name", exact: true });
    await expect(field).toHaveAttribute("aria-invalid", "true");
    await recordState(flow, "native-name-conflict", refused, { state: "error", errorSource: "interaction", witnesses: [field, refused.getByRole("alert")] });
    markExpectedSurfaceHttpFailure(response);
    await dialogCancel(flow, refused, "native-name-conflict-cancel");
  } finally {
    for (const row of (await client.character.list.query({ search: name })).items) {
      if (row.name === name && !before.has(row.id)) {
        await client.character.remove.mutate({ characterId: row.id });
      }
    }
  }
}

async function tagsJourney(flow: CharacterFlow, form: Locator, characterId: CharacterId): Promise<void> {
  await closeOverlay(flow.page);
  // eslint-disable-next-line orb/no-hand-copied-label -- This accepted-card metadata group is not the tag library's list.
  const tags = form.getByRole("group", { name: "Tags", exact: true });
  const add = tags.getByRole("button", { name: "Add tag", exact: true });
  await add.scrollIntoViewIfNeeded();
  await record(flow, "accepted-tags", tags, [add]);
  await add.click();
  const picker = flow.page.getByRole("dialog", { name: "Tag this character", exact: true });
  await record(flow, "tag-name-picker", picker, [picker.getByRole("combobox", { name: "Tag name", exact: true })]);
  await dialogCancel(flow, picker, "tag-name-picker-cancel");
  const detail = await flow.client.character.get.query({ characterId });
  const tag = detail.tags.find((candidate) => !candidate.isHiddenOnCard);
  if (tag !== undefined) {
    await tags.getByRole("button", { name: `Edit tag ${tag.name}`, exact: true }).click();
    const editor = flow.page.getByRole("dialog", { name: `Edit tag ${tag.name}`, exact: true });
    const close = editor.getByRole("button", { name: "Close tag editor", exact: true });
    await record(flow, "tag-editor-readonly", editor, [close, editor.getByRole("textbox", { name: "Name", exact: true })]);
    await close.click();
  }
}

async function rowAndBulkJourney(flow: CharacterFlow, name: string): Promise<void> {
  const list = await openList(flow);
  await list.getByRole("textbox", { name: "Search characters", exact: true }).fill(name);
  const row = list.locator('[data-slot="list-row-root"]').filter({ has: flow.page.getByRole("button", { name, exact: true }) });
  await row.hover();
  await row.getByRole("button", { name: rowActionsName(name), exact: true }).click();
  const menu = flow.page.getByRole("menu");
  await record(flow, "row-actions", menu, [menu.getByRole("menuitem", { name: CHARACTER_ACTIONS.archive.label, exact: true })]);
  const exportCard = menu.getByRole("menuitem", { name: CHARACTER_ACTIONS.exportCard.label, exact: true });
  await exportCard.focus();
  await exportCard.press("ArrowRight");
  const format = CHARACTER_ACTIONS.exportCard.formats[0];
  if (format === undefined) {
    throw new Error("The production card action has no export format");
  }
  const png = flow.page.getByRole("menuitem", { name: format.label, exact: true });
  await record(flow, "row-export-formats-unsubmitted", flow.page.getByRole("menu").filter({ has: png }), [png]);
  await flow.page.keyboard.press("Escape");
  await flow.page.keyboard.press("Escape");
  const select = list.getByRole("button", { name: "Select multiple", exact: true });
  await select.click();
  await list.getByRole("checkbox", { name: `Select ${name}`, exact: true }).check();
  const tag = list.getByRole("button", { name: CHARACTER_ACTIONS.tag.label, exact: true });
  await record(flow, "bulk-selected", list, [tag, list.getByRole("button", { name: CHARACTER_ACTIONS.delete.label, exact: true })]);
  await tag.click();
  await dialogCancel(flow, flow.page.getByRole("dialog", { name: "Tag 1 character", exact: true }), "bulk-tag-picker");
  await list.getByRole("button", { name: CHARACTER_ACTIONS.delete.label, exact: true }).click();
  await dialogCancel(flow, flow.page.getByRole("alertdialog", { name: "Delete 1 character?", exact: true }), "bulk-delete-confirm");
  await select.click();
}

async function toggleGreetingStudio(greeting: Locator): Promise<void> {
  // eslint-disable-next-line orb/no-hand-copied-label -- The greeting Studio control is not the preset template-group label.
  await greeting.getByRole("button", { name: "Studio", exact: true }).click();
}

async function greetingJourney(flow: CharacterFlow, form: Locator): Promise<void> {
  await closeOverlay(flow.page);
  const greeting = form.locator('[data-slot="character-greeting"]');
  await greeting.scrollIntoViewIfNeeded();
  await record(flow, "greeting-preview", greeting, [greeting.getByRole("button", { name: "Edit", exact: true })]);
  await greeting.getByRole("button", { name: "Edit", exact: true }).click();
  await record(flow, "greeting-edit", greeting, [greeting.getByRole("textbox", { name: /^Opening \d+$/u })]);
  await greeting.getByRole("button", { name: "Done", exact: true }).click();
  await toggleGreetingStudio(greeting);
  const studio = greeting.locator('[data-slot="greeting-studio"]');
  await record(flow, "greeting-studio-no-generation", studio, [studio.getByRole("textbox", { name: "Greeting instructions", exact: true })]);
  await toggleGreetingStudio(greeting);
}

async function greetingGenerationJourney(flow: CharacterFlow, form: Locator, characterId: CharacterId, originalId: CharacterId): Promise<void> {
  const originalBefore = await flow.client.character.get.query({ characterId: originalId });
  const before = await flow.client.character.get.query({ characterId });
  const connectionId = flow.run.generation.connection.id;
  const consentBefore = (await flow.client.connection.get.query({ connectionId })).allowBackground;
  const previous = (await flow.client.connection.listBindings.query()).find(({ task }) => task === "summarize");
  if (previous === undefined) {
    throw new Error("The production binding catalogue has no summarize task");
  }
  const previousId = previous.binding?.connectionId ?? null;
  const greeting = form.locator('[data-slot="character-greeting"]');
  const preview = greeting.locator('[data-slot="greeting-studio-preview"]');
  const generated = flow.run.generation.completionText;
  const formBefore = characterCardFormFromDetail(before);
  const acceptedGreetings = characterUpdateDiff({ ...formBefore, greetings: [...formBefore.greetings, { text: generated }] }, before).greetings;
  const openingName = `Opening ${formBefore.greetings.length + 1}`;
  await attachNativeFile(flow.info, flow.info, "characters-greeting-before", {
    body: JSON.stringify({
      originalId,
      disposableId: characterId,
      original: originalBefore,
      greetings: before.greetings,
      editorGreetings: formBefore.greetings,
      binding: previousId,
      allowBackground: consentBefore,
    }),
    contentType: "application/json",
  });
  try {
    await flow.client.connection.update.mutate({ connectionId, patch: { allowBackground: true } });
    await flow.client.connection.setBinding.mutate({ task: "summarize", connectionId });
    await closeOverlay(flow.page);
    await toggleGreetingStudio(greeting);
    const generate = greeting.getByRole("button", { name: "Make new", exact: true });
    const makePreview = async (name: string): Promise<void> => {
      const cursor = Math.max(
        0,
        ...parseSurfaceProviderEvidence(await readFile(flow.run.generation.requestEvidencePath, "utf8")).map(({ requestId }) => requestId),
      );
      await flow.action(`characters-${name}`, {
        action: async (): Promise<void> => {
          await generate.click();
        },
        ready: async (): Promise<void> => {
          await expect(preview).toContainText(generated);
          await expect(preview.getByRole("button", { name: "Accept", exact: true })).toBeVisible();
        },
      });
      const requests = parseSurfaceProviderEvidence(await readFile(flow.run.generation.requestEvidencePath, "utf8")).filter(
        ({ requestId, event, request }) => requestId > cursor && event === "request" && request === "POST /v1/chat/completions",
      );
      expect(requests, "This native generation must own one fresh physical completion request").toHaveLength(1);
      await attachNativeFile(flow.info, flow.info, `characters-${name}-request`, {
        body: JSON.stringify({ cursor, requests }),
        contentType: "application/json",
      });
      expect((await flow.client.character.get.query({ characterId })).greetings).toEqual(before.greetings);
      await record(flow, name, preview, [preview.getByRole("button", { name: "Accept", exact: true })]);
    };
    await makePreview("greeting-preview-before-discard");
    await preview.getByRole("button", { name: "Discard", exact: true }).click();
    await expect(preview).toBeHidden();
    await expect(generate).toBeFocused();
    expect((await flow.client.character.get.query({ characterId })).greetings).toEqual(before.greetings);
    await record(flow, "greeting-discarded", greeting, [generate]);
    await makePreview("greeting-preview-before-accept");
    await flow.action("characters-greeting-accept", {
      action: async (): Promise<void> => {
        await preview.getByRole("button", { name: "Accept", exact: true }).click();
      },
      ready: async (): Promise<void> => {
        await expect.poll(async () => (await flow.client.character.get.query({ characterId })).greetings).toEqual(acceptedGreetings);
        await expect(preview).toBeHidden();
        await expect(greeting.getByRole("textbox", { name: openingName, exact: true })).toHaveValue(generated);
      },
    });
    await record(flow, "greeting-accepted-and-persisted", greeting, [greeting.getByRole("textbox", { name: openingName, exact: true })]);
    await attachNativeFile(flow.info, flow.info, "characters-greeting-custody", {
      body: JSON.stringify({
        originalId,
        disposableId: characterId,
        before: before.greetings,
        after: (await flow.client.character.get.query({ characterId })).greetings,
      }),
      contentType: "application/json",
    });
  } finally {
    await flow.client.connection.setBinding.mutate({ task: "summarize", connectionId: previousId });
    await flow.client.connection.update.mutate({ connectionId, patch: { allowBackground: consentBefore } });
    expect((await flow.client.connection.get.query({ connectionId })).allowBackground).toBe(consentBefore);
    expect((await flow.client.connection.listBindings.query()).find(({ task }) => task === "summarize")?.binding?.connectionId ?? null).toBe(previousId);
    expect(await flow.client.character.get.query({ characterId: originalId })).toEqual(originalBefore);
  }
}

function inspectorWitness(overview: Locator, facetId: string): Locator {
  if (facetId === "depthPrompt") {
    return overview.getByRole("combobox", { name: "Role", exact: true });
  }
  if (facetId === "provenance") {
    return overview.getByRole("textbox", { name: "Creator", exact: true });
  }
  if (facetId === "regexScripts") {
    return overview.getByRole("button", { name: "Open your script library", exact: true });
  }
  return overview.getByRole("heading", { name: "Details", exact: true });
}

async function facetJourney(flow: CharacterFlow, form: Locator): Promise<void> {
  for (const facet of CHARACTER_CARD_FACETS) {
    await closeOverlay(flow.page);
    const opener = form.getByRole("button", { name: facet.label, exact: true });
    await opener.scrollIntoViewIfNeeded();
    await opener.click();
    await closeOverlay(flow.page);
    const back = form.getByRole("button", { name: "Back", exact: true });
    await expect(back).toBeVisible();
    let witness = form.getByRole("textbox", { name: facet.label, exact: true });
    if (facet.id === "exampleMessages") {
      await form.getByRole("button", { name: "Expand to edit", exact: true }).click();
    } else if (facet.id === "depthPrompt") {
      witness = form.getByRole("textbox", { name: "Note text", exact: true });
    } else if (facet.id === "provenance") {
      witness = form.getByRole("textbox", { name: "Creator", exact: true });
    } else if (facet.id === "regexScripts") {
      witness = form.getByText("Picked from your script library — these run whenever this character is in the room.", { exact: true });
    }
    await witness.scrollIntoViewIfNeeded();
    await record(flow, `facet-${facet.id}`, form, [back, witness]);
    flow.observations.push({ id: facet.id, kind: "facet", disposition: "visited" });
    const overview = await contextTab(flow, "Overview");
    const detail = inspectorWitness(overview, facet.id);
    await detail.scrollIntoViewIfNeeded();
    await record(flow, `facet-inspector-${facet.id}`, overview, [detail]);
    await closeOverlay(flow.page);
    await back.scrollIntoViewIfNeeded();
    await back.click();
    await expect(opener).toBeFocused();
  }
}

async function relationsJourney(flow: CharacterFlow, characterId: CharacterId, subject = "copy"): Promise<void> {
  const links = await contextTab(flow, "Links");
  const books = links.getByRole("button", { name: "Link a book", exact: true });
  const personas = links.getByRole("button", { name: "Connect a persona", exact: true });
  await record(flow, `${subject}-links-sections`, links, [books, personas]);
  const linked = new Set((await flow.client.worldInfo.listForCharacter.query({ characterId })).map(({ id }) => id));
  const availableBook = (await flow.client.worldInfo.listBooks.query(undefined)).find(({ id }) => !linked.has(id));
  await books.click();
  const bookPicker = flow.page.getByRole("dialog", { name: "Link a world book", exact: true });
  if (availableBook === undefined) {
    await recordState(flow, `${subject}-all-books-linked`, bookPicker, {
      state: "empty",
      witnesses: [bookPicker.getByText("Every book is already linked.", { exact: true })],
    });
  } else {
    await record(flow, `${subject}-available-books`, bookPicker, [bookPicker.getByRole("button", { name: `Link ${availableBook.name}`, exact: true })]);
  }
  await dialogCancel(flow, bookPicker, `${subject}-world-book-picker`, "Done");
  const connected = new Set((await flow.client.persona.listConnectedToCharacter.query({ characterId })).map(({ id }) => id));
  const availablePersona = (await flow.client.persona.list.query(undefined)).find(({ id }) => !connected.has(id));
  await personas.click();
  const personaPicker = flow.page.getByRole("dialog", { name: "Connect a persona", exact: true });
  if (availablePersona === undefined) {
    await recordState(flow, `${subject}-all-personas-connected`, personaPicker, {
      state: "empty",
      witnesses: [personaPicker.getByText("Every persona is already connected.", { exact: true })],
    });
  } else {
    await record(flow, `${subject}-available-personas`, personaPicker, [
      personaPicker.getByRole("button", { name: `Connect ${availablePersona.name}`, exact: true }),
    ]);
  }
  await dialogCancel(flow, personaPicker, `${subject}-persona-picker`, "Done");
}

async function lookJourney(flow: CharacterFlow, characterId: CharacterId): Promise<void> {
  const look = await contextTab(flow, "Look");
  const font = look.getByRole("combobox", { name: "Font", exact: true });
  await expect(font).toBeVisible();
  const colours = await look.locator('[data-slot="color-field-trigger"]').all();
  for (const [index, colour] of colours.entries()) {
    await colour.scrollIntoViewIfNeeded();
    await colour.click();
    const popup = flow.page.getByRole("dialog", { name: / color picker$/u });
    await record(flow, `look-colour-${index + 1}`, popup, [popup.getByRole("textbox", { name: "Hex", exact: true })]);
    await flow.page.keyboard.press("Escape");
    await expect(popup).toBeHidden();
  }
  await font.scrollIntoViewIfNeeded();
  await record(flow, "look-type-shape", look, [font, look.getByRole("combobox", { name: "Corner radius", exact: true })]);
  const nextFont = alternateFont((await flow.client.character.get.query({ characterId })).themeOverride?.font);
  await font.click();
  await flow.page.getByRole("option", { name: nextFont, exact: true }).click();
  await expect.poll(async () => (await flow.client.character.get.query({ characterId })).themeOverride?.font).toBe(nextFont);
  const theme = look.getByRole("button", { name: "Start from a theme…", exact: true });
  await theme.scrollIntoViewIfNeeded();
  const catalog = await flow.client.settings.listThemes.query(undefined);
  await expect.poll(async () => theme.isEnabled()).toBe(catalog.length > 0);
  const first = catalog[0];
  if (first !== undefined) {
    await theme.click();
    const menu = flow.page.getByRole("menu");
    await record(flow, "look-theme-catalog", menu, [menu.getByRole("menuitem", { name: first.name, exact: true })]);
    await flow.page.keyboard.press("Escape");
  }
  const background = look.getByRole("grid", { name: "Background", exact: true });
  await background.scrollIntoViewIfNeeded();
  await record(flow, "look-background", look, [background]);
  await look.getByRole("button", { name: "From a URL…", exact: true }).click();
  const url = look.getByRole("textbox", { name: "Background image URL", exact: true });
  await record(flow, "look-background-url-unsubmitted", look, [url, look.getByRole("button", { name: "Apply", exact: true })]);
}

async function releaseHistory(flow: CharacterFlow, held: HeldTrpcProcedure, failed: boolean): Promise<void> {
  const [released] = await Promise.allSettled([held.release()]);
  if (released.status === "rejected") {
    if (!failed) {
      throw new Error("The held History request could not be released", { cause: released.reason });
    }
    await attachNativeFile(flow.info, flow.info, "characters-history-release-failure", { body: String(released.reason), contentType: "text/plain" });
  }
}

async function historyJourney(flow: CharacterFlow, characterId: CharacterId): Promise<void> {
  const held = await holdTrpcProcedure(flow.page, "character.listSnapshots");
  let failed = false;
  let history: Locator;
  expectSubject(flow, "history-held-read", "pending");
  try {
    history = await contextTab(flow, "History");
    await held.requested;
    await test.step("Characters History held-read diagnostic", async (): Promise<void> => {
      await expect.poll(async () => history.locator('[data-slot="skeleton"]').count()).toBeGreaterThan(0);
      await attachNativeFile(flow.info, flow.info, "characters-history-pending-state", {
        body: JSON.stringify({ state: "pending", fullSurfaceAudit: "not-run", fault: "held real snapshot request" }),
        contentType: "application/json",
      });
      if (flow.pass === "evidence") {
        await attachNativeFile(flow.info, flow.info, "characters-history-pending", { body: await flow.page.screenshot(), contentType: "image/png" });
      }
    });
    flow.observations.push({ id: "history-held-read", kind: "pending", disposition: "visited" });
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    await releaseHistory(flow, held, failed);
  }
  await snapshotJourney(flow, characterId, history);
}

async function snapshotJourney(flow: CharacterFlow, characterId: CharacterId, history: Locator): Promise<void> {
  const snapshot = history.getByRole("button", { name: "Snapshot now", exact: true });
  await recordState(flow, "history-empty", history, {
    witnesses: [snapshot, history.getByText("No snapshots yet. Take one to capture this character's current state.", { exact: true })],
    state: "empty",
  });
  await flow.action("characters-take-snapshot", {
    action: async (): Promise<void> => {
      await snapshot.click();
    },
    ready: async (): Promise<void> => {
      await expect.poll(async () => (await flow.client.character.listSnapshots.query({ characterId })).length).toBe(1);
    },
  });
  const restore = history.getByRole("button", { name: "Restore", exact: true });
  await record(flow, "history-populated", history, [restore]);
  await restore.click();
  await dialogCancel(flow, flow.page.getByRole("alertdialog", { name: "Restore this snapshot?", exact: true }), "snapshot-restore-confirm");
}

async function historyFailureJourney(flow: CharacterFlow, name: string): Promise<void> {
  const matcher = /\/api\/trpc\/[^?]*character\.listSnapshots(?:[?,]|$)/u;
  const fault = async (route: Route): Promise<void> => {
    await route.abort("aborted");
  };
  await flow.page.route(matcher, fault);
  let history: Locator;
  try {
    await flow.page.reload();
    await waitForAppReady(flow.page);
    await charactersRailButton(flow.page).click();
    await openCard(flow, name);
    history = await contextTab(flow, "History");
    const retry = history.getByRole("button", { name: "Retry", exact: true });
    await retry.scrollIntoViewIfNeeded();
    await recordState(flow, "history-transport-error", history, { witnesses: [retry], state: "error" });
  } finally {
    await flow.page.unroute(matcher, fault);
  }
  await history.getByRole("button", { name: "Retry", exact: true }).press("Enter");
  await record(flow, "history-recovered-log", history, [history.getByRole("button", { name: "Restore", exact: true })]);
}

async function lookFailureJourney(flow: CharacterFlow, characterId: CharacterId): Promise<void> {
  const look = await contextTab(flow, "Look");
  const before = await flow.client.character.get.query({ characterId });
  const next = alternateFont(before.themeOverride?.font);
  const font = look.getByRole("combobox", { name: "Font", exact: true });
  const matcher = /\/api\/trpc\/[^?]*character\.update(?:[?,]|$)/u;
  const fault = async (route: Route): Promise<void> => {
    await route.abort("aborted");
  };
  await flow.page.route(matcher, fault);
  const status = look.locator('[data-slot="autosave-status"]');
  try {
    await font.scrollIntoViewIfNeeded();
    await font.click();
    await flow.page.getByRole("option", { name: next, exact: true }).click();
    await expect(font).toHaveText(next);
    await expect(status).toContainText("Save failed");
    const retry = status.getByRole("button", { name: "Retry", exact: true });
    await retry.scrollIntoViewIfNeeded();
    await recordState(flow, "look-failed-save-draft", look, { state: "error", errorSource: "interaction", witnesses: [retry] });
  } finally {
    await flow.page.unroute(matcher, fault);
  }
  await status.getByRole("button", { name: "Retry", exact: true }).press("Enter");
  await expect.poll(async () => (await flow.client.character.get.query({ characterId })).themeOverride?.font).toBe(next);
  await expect(status).toHaveText("Saved");
  await record(flow, "look-keyboard-save-recovered", look, [status]);
}

async function trustJourney(flow: CharacterFlow, subject = "copy"): Promise<void> {
  const trust = await contextTab(flow, "Trust");
  const html = trust.getByRole("combobox", { name: "HTML rendering", exact: true });
  await html.scrollIntoViewIfNeeded();
  await record(flow, `${subject}-trust-controls`, trust, [html, trust.getByRole("combobox", { name: "External media", exact: true })]);
  await html.click();
  const options = await controlledPanel(html);
  await record(flow, `${subject}-trust-ladder`, options, [options.getByRole("option", { name: "Interactive", exact: true })]);
  await flow.page.keyboard.press("Escape");
  await expect(options).toBeHidden();
}

async function actionsJourney(flow: CharacterFlow, characterId: CharacterId): Promise<void> {
  await contextTab(flow, "Overview");
  const button = flow.page.locator(CONTEXT).getByRole("button", { name: "Character actions", exact: true });
  await button.click();
  let menu = flow.page.getByRole("menu");
  const detail = await flow.client.character.get.query({ characterId });
  await expect(menu.getByRole("menuitem")).toHaveCount(CHARACTER_ACTION_SCOPE_IDS.open.length);
  for (const id of CHARACTER_ACTION_SCOPE_IDS.open) {
    const action = CHARACTER_ACTIONS[id];
    await expect(
      menu.getByRole("menuitem", { name: detail.archived && action.toggledLabel !== null ? action.toggledLabel : action.label, exact: true }),
    ).toBeVisible();
  }
  await record(flow, "open-actions", menu, [
    menu.getByRole("menuitem", { name: CHARACTER_ACTIONS.openGallery.label, exact: true }),
    menu.getByRole("menuitem", { name: CHARACTER_ACTIONS.delete.label, exact: true }),
  ]);
  await menu.getByRole("menuitem", { name: CHARACTER_ACTIONS.duplicate.label, exact: true }).click();
  await dialogCancel(flow, flow.page.getByRole("alertdialog", { name: "Duplicate this character?", exact: true }), "duplicate-confirm");
  await button.click();
  menu = flow.page.getByRole("menu");
  await menu.getByRole("menuitem", { name: CHARACTER_ACTIONS.delete.label, exact: true }).click();
  await dialogCancel(flow, flow.page.getByRole("alertdialog", { name: "Delete this character?", exact: true }), "delete-confirm");
  await button.click();
  await flow.page.getByRole("menuitem", { name: CHARACTER_ACTIONS.openGallery.label, exact: true }).click();
  const gallery = flow.page.getByRole("dialog", { name: `${detail.name}'s gallery`, exact: true });
  const addImages = gallery.getByRole("button", { name: "Add images", exact: true });
  await recordState(flow, "gallery-copy-empty", gallery, { state: "empty", witnesses: [gallery.getByText("No images yet", { exact: true }), addImages] });
  await addImages.click();
  const candidates = await flow.client.assets.listOwned.query({ limit: 1, galleryCandidatesFor: characterId });
  const picker = flow.page.getByRole("dialog", { name: "Add images to the gallery", exact: true });
  if (candidates.length === 0) {
    await recordState(flow, "gallery-candidates-empty", picker, {
      state: "empty",
      witnesses: [picker.getByRole("button", { name: "Upload instead", exact: true })],
    });
  } else {
    await record(flow, "gallery-candidates-loaded", picker, [picker.getByRole("grid", { name: "Your images", exact: true })]);
  }
  await dialogCancel(flow, picker, "gallery-owned-image-picker");
  await gallery.getByRole("button", { name: "Close", exact: true }).click();
  await expect(gallery).toBeHidden();
  flow.observations.push({
    id: "openGallery",
    kind: "action",
    disposition: "visited",
    reason: "The disposable gallery and owned-image picker were opened, inspected and closed; asset mutation is not claimed.",
  });
}

async function originalContextJourney(flow: CharacterFlow, characterId: CharacterId): Promise<void> {
  const detail = await flow.client.character.get.query({ characterId });
  const overview = await contextTab(flow, "Overview");
  await record(flow, "original-overview", overview, [overview.getByRole("group", { name: "Source", exact: true })]);

  const actualChats = await flow.client.chat.listChats.query({ characterId });
  const chats = await contextTab(flow, "Chats");
  if (actualChats.totalCount === 0) {
    await recordState(flow, "original-chats-empty", chats, { state: "empty", witnesses: [chats.getByRole("button", { name: "New chat", exact: true })] });
  } else {
    const rows = chats.getByRole("list", { name: `Chats with ${detail.name}`, exact: true });
    await record(flow, "original-chats-populated", chats, [rows]);
  }
  await relationsJourney(flow, characterId, "original");

  const look = await contextTab(flow, "Look");
  const font = look.getByRole("combobox", { name: "Font", exact: true });
  await font.scrollIntoViewIfNeeded();
  await record(flow, "original-look-readonly", look, [font]);

  const snapshots = await flow.client.character.listSnapshots.query({ characterId });
  const history = await contextTab(flow, "History");
  const restores = history.getByRole("button", { name: "Restore", exact: true });
  await expect(restores).toHaveCount(snapshots.length);
  const snapshot = history.getByRole("button", { name: "Snapshot now", exact: true });
  if (snapshots.length === 0) {
    await recordState(flow, "original-history-readonly", history, {
      state: "empty",
      witnesses: [snapshot, history.getByText("No snapshots yet. Take one to capture this character's current state.", { exact: true })],
    });
  } else {
    await record(flow, "original-history-readonly", history, [snapshot]);
  }
  await trustJourney(flow, "original");
  await attachNativeFile(flow.info, flow.info, "characters-original-context-population", {
    body: JSON.stringify({ characterId, chats: actualChats.totalCount, snapshots: snapshots.length, tags: detail.tags.length, mutation: "none" }),
    contentType: "application/json",
  });
}

async function recoveryJourney(flow: CharacterFlow, name: string): Promise<void> {
  await closeOverlay(flow.page);
  await openList(flow);
  const fault = async (route: Route): Promise<void> => {
    await route.abort("aborted");
  };
  const matcher = /\/api\/trpc\/[^?]*character\.list(?:[?,]|$)/u;
  await flow.page.route(matcher, fault);
  try {
    await flow.page.getByRole("textbox", { name: "Search characters", exact: true }).fill(`${name} deliberately failed read`);
    const list = flow.page.locator(LIST);
    const retry = list.getByRole("button", { name: "Retry", exact: true });
    await recordState(flow, "library-transport-failure", list, { witnesses: [retry], state: "error" });
  } finally {
    await flow.page.unroute(matcher, fault);
  }
  const retry = flow.page.locator(LIST).getByRole("button", { name: "Retry", exact: true });
  await retry.click();
  const clear = flow.page.locator(LIST).getByRole("button", { name: "Clear search", exact: true });
  await recordState(flow, "library-retried-empty", flow.page.locator(LIST), { witnesses: [clear], state: "empty" });
  await clear.click();
}

type SourceCharacter = Awaited<ReturnType<SurfaceFlow["client"]["character"]["list"]["query"]>>["items"][number];

async function sourceCharacter(flow: CharacterFlow): Promise<SourceCharacter> {
  const sourceIds = new Set(flow.run.subjects.characters.map(({ id }) => id));
  let sourcePage = await flow.client.character.list.query({ archived: false, limit: 30, sort: "recent" });
  let original = sourcePage.items.find((row) => sourceIds.has(row.id));
  while (original === undefined && sourcePage.nextCursor !== null) {
    sourcePage = await flow.client.character.list.query({ archived: false, limit: 30, sort: "recent", cursor: sourcePage.nextCursor });
    original = sourcePage.items.find((row) => sourceIds.has(row.id));
  }
  await flow.page.goto("/");
  await waitForAppReady(flow.page);
  await charactersRailButton(flow.page).click();
  await flow.requestPanes();
  if (original === undefined) {
    const list = await openList(flow);
    if (sourcePage.totalCount === 0) {
      await recordState(flow, "genuine-empty-source-library", list, { witnesses: [list.getByText("No characters yet", { exact: true })], state: "empty" });
    }
    throw new Error("The source dataset has no Character subject; no synthetic owner subject was invented");
  }
  return original;
}

interface DisposableCharacter {
  readonly id: CharacterId;
  readonly name: string;
  readonly form: Locator;
}

async function withDisposableCharacter(
  flow: CharacterFlow,
  original: SourceCharacter,
  operation: (subject: DisposableCharacter) => Promise<void>,
): Promise<void> {
  const copy = await flow.client.character.duplicate.mutate({ characterId: original.id });
  flow.provenance.disposable = copy.id;
  try {
    const name = `Surface ${flow.area} ${flow.info.project.name.slice(0, 50)} ${flow.info.testId.slice(-8)}`;
    await flow.client.character.update.mutate({ characterId: copy.id, input: { name } });
    const form = await openCard(flow, name);
    await operation({ id: copy.id, name, form });
  } finally {
    await flow.client.character.remove.mutate({ characterId: copy.id });
  }
}

interface CommandSubjects {
  readonly characters: Set<CharacterId>;
  readonly personas: Set<PersonaId>;
  readonly tags: Set<TagId>;
  readonly nativeDeleted: Set<CharacterId>;
}

function completedCommand(flow: CharacterFlow, id: (typeof COMMAND_ACTION_IDS)[number], reason: string): void {
  flow.observations.push({ id, kind: "action", disposition: "visited", reason });
}

async function commandMenu(flow: CharacterFlow): Promise<Locator> {
  await contextTab(flow, "Overview");
  await flow.page.locator(CONTEXT).getByRole("button", { name: "Character actions", exact: true }).click();
  return flow.page.getByRole("menu");
}

async function createCommandCharacter(flow: CharacterFlow, name: string, subjects: CommandSubjects): Promise<SourceCharacter> {
  await openList(flow);
  await flow.page.getByRole("button", { name: /^(?:New|New character)$/u }).click();
  const dialog = flow.page.getByRole("dialog", { name: "New character", exact: true });
  await dialog.getByRole("textbox", { name: "Character name", exact: true }).fill(name);
  await dialog.getByRole("textbox", { name: "Character description", exact: true }).fill("A disposable native command witness for {{char}} and {{user}}.");
  await flow.action("characters-commands-create", {
    action: async (): Promise<void> => {
      // eslint-disable-next-line orb/no-hand-copied-label -- This is the character creation submit, not a slash-command group label.
      await dialog.getByRole("button", { name: "Create", exact: true }).click();
    },
    ready: async (): Promise<void> => {
      await expect(dialog).toBeHidden();
      await expect.poll(async () => (await flow.client.character.list.query({ search: name })).items.filter((row) => row.name === name).length).toBe(1);
    },
  });
  const created = (await flow.client.character.list.query({ search: name })).items.find((row) => row.name === name);
  if (created === undefined) {
    throw new Error("The native Character create left no disposable subject");
  }
  subjects.characters.add(created.id);
  const form = flow.page.getByRole("form", { name: EDITOR_NAME, exact: true });
  await expect(form.getByRole("textbox", { name: "Name", exact: true })).toHaveValue(name);
  await record(flow, "commands-native-created", form, [form.getByRole("textbox", { name: "Name", exact: true })]);
  return created;
}

async function duplicateCommandCharacter(flow: CharacterFlow, parent: SourceCharacter, name: string, subjects: CommandSubjects): Promise<SourceCharacter> {
  await (await commandMenu(flow)).getByRole("menuitem", { name: CHARACTER_ACTIONS.duplicate.label, exact: true }).click();
  const confirm = flow.page.getByRole("alertdialog", { name: "Duplicate this character?", exact: true });
  await record(flow, "commands-duplicate-confirm", confirm, [confirm.getByRole("button", { name: CHARACTER_ACTIONS.duplicate.label, exact: true })]);
  await flow.action("characters-commands-duplicate", {
    action: async (): Promise<void> => {
      await confirm.getByRole("button", { name: CHARACTER_ACTIONS.duplicate.label, exact: true }).click();
    },
    ready: async (): Promise<void> => {
      await expect(confirm).toBeHidden();
      await expect
        .poll(
          async () =>
            (await flow.client.character.list.query({ search: parent.name })).items.filter((row) => row.name === parent.name && row.id !== parent.id).length,
        )
        .toBe(1);
    },
  });
  const copy = (await flow.client.character.list.query({ search: parent.name })).items.find((row) => row.name === parent.name && row.id !== parent.id);
  if (copy === undefined) {
    throw new Error("The native duplicate left no independently identified card");
  }
  subjects.characters.add(copy.id);
  expect(copy.handle).not.toBe(parent.handle);
  const form = flow.page.getByRole("form", { name: EDITOR_NAME, exact: true });
  await closeOverlay(flow.page);
  await flow.action("characters-commands-copy-identity-save", {
    action: async (): Promise<void> => {
      await form.getByRole("textbox", { name: "Name", exact: true }).fill(name);
    },
    ready: async (): Promise<void> => {
      await expect.poll(async () => (await flow.client.character.get.query({ characterId: copy.id })).name).toBe(name);
      await expect(form.locator('[data-slot="autosave-status"]')).toHaveText("Saved");
    },
  });
  expect((await flow.client.character.get.query({ characterId: parent.id })).name).toBe(parent.name);
  await flow.page.reload();
  await waitForAppReady(flow.page);
  const persisted = await openCard(flow, name);
  await record(flow, "commands-copy-identity-reloaded", persisted, [persisted.getByRole("textbox", { name: "Name", exact: true })]);
  completedCommand(
    flow,
    "duplicate",
    `Native confirmation selected fresh ${copy.id}; its renamed identity survived reload and ${parent.id} retained its name.`,
  );
  return { ...copy, name };
}

async function selectCommandCards(flow: CharacterFlow, search: string, names: readonly string[]): Promise<Locator> {
  const list = await openList(flow);
  await list.getByRole("textbox", { name: "Search characters", exact: true }).fill(search);
  const select = list.getByRole("button", { name: "Select multiple", exact: true });
  if ((await select.getAttribute("aria-pressed")) !== "true") {
    await select.click();
  }
  for (const name of names) {
    await list.getByRole("checkbox", { name: `Select ${name}`, exact: true }).check();
  }
  return list;
}

async function tagCommandCharacters(
  flow: CharacterFlow,
  cards: readonly [SourceCharacter, SourceCharacter],
  tagName: string,
  subjects: CommandSubjects,
): Promise<void> {
  const [parent, copy] = cards;
  const list = await selectCommandCards(
    flow,
    parent.name,
    cards.map(({ name }) => name),
  );
  await list.getByRole("button", { name: CHARACTER_ACTIONS.tag.label, exact: true }).click();
  const dialog = flow.page.getByRole("dialog", { name: `Tag ${cards.length} characters`, exact: true });
  await dialog.getByRole("combobox", { name: "Tag name", exact: true }).fill(tagName);
  const submit = dialog.getByRole("button", { name: `Create "${tagName}"`, exact: true });
  await record(flow, "commands-bulk-tag-create", dialog, [submit]);
  await flow.action("characters-commands-bulk-tag", {
    action: async (): Promise<void> => {
      await submit.click();
    },
    ready: async (): Promise<void> => {
      await expect(dialog).toBeHidden();
      for (const card of cards) {
        await expect.poll(async () => (await flow.client.character.get.query({ characterId: card.id })).tags.map(({ name }) => name)).toContain(tagName);
      }
    },
  });
  const tag = (await flow.client.tag.listTagFilterVocabulary.query()).find(({ name }) => name === tagName);
  if (tag === undefined) {
    throw new Error("Native tagging persisted no named tag identity");
  }
  subjects.tags.add(tag.id);
  await list.getByRole("button", { name: "Select multiple", exact: true }).click();
  const form = await openCard(flow, copy.name);
  const chip = form.getByRole("button", { name: `Edit tag ${tagName}`, exact: true });
  await chip.scrollIntoViewIfNeeded();
  await record(flow, "commands-accepted-native-tag", form, [chip]);
  completedCommand(flow, "tag", `Native bulk tag creation attached ${tag.id} to ${cards.map(({ id }) => id).join(", ")}; the accepted card chip is rendered.`);
}

async function exportCommandCharacter(flow: CharacterFlow, card: SourceCharacter, tagName: string): Promise<void> {
  const detail = await flow.client.character.get.query({ characterId: card.id });
  for (const [index, format] of CHARACTER_ACTIONS.exportCard.formats.entries()) {
    const id = `commands-export-format-${index}`;
    expectSubject(flow, id, "download");
    const menu = await commandMenu(flow);
    const exportItem = menu.getByRole("menuitem", { name: CHARACTER_ACTIONS.exportCard.label, exact: true });
    await exportItem.focus();
    await exportItem.press("ArrowRight");
    const item = flow.page.getByRole("menuitem", { name: format.label, exact: true });
    await record(flow, `${id}-menu`, flow.page.getByRole("menu").filter({ has: item }), [item]);
    const pending = flow.page.waitForEvent("download");
    await item.click();
    const download = await pending;
    expect(await download.failure()).toBeNull();
    const url = new URL(download.url());
    expect(`${url.pathname}${url.search}`).toBe(`${EXPORT_CHARACTER_PATH}${card.id}${format.query}`);
    const path = await download.path();
    const bytes = await readFile(path);
    const png = format.query === "";
    expect(isPng(bytes)).toBe(png);
    const text = png ? await readCardChunk(bytes, "ccv3") : bytes.toString("utf8");
    if (text === null) {
      throw new Error("The downloaded PNG has no readable production card chunk");
    }
    const exported = characterCardV3Schema.parse(JSON.parse(text));
    expect(exported.data.name).toBe(card.name);
    expect(exported.data[CHARACTER_HANDLE_WIRE_KEY]).toBe(card.handle);
    expect(exported.data.description).toBe(detail.description);
    expect(exported.data.tags).toContain(tagName);
    await flow.info.attach(`characters-${id}`, { path, contentType: png ? "image/png" : "application/json" });
    flow.observations.push({
      id,
      kind: "download",
      disposition: "visited",
      reason: `${format.label}: native download decoded through the production codec/schema for ${card.id}.`,
    });
    await flow.page.keyboard.press("Escape");
    await flow.page.keyboard.press("Escape");
  }
  completedCommand(
    flow,
    "exportCard",
    "Every production export format completed a native download with matching persisted card identity, description and accepted tag.",
  );
}

async function archiveCommandCharacters(flow: CharacterFlow, parent: SourceCharacter, copy: SourceCharacter): Promise<void> {
  const library = await openList(flow);
  const disclosure = library.getByRole("button", { name: /show more filters/u });
  if (await disclosure.isVisible()) {
    await disclosure.click();
  }
  const archived = library.getByRole("button", { name: "Show archived characters", exact: true });
  if ((await archived.getAttribute("aria-pressed")) === "true") {
    await archived.click();
  }
  const list = await selectCommandCards(flow, parent.name, [parent.name, copy.name]);
  await flow.action("characters-commands-bulk-archive", {
    action: async (): Promise<void> => {
      await list.getByRole("button", { name: CHARACTER_ACTIONS.archive.label, exact: true }).click();
    },
    ready: async (): Promise<void> => {
      for (const card of [parent, copy]) {
        await expect.poll(async () => (await flow.client.character.get.query({ characterId: card.id })).archived).toBe(true);
        await expect(list.getByRole("checkbox", { name: `Select ${card.name}`, exact: true })).toHaveCount(0);
      }
    },
  });
  await archived.click();
  await list.getByRole("button", { name: "Select multiple", exact: true }).click();
  await openCard(flow, copy.name);
  const menu = await commandMenu(flow);
  const unarchiveLabel = CHARACTER_ACTIONS.archive.toggledLabel;
  if (unarchiveLabel === null) {
    throw new Error("The production archive action has no reverse label");
  }
  const unarchive = menu.getByRole("menuitem", { name: unarchiveLabel, exact: true });
  await record(flow, "commands-unarchive-menu", menu, [unarchive]);
  await flow.action("characters-commands-unarchive", {
    action: async (): Promise<void> => {
      await unarchive.click();
    },
    ready: async (): Promise<void> => {
      await expect.poll(async () => (await flow.client.character.get.query({ characterId: copy.id })).archived).toBe(false);
    },
  });
  const restoredMenu = await commandMenu(flow);
  await record(flow, "commands-archive-restored", restoredMenu, [restoredMenu.getByRole("menuitem", { name: CHARACTER_ACTIONS.archive.label, exact: true })]);
  await flow.page.keyboard.press("Escape");
  completedCommand(
    flow,
    "archive",
    "Native bulk archive hid both created subjects; the archived filter recovered them and native Unarchive restored the copy's state and menu label.",
  );
}

async function convertCommandCharacter(flow: CharacterFlow, card: SourceCharacter, subjects: CommandSubjects): Promise<void> {
  const menu = await commandMenu(flow);
  await flow.action("characters-commands-convert", {
    action: async (): Promise<void> => {
      await menu.getByRole("menuitem", { name: CHARACTER_ACTIONS.convertToPersona.label, exact: true }).click();
    },
    ready: async (): Promise<void> => {
      await expect.poll(async () => (await flow.client.persona.list.query()).filter((row) => row.metadata?.sourceCharacterId === card.id).length).toBe(1);
    },
  });
  const persona = (await flow.client.persona.list.query()).find((row) => row.metadata?.sourceCharacterId === card.id);
  if (persona === undefined) {
    throw new Error("Native conversion produced no persona with the source Character provenance");
  }
  subjects.personas.add(persona.id);
  expect(persona.name).toBe(card.name);
  expect(persona.metadata?.swapMacros).toBe(true);
  // Conversion stays in Characters; this documented follow-up starts a new document, outside the action window.
  await flow.page.goto("/config?to=personas");
  await waitForAppReady(flow.page);
  const content = flow.page.locator('[data-slot="config-content"]');
  const personaRow = content.getByRole("button", { name: persona.name, exact: true });
  await personaRow.scrollIntoViewIfNeeded();
  await personaRow.click();
  const editor = content.getByRole("group", { name: `Edit ${persona.name}`, exact: true });
  await expect(editor.getByRole("textbox", { name: "Name", exact: true })).toHaveValue(persona.name);
  await expect(editor.getByRole("textbox", { name: "Description", exact: true })).toHaveValue("A disposable native command witness for {{user}} and {{char}}.");
  await record(flow, "commands-converted-persona-destination", editor, [editor.getByText("From a character card", { exact: true })]);
  completedCommand(
    flow,
    "convertToPersona",
    `Native conversion minted ${persona.id} from ${card.id}; separate documented follow-up navigation rendered its persona editor and provenance.`,
  );
  const back = flow.page.getByRole("button", { name: "Back to Settings", exact: true });
  if (await back.isVisible()) {
    await back.click();
  }
  const characters = charactersRailButton(flow.page);
  if (await characters.isVisible()) {
    await characters.click();
  } else {
    await flow.page.getByRole("navigation", { name: "Primary", exact: true }).getByRole("button", { name: "You", exact: true }).click();
    const sheet = flow.page.getByRole("dialog");
    await sheet.getByRole("button", { name: CHARACTERS_SECTION_LABEL, exact: true }).click();
  }
  await expect(flow.page.getByRole("dialog")).toBeHidden();
  await expect(flow.page.locator(".shell-grid")).toHaveAttribute("data-section", "characters");
  await openCard(flow, card.name);
}

async function deleteCommandCharacters(flow: CharacterFlow, parent: SourceCharacter, copy: SourceCharacter, subjects: CommandSubjects): Promise<void> {
  await (await commandMenu(flow)).getByRole("menuitem", { name: CHARACTER_ACTIONS.delete.label, exact: true }).click();
  const single = flow.page.getByRole("alertdialog", { name: "Delete this character?", exact: true });
  await record(flow, "commands-delete-single-confirm", single, [single.getByRole("button", { name: CHARACTER_ACTIONS.delete.label, exact: true })]);
  await flow.action("characters-commands-delete-single", {
    action: async (): Promise<void> => {
      await single.getByRole("button", { name: CHARACTER_ACTIONS.delete.label, exact: true }).click();
    },
    ready: async (): Promise<void> => {
      await expect(single).toBeHidden();
      await expect.poll(async () => (await flow.client.character.list.query({ search: copy.name })).items.some(({ id }) => id === copy.id)).toBe(false);
      await expect(flow.page.getByRole("form", { name: EDITOR_NAME, exact: true })).toHaveCount(0);
    },
  });
  subjects.nativeDeleted.add(copy.id);
  const list = await selectCommandCards(flow, parent.name, [parent.name]);
  await list.getByRole("button", { name: CHARACTER_ACTIONS.delete.label, exact: true }).click();
  const bulk = flow.page.getByRole("alertdialog", { name: "Delete 1 character?", exact: true });
  const confirm = bulk.getByRole("button", { name: CHARACTER_ACTIONS.delete.label, exact: true });
  await record(flow, "commands-delete-bulk-confirm", bulk, [confirm]);
  await flow.action("characters-commands-delete-bulk", {
    action: async (): Promise<void> => {
      await confirm.click();
    },
    ready: async (): Promise<void> => {
      await expect(bulk).toBeHidden();
      await expect.poll(async () => (await flow.client.character.list.query({ search: parent.name })).items.some(({ id }) => id === parent.id)).toBe(false);
      await expect(list.getByRole("checkbox", { name: `Select ${parent.name}`, exact: true })).toHaveCount(0);
    },
  });
  subjects.nativeDeleted.add(parent.id);
  completedCommand(
    flow,
    "delete",
    `Native single and bulk confirmations removed ${copy.id} and ${parent.id}; the selected editor and corresponding library rows disappeared.`,
  );
}

async function cleanupCommandSubjects(
  flow: CharacterFlow,
  subjects: CommandSubjects,
  { name, copyName, tagName }: { readonly name: string; readonly copyName: string; readonly tagName: string },
): Promise<void> {
  // Recover IDs even when a native write finished before its readiness assertion failed.
  const survivingCharacters = new Set<CharacterId>();
  for (const row of (await flow.client.character.list.query({ search: name })).items) {
    if (row.name === name || row.name === copyName) {
      subjects.characters.add(row.id);
      survivingCharacters.add(row.id);
    }
  }
  for (const row of await flow.client.persona.list.query()) {
    if (row.metadata?.sourceCharacterId !== undefined && subjects.characters.has(row.metadata.sourceCharacterId)) {
      subjects.personas.add(row.id);
    }
  }
  for (const row of await flow.client.tag.listTagFilterVocabulary.query()) {
    if (row.name === tagName) {
      subjects.tags.add(row.id);
    }
  }
  await attachNativeFile(flow.info, flow.info, "characters-command-subjects", {
    body: JSON.stringify({
      characters: [...subjects.characters],
      personas: [...subjects.personas],
      tags: [...subjects.tags],
      nativeDeleted: [...subjects.nativeDeleted],
      setup: "native UI create",
      cleanup: "production HTTP verbs only for tracked created subjects; not native command completion",
    }),
    contentType: "application/json",
  });
  const cleanup = await Promise.allSettled([
    ...[...subjects.personas].map(async (personaId): Promise<void> => {
      await flow.client.persona.remove.mutate({ personaId });
    }),
    ...[...survivingCharacters].map(async (characterId): Promise<void> => {
      await flow.client.character.remove.mutate({ characterId });
    }),
    ...[...subjects.tags].map(async (tagId): Promise<void> => {
      await flow.client.tag.removeTag.mutate({ tagId });
    }),
  ]);
  const failures = cleanup.filter((result) => result.status === "rejected");
  if (failures.length > 0) {
    throw new AggregateError(
      failures.map((result) => result.reason),
      "Disposable Character command cleanup failed",
    );
  }
}

async function commandsJourney(flow: CharacterFlow): Promise<void> {
  const name = `Surface commands ${flow.info.project.name.slice(0, 35)} ${flow.info.testId.slice(-8)}`;
  const copyName = `${name} copy`;
  const tagName = `${name} label`;
  const subjects: CommandSubjects = { characters: new Set(), personas: new Set(), tags: new Set(), nativeDeleted: new Set() };
  for (const id of COMMAND_ACTION_IDS) {
    expectSubject(flow, id, "action");
  }
  expect((await flow.client.character.list.query({ search: name })).items).toHaveLength(0);
  expect((await flow.client.tag.listTagFilterVocabulary.query()).some((tag) => tag.name === tagName)).toBe(false);
  try {
    const parent = await createCommandCharacter(flow, name, subjects);
    const copy = await duplicateCommandCharacter(flow, parent, copyName, subjects);
    await tagCommandCharacters(flow, [parent, copy], tagName, subjects);
    await exportCommandCharacter(flow, copy, tagName);
    await archiveCommandCharacters(flow, parent, copy);
    await convertCommandCharacter(flow, copy, subjects);
    await deleteCommandCharacters(flow, parent, copy, subjects);
  } finally {
    await cleanupCommandSubjects(flow, subjects, { name, copyName, tagName });
  }
}

type DisposableArea = Exclude<CharacterWalkArea, "library" | "source-context" | "commands">;

async function disposableArea(flow: CharacterFlow, area: DisposableArea, original: SourceCharacter): Promise<void> {
  await withDisposableCharacter(flow, original, async ({ id, name, form }): Promise<void> => {
    const journeys: Record<DisposableArea, () => Promise<void>> = {
      editor: async (): Promise<void> => {
        for (const facet of CHARACTER_CARD_FACETS) {
          expectSubject(flow, facet.id, "facet");
        }
        await tagsJourney(flow, form, id);
        await greetingJourney(flow, form);
        await facetJourney(flow, form);
      },
      greeting: async (): Promise<void> => {
        await greetingGenerationJourney(flow, form, id, original.id);
      },
      relations: async (): Promise<void> => {
        const overview = await contextTab(flow, "Overview");
        await record(flow, "overview-resting", overview, [overview.getByRole("group", { name: "Source", exact: true })]);
        const chats = await contextTab(flow, "Chats");
        await recordState(flow, "chats-empty-copy", chats, { witnesses: [chats.getByRole("button", { name: "New chat", exact: true })], state: "empty" });
        await relationsJourney(flow, id);
      },
      look: async (): Promise<void> => {
        await lookJourney(flow, id);
      },
      history: async (): Promise<void> => {
        await historyJourney(flow, id);
      },
      "history-recovery": async (): Promise<void> => {
        await flow.client.character.snapshot.mutate({ characterId: id, label: "Surface recovery control" });
        await historyFailureJourney(flow, name);
      },
      "look-recovery": async (): Promise<void> => {
        await lookFailureJourney(flow, id);
      },
      "trust-actions": async (): Promise<void> => {
        for (const action of Object.keys(ACTION_DISPOSITIONS) as (keyof typeof ACTION_DISPOSITIONS)[]) {
          expectSubject(flow, action, "action");
          flow.observations.push({ id: action, kind: "action", ...ACTION_DISPOSITIONS[action] });
        }
        await trustJourney(flow);
        expectSubject(flow, "openGallery", "action");
        await actionsJourney(flow, id);
        await rowAndBulkJourney(flow, name);
      },
      "library-recovery": async (): Promise<void> => {
        await recoveryJourney(flow, name);
      },
    };
    await journeys[area]();
  });
}

/** Run one independently collected Character scope against source provenance and disposable writes. */
export async function walkCharacterArea(input: SurfaceFlow, area: CharacterWalkArea): Promise<void> {
  const flow: CharacterFlow = { ...input, area, expected: new Map(), observations: [], provenance: {} };
  expectSubject(flow, area, "area");
  try {
    const original = await sourceCharacter(flow);
    flow.provenance.original = original.id;
    const rowName = original.nameIsAmbiguous ? `${original.name} · ${original.handle}` : original.name;
    if (area === "library") {
      await listJourney(flow, original.name, rowName);
      await creationDialogs(flow);
      await createRefusalJourney(flow);
    } else if (area === "source-context") {
      const form = await openCard(flow, original.name, rowName);
      await record(flow, "original-source-editor", form, [form.getByRole("textbox", { name: "Name", exact: true })]);
      await originalContextJourney(flow, original.id);
    } else if (area === "commands") {
      await commandsJourney(flow);
    } else {
      await disposableArea(flow, area, original);
    }
    flow.observations.push({ id: area, kind: "area", disposition: "visited" });
  } catch (error) {
    flow.observations.push({ id: area, kind: "area", disposition: "failed", reason: error instanceof Error ? error.message : String(error) });
    throw error;
  } finally {
    const inventory = { name: `Characters ${area}`, expected: [...flow.expected.values()], observations: flow.observations };
    await attachNativeFile(flow.info, flow.info, "characters-itinerary-boundary", {
      body: JSON.stringify(
        {
          ...inventory,
          provenance: flow.provenance,
          originalMutations: "excluded",
          externalExecution: area === "greeting" ? "run-owned bounded text peer for native Greeting Studio only" : "not requested",
          unexercisedActions: UNEXERCISED_ACTIONS,
        },
        null,
        2,
      ),
      contentType: "application/json",
    });
    await publishSurfaceInventory(flow.info, inventory);
  }
}
