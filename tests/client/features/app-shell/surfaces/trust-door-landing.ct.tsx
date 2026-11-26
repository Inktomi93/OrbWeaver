// The two doors the row notice offers land on the control they name: the Trust door shows its tab whole in the strip and moves
// focus to the HTML-rendering ladder; the admin door scrolls to the install's internet-media setting and focuses it.
// Production entry: the AppShell, entered through the same `openCharacterTrust` and `openConfigTo` calls the notice's controls make.
import { CHARACTER_TRUST_BLOCK_LABEL, contextToggleLabel, LOAD_INTERNET_MEDIA_LABEL } from "@orb/client/lib";
import { createCharacterSchema } from "@orb/contracts/character";
import type { CharacterId } from "@orb/kit/ids";
import { seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, routeAuthConfig, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { CHARACTER_HTML_TRUST_LABEL, CHARACTER_TRUST_TAB_LABEL } from "#client/features/character/lib/character-names.ts";
import type { TrustDoorsShellStory } from "../_surface-stories.tsx";

const STORY = "tests/client/features/app-shell/_surface-stories/TrustDoorsShellStory";
// The window events the story presses its doors on.
const TRUST_DOOR_EVENTS = { trust: "trust-door-open-trust", admin: "trust-door-open-admin" } as const;
const CARD_NAME = "The door courier";
const PROCEDURES = [
  ...SECTION_PROCEDURES,
  "tag.listTagFilterVocabulary",
  "character.update",
  "settings.getAppSettingsWithOverrides",
  "admin.listUsers",
  "share.status",
  "share.signInMode",
] as const;
const CONTEXT = '.shell-panel[data-panel-side="context"]';
const STRIP = '[data-slot="context-tab-strip"]';
const OVERFLOW_TRIGGER = '[data-slot="context-tab-overflow-trigger"]';

test.use({ viewport: { width: 1440, height: 900 } });

async function mountDoors(scene: {
  readonly corpus: Parameters<typeof createShellAmbientReads>[0];
  readonly page: Page;
  readonly root: Awaited<ReturnType<typeof createCorpusHarness>>;
  readonly mountStory: (characterId: CharacterId) => Promise<unknown>;
}): Promise<void> {
  const { corpus, page, root, mountStory } = scene;
  const caller = await root.internalCallerFor(root.ownerId);
  const card = await caller.character.create({
    input: createCharacterSchema.parse({ handle: "door-courier", name: CARD_NAME, description: "A courier the doors open." }),
  });
  await routeAuthConfig(page, { ...corpus.auth.signedInConfig, forbidExternalMedia: true });
  await seedShellState(page, { activeSection: "characters", panelOverrides: { characters: { list: "docked", context: "collapsed" } } });
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, PROCEDURES),
    "stream.attach": ({ ref }) => (ref.channel === "user" ? null : trpcError({ code: "NOT_FOUND" })),
    "stream.detach": ({ ref }) => (ref.channel === "user" ? null : trpcError({ code: "NOT_FOUND" })),
  });
  await mountStory(card.id);
}

test("the Trust door shows its tab whole in the strip and focuses the ladder", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness(undefined, { startJobs: false });
  await mountDoors({ corpus, page, root, mountStory: (characterId) => mount<typeof TrustDoorsShellStory>(STORY, { characterId, events: TRUST_DOOR_EVENTS }) });
  await page.evaluate((name) => globalThis.dispatchEvent(new Event(name)), TRUST_DOOR_EVENTS.trust);
  const context = page.locator(CONTEXT);
  const tab = context.getByRole("tab", { name: CHARACTER_TRUST_TAB_LABEL, exact: true });
  await expect(tab).toHaveAttribute("aria-selected", "true");
  // Positive control: the strip overflows here, so the control that hides a tab is drawn.
  const overflow = context.locator(OVERFLOW_TRIGGER);
  await expect(overflow).toBeVisible();
  await expect
    .poll(async () => {
      const [tabBox, overflowBox, stripBox] = await Promise.all([tab.boundingBox(), overflow.boundingBox(), context.locator(STRIP).boundingBox()]);
      if (tabBox === null || overflowBox === null || stripBox === null) {
        return false;
      }
      return tabBox.x >= stripBox.x && tabBox.x + tabBox.width <= overflowBox.x + 1;
    })
    .toBe(true);
  await expect(context.getByRole("heading", { name: CHARACTER_TRUST_BLOCK_LABEL, exact: true })).toBeVisible();
  await expect(context.getByRole("combobox", { name: CHARACTER_HTML_TRUST_LABEL, exact: true })).toBeFocused();
});

test("the Trust door lands on the ladder again after the panel was closed with the tab still mounted", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness(undefined, { startJobs: false });
  await mountDoors({ corpus, page, root, mountStory: (characterId) => mount<typeof TrustDoorsShellStory>(STORY, { characterId, events: TRUST_DOOR_EVENTS }) });
  const context = page.locator(CONTEXT);
  const ladder = context.getByRole("combobox", { name: CHARACTER_HTML_TRUST_LABEL, exact: true });
  await page.evaluate((name) => globalThis.dispatchEvent(new Event(name)), TRUST_DOOR_EVENTS.trust);
  await expect(ladder).toBeFocused();
  await page.getByRole("button", { name: contextToggleLabel(false), exact: true }).click();
  await expect(context).toHaveAttribute("data-panel-mode", "collapsed");
  // Positive control: the closed panel keeps its Trust body mounted, so the door's request reaches a ladder that cannot take focus yet.
  const closedLadder = context.getByRole("combobox", { name: CHARACTER_HTML_TRUST_LABEL, exact: true, includeHidden: true });
  await expect(closedLadder).toHaveCount(1);
  await expect(closedLadder).not.toBeFocused();

  await page.evaluate((name) => globalThis.dispatchEvent(new Event(name)), TRUST_DOOR_EVENTS.trust);

  await expect(context).toHaveAttribute("data-panel-mode", "docked");
  await expect(ladder).toBeFocused();
});

test("the admin door scrolls to the install's internet-media setting and focuses it", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness(undefined, { startJobs: false });
  await mountDoors({ corpus, page, root, mountStory: (characterId) => mount<typeof TrustDoorsShellStory>(STORY, { characterId, events: TRUST_DOOR_EVENTS }) });
  await page.evaluate((name) => globalThis.dispatchEvent(new Event(name)), TRUST_DOOR_EVENTS.admin);
  const setting = page.getByRole("switch", { name: LOAD_INTERNET_MEDIA_LABEL, exact: true });
  await expect(setting).toBeFocused();
  await expect(setting).toBeInViewport({ ratio: 1 });
});
