import { createCharacterSchema } from "@orb/contracts/character";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { actionGroupGeometry, resolvedLength } from "@orb/testkit/browser/spec";
import { holdServed, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { ENLARGED_APPEARANCE_SETTINGS } from "@orb/testkit/iso";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusHarness,
  createCorpusProviderExecution,
} from "@orb/testkit/node/composed";
import type { Locator } from "@playwright/test";
import type { CharacterRemainingActionsStory } from "./_remaining-action-groups-stories.tsx";

const STORY = "tests/client/features/character/components/_remaining-action-groups-stories/CharacterRemainingActionsStory";
const ORIGINAL_OPENING = "The archivist opens the door and waits for your answer.";
const GENERATED_OPENING = "The archivist lowers the lantern. A new visitor has reached the archive.";
const CARD_NAME = "The action-group archivist";
const REGIMES = [
  { name: "wide desktop", width: 960, viewport: { width: 1280, height: 900 }, coarse: false, appearance: appearanceSettingsSchema.parse({}) },
  { name: "narrow desktop enlarged", width: 300, viewport: { width: 1280, height: 900 }, coarse: false, appearance: ENLARGED_APPEARANCE_SETTINGS },
  { name: "phone portrait enlarged", width: 390, viewport: { width: 390, height: 844 }, coarse: true, appearance: ENLARGED_APPEARANCE_SETTINGS },
  { name: "phone landscape enlarged", width: 844, viewport: { width: 844, height: 390 }, coarse: true, appearance: ENLARGED_APPEARANCE_SETTINGS },
] as const;

async function expectContained(group: Locator, controls: readonly Locator[]): Promise<void> {
  const geometry = await actionGroupGeometry(group, controls);
  expect(geometry.inlineOverflow).toBeLessThanOrEqual(1);
  const host = group.page().getByRole("group", { name: "Character remaining-action host", exact: true });
  expect((await actionGroupGeometry(host, controls)).inlineOverflow).toBeLessThanOrEqual(1);
  const floor = await resolvedLength(group.page(), "var(--size-control-sm)", group);
  for (const box of geometry.controls) {
    expect(box.height).toBeGreaterThanOrEqual(floor);
  }
}

function characterInput(): ReturnType<typeof createCharacterSchema.parse> {
  return createCharacterSchema.parse({
    handle: "action-group-archivist",
    name: CARD_NAME,
    description: "An archivist keeps the lamps lit.",
    greetings: [{ text: ORIGINAL_OPENING }],
  });
}

