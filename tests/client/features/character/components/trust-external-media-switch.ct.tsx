// The character Trust tab's external-media control is one switch: on stores a block, off clears the override rather
// than storing an "allow" the tighten-only resolver ignores, and under an install-wide block it is locked on and says why.
// Production entry: the AppShell's Characters section, its context panel's Trust tab.
import { contextToggleLabel } from "@orb/client/lib";
import { createCharacterSchema } from "@orb/contracts/character";
import type { ShellBusStory } from "@orb/testkit/browser";
import { seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, routeAuthConfig, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusPlayback } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import { CHARACTER_SEARCH_NAME } from "#client/components/shared-control-names.ts";
import {
  CHARACTER_BLOCK_EXTERNAL_MEDIA_LABEL,
  CHARACTER_EDITOR_NAME,
  CHARACTER_HERO_NAME_FIELD_NAME,
  CHARACTER_LIBRARY_NAME,
  CHARACTER_TRUST_TAB_LABEL,
} from "#client/features/character/lib/character-names.ts";
import { forwardUserEvent } from "../../../components/_forward-user-event.ts";

const STORY = "tests/support/browser/ct-shell-reads-stories/ShellBusStory";
const CARD_NAME = "The trust switch courier";
const PROCEDURES = [...SECTION_PROCEDURES, "tag.listTagFilterVocabulary", "character.update"] as const;
const CONTEXT = '.shell-panel[data-panel-side="context"]';

test.use({ viewport: { width: 1440, height: 900 } });

interface TrustCase {
  readonly control: Locator;
  readonly stored: () => Promise<boolean | null>;
}

/**
 * Open the card's Trust tab through the shell, under an install that does or does not block external media. The card starts
 * with `stored` as its override, and the real server's one `charactersChanged` event for the next write is forwarded to the
 * page, which is what refreshes the switch's read.
 */
async function openTrust(scene: {
  readonly corpus: CorpusPlayback;
  readonly page: Page;
  readonly root: Awaited<ReturnType<typeof createCorpusHarness>>;
  readonly cleanup: AsyncDisposableStack;
  readonly mountShell: () => Promise<unknown>;
  readonly installBlocks: boolean;
  readonly stored: boolean | null;
}): Promise<TrustCase> {
  const { corpus, page, root, cleanup, mountShell, installBlocks, stored } = scene;
  const caller = await root.internalCallerFor(root.ownerId);
  const card = await caller.character.create({
    input: createCharacterSchema.parse({ handle: "trust-switch-courier", name: CARD_NAME, description: "A courier whose media trust is set per card." }),
  });
  await caller.character.update({ characterId: card.id, input: { forbidExternalMedia: stored } });
  await routeAuthConfig(page, { ...corpus.auth.signedInConfig, forbidExternalMedia: installBlocks });
  await seedShellState(page, { activeSection: "characters", panelOverrides: { characters: { list: "docked", context: "collapsed" } } });
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, PROCEDURES),
    "stream.attach": ({ ref }) => (ref.channel === "user" ? null : trpcError({ code: "NOT_FOUND" })),
    "stream.detach": ({ ref }) => (ref.channel === "user" ? null : trpcError({ code: "NOT_FOUND" })),
  });
  await forwardUserEvent(page, root, "charactersChanged", cleanup);
  await mountShell();
  await page.getByRole("textbox", { name: CHARACTER_SEARCH_NAME, exact: true }).fill(CARD_NAME);
  await page.getByRole("list", { name: CHARACTER_LIBRARY_NAME, exact: true }).getByRole("button", { name: CARD_NAME, exact: true }).click();
  await expect(
    page.getByRole("form", { name: CHARACTER_EDITOR_NAME, exact: true }).getByRole("textbox", { name: CHARACTER_HERO_NAME_FIELD_NAME, exact: true }),
  ).toHaveValue(CARD_NAME);
  const context = page.locator(CONTEXT);
  await page.getByRole("button", { name: contextToggleLabel(true), exact: true }).click();
  await context.getByRole("tab", { name: CHARACTER_TRUST_TAB_LABEL, exact: true }).click();
  return {
    control: context.getByRole("switch", { name: CHARACTER_BLOCK_EXTERNAL_MEDIA_LABEL, exact: true }),
    stored: async (): Promise<boolean | null> => (await caller.character.get({ characterId: card.id })).forbidExternalMedia,
  };
}

test("turning the switch on stores a block", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness(undefined, { startJobs: false });
  await using cleanup = new AsyncDisposableStack();
  const mountShell = (): Promise<unknown> => mount<typeof ShellBusStory>(STORY, {});
  const { control, stored } = await openTrust({ corpus, page, root, cleanup, mountShell, installBlocks: false, stored: null });
  await expect(control).toHaveAttribute("aria-checked", "false");
  await control.click();
  await expect.poll(stored).toBe(true);
  await expect(control).toHaveAttribute("aria-checked", "true");
});

test("turning the switch off clears the override rather than storing an allow", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness(undefined, { startJobs: false });
  await using cleanup = new AsyncDisposableStack();
  const mountShell = (): Promise<unknown> => mount<typeof ShellBusStory>(STORY, {});
  const { control, stored } = await openTrust({ corpus, page, root, cleanup, mountShell, installBlocks: false, stored: true });
  await expect(control).toHaveAttribute("aria-checked", "true");
  await control.click();
  // A stored `false` would read the same as no override and leave a dead choice behind.
  await expect.poll(stored).toBeNull();
  await expect(control).toHaveAttribute("aria-checked", "false");
});

test("under an install-wide block the switch is locked on and writes nothing", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness(undefined, { startJobs: false });
  await using cleanup = new AsyncDisposableStack();
  const mountShell = (): Promise<unknown> => mount<typeof ShellBusStory>(STORY, {});
  const { control, stored } = await openTrust({ corpus, page, root, cleanup, mountShell, installBlocks: true, stored: null });
  await expect(control).toHaveAttribute("aria-checked", "true");
  await expect(control).toBeDisabled();
  expect(await stored()).toBeNull();
});