for (const regime of REGIMES) {
  test.describe(regime.name, () => {
    test.use({ viewport: regime.viewport, isMobile: regime.coarse, hasTouch: regime.coarse });
    test("landing New character and Import a card fit and cancellation returns focus", async ({ mount, page, corpusMedia }) => {
      await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark", forcedColors: "none" });
      await using root = await createCorpusHarness(undefined, { startJobs: false });
      const caller = await root.internalCallerFor(root.ownerId);
      const card = await caller.character.create({ input: characterInput() });
      await routeTrpc(page, serveCorpusProcedures(caller, ["sessions.me", "settings.getUserSettings", "character.list"]));
      await corpusMedia();
      await mount<typeof CharacterRemainingActionsStory>(STORY, { characterId: card.id, plane: "landing", width: regime.width, appearance: regime.appearance });
      const create = page.getByRole("button", { name: "New character", exact: true });
      const importCard = page.getByRole("button", { name: "Import a card", exact: true });
      await expectContained(create.locator(".."), [create, importCard]);
      await create.focus();
      await page.keyboard.press("Enter");
      const createDialog = page.getByRole("dialog", { name: "New character", exact: true });
      await expect(createDialog.getByRole("textbox", { name: "Character name", exact: true })).toBeVisible();
      await createDialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(createDialog).toBeHidden();
      await expect(create).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(importCard).toBeFocused();
      await page.keyboard.press("Enter");
      const importDialog = page.getByRole("dialog", { name: "Import a character card", exact: true });
      await expect(importDialog).toBeVisible();
      await importDialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(importDialog).toBeHidden();
      await expect(importCard).toBeFocused();
    });

    test("combined empty-search recovery keeps Clear search and Clear filters reachable", async ({ mount, page, corpusMedia }) => {
      await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark", forcedColors: "none" });
      await using root = await createCorpusHarness(undefined, { startJobs: false });
      const caller = await root.internalCallerFor(root.ownerId);
      const card = await caller.character.create({ input: characterInput() });
      await routeTrpc(page, serveCorpusProcedures(caller, ["sessions.me", "settings.getUserSettings", "character.list", "tag.listTagFilterVocabulary"]));
      await corpusMedia();
      await mount<typeof CharacterRemainingActionsStory>(STORY, { characterId: card.id, plane: "library", width: regime.width, appearance: regime.appearance });
      const empty = page.locator('[data-slot="empty-state-root"]').filter({ has: page.getByText("No matches", { exact: true }) });
      const search = empty.getByRole("button", { name: "Clear search", exact: true });
      const filters = empty.getByRole("button", { name: "Clear filters", exact: true });
      await expectContained(search.locator(".."), [search, filters]);
      await search.focus();
      await page.keyboard.press("Tab");
      await expect(filters).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(filters).toHaveCount(0);
      await expect(search).toBeVisible();
      await search.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("textbox", { name: "Search characters", exact: true })).toHaveValue("");
      const recovered = await caller.character.list({ archived: false, limit: 1, sort: "recent" });
      const first = recovered.items[0];
      if (first === undefined) {
        throw new Error("The recovery fixture has no character to display");
      }
      const library = page.getByRole("list", { name: "Character library", exact: true });
      await expect(library.getByRole("listitem").first().getByRole("button", { name: first.name, exact: true })).toBeVisible();
    });

    test("greeting ready, pending and preview action groups fit without committing a discarded rewrite", async ({ mount, page, corpus, corpusMedia }) => {
      await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark", forcedColors: "none" });
      const provider = createCorpusProviderExecution({
        modelIds: [CORPUS_TEXT_MODEL, CORPUS_EMBED_MODEL],
        embedding: CORPUS_EMBEDDING_VECTOR,
        chatText: GENERATED_OPENING,
        structuredReplies: CORPUS_STRUCTURED_REPLIES,
        images: [],
      });
      await using root = await createCorpusHarness(undefined, { startJobs: false, providerFetch: provider.execute });
      const caller = await root.internalCallerFor(root.ownerId);
      const card = await caller.character.create({ input: characterInput() });
      const connection = (await caller.connection.list()).find((item) => item.model === CORPUS_TEXT_MODEL);
      if (connection === undefined) {
        throw new Error("The corpus has no greeting completion connection");
      }
      await caller.connection.setBinding({ task: "summarize", connectionId: connection.id });
      await page.route("**/api/auth/config", (route) => route.fulfill({ json: corpus.auth.signedInConfig }));
      const generation = holdServed();
      await routeTrpc(page, {
        ...serveCorpusProcedures(caller, [
          "sessions.me",
          "settings.getUserSettings",
          "character.get",
          "character.update",
          "preset.get",
          "chat.listChats",
          "regex.listForCharacter",
          "tag.listPendingSuggestions",
        ]),
        ...serveCorpusProcedures(caller, ["character.rewriteGreeting"], () => generation),
      });
      await corpusMedia();
      await mount<typeof CharacterRemainingActionsStory>(STORY, { characterId: card.id, plane: "editor", width: regime.width, appearance: regime.appearance });
      // eslint-disable-next-line orb/no-hand-copied-label -- CharacterGreetingPreview labels this control directly; TEMPLATE_KIND_LABEL.studio names a different preset group.
      await page.getByRole("button", { name: "Studio", exact: true }).click();
      const makeNew = page.getByRole("button", { name: "Make new", exact: true });
      const rewrite = page.getByRole("button", { name: "Rewrite", exact: true });
      await expectContained(makeNew.locator(".."), [makeNew, rewrite]);
      await makeNew.focus();
      await page.keyboard.press("Tab");
      await expect(rewrite).toBeFocused();
      await page.keyboard.press("Enter");
      await generation.requested;
      try {
        await expect(rewrite).toBeDisabled();
        await expect(makeNew).toBeDisabled();
        await expectContained(makeNew.locator(".."), [makeNew, rewrite]);
      } finally {
        generation.release();
      }
      const preview = page.locator('[data-slot="greeting-studio-preview"]');
      await expect(preview.getByText(GENERATED_OPENING, { exact: true })).toBeVisible();
      const discard = preview.getByRole("button", { name: "Discard", exact: true });
      const accept = preview.getByRole("button", { name: "Accept", exact: true });
      await expectContained(discard.locator(".."), [discard, accept]);
      await discard.focus();
      await page.keyboard.press("Tab");
      await expect(accept).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Enter");
      await expect(preview).toHaveCount(0);
      await expect(rewrite).toBeFocused();
      expect((await caller.character.get({ characterId: card.id })).greetings.map((greeting) => greeting.text)).toEqual([ORIGINAL_OPENING]);
    });
  });
}
