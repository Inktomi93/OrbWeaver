// A bulk delete the server refuses for one card tells the reader which card stayed: the other cards are gone from the library, the notice names
// the card that stayed and why, and that card is still selected so the bar keeps counting it. The shell, the library list, the bulk bar and the
// delete are the production ones over a first-boot root; the refusal is a storage trigger that aborts the one card's delete, so the server's own
// per-card catch is what returns the split the bar reads.
// @subject packages/client/src/features/character/components/character-bulk-bar.tsx
import { createCharacterSchema } from "@orb/contracts/character";
import { characters } from "@orb/db";
import type { CharacterId } from "@orb/kit/ids";
import type { ShellBusStory } from "@orb/testkit/browser";
import { seedShellState } from "@orb/testkit/browser/spec";
import { noticeToast, routeAuthConfig, routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createFirstBootHarness, refuseWrites } from "@orb/testkit/node/composed";
import { selectActionName } from "@orb/ui/lib";
import type { Locator } from "@playwright/test";
import { CHARACTER_ACTIONS } from "#client/features/character/lib/character-actions.ts";
import { CHARACTER_LIBRARY_NAME, CHARACTER_SELECT_MULTIPLE_NAME, characterBulkDeleteTitle } from "#client/features/character/lib/character-names.ts";
import { characterBulkRemoveRefusal } from "#client/features/character/lib/character-refusal-notice.ts";
import { selectionCountLabel } from "#ui/primitives/selection-bar/selection-bar-names.ts";
import { forwardUserEvent } from "../../../components/_forward-user-event.ts";

const STORY = "tests/support/browser/ct-shell-reads-stories/ShellBusStory";
const NAMES = ["Anselm of the Vale", "Branwen the Quiet", "Corvin Ashdown"] as const;
const REFUSED_NAME = NAMES[1];
const FAULT_MESSAGE = "this card's delete is refused";

test.use({ viewport: { width: 1440, height: 1000 } });

test("a bulk delete refused for one card leaves that card selected and names it and the reason, while the others are deleted", async ({
  page,
  corpus,
  mount,
}) => {
  await using root = await createFirstBootHarness();
  await using cleanup = new AsyncDisposableStack();
  const caller = await root.internalCallerFor(root.ownerId);
  const cards: { readonly id: CharacterId; readonly name: string }[] = [];
  for (const name of NAMES) {
    const card = await caller.character.create({
      input: createCharacterSchema.parse({ handle: name.toLowerCase().replaceAll(" ", "-"), name, description: "A neighbour in the list." }),
    });
    cards.push({ id: card.id, name });
  }
  const refused = cards.find(({ name }) => name === REFUSED_NAME);
  if (refused === undefined) {
    throw new Error("The case seeded no card to refuse");
  }
  const deleted = cards.filter((card) => card !== refused);
  await using _refusal = await refuseWrites(root.db, { table: characters, event: "DELETE", message: FAULT_MESSAGE, when: `OLD.id = '${refused.id}'` });
  await routeAuthConfig(page, corpus.auth.signedInConfig);
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...SHELL_MOUNT_PROCEDURES, "character.bulkRemove"]),
    "stream.attach": ({ ref }) => (ref.channel === "user" ? null : trpcError({ code: "NOT_FOUND" })),
    "stream.detach": ({ ref }) => (ref.channel === "user" ? null : trpcError({ code: "NOT_FOUND" })),
  });
  await forwardUserEvent(page, root, "charactersChanged", cleanup);
  await seedShellState(page, { activeSection: "characters", panelOverrides: { characters: { list: "docked", context: "collapsed" } } });
  await mount<typeof ShellBusStory>(STORY, {});

  const library = page.getByRole("list", { name: CHARACTER_LIBRARY_NAME, exact: true });
  await page.getByRole("button", { name: CHARACTER_SELECT_MULTIPLE_NAME, exact: true }).click();
  const pick = (name: string): Locator => library.getByRole("checkbox", { name: selectActionName(name), exact: true });
  for (const { name } of cards) {
    await pick(name).check();
  }
  const bar = page.locator('[data-slot="selection-bar-root"]');
  await expect(bar.locator('[data-slot="selection-bar-count"]')).toHaveText(selectionCountLabel(cards.length));

  await bar.getByRole("button", { name: CHARACTER_ACTIONS.delete.label, exact: true }).click();
  await page
    .getByRole("alertdialog", { name: characterBulkDeleteTitle(cards.length), exact: true })
    .getByRole("button", { name: CHARACTER_ACTIONS.delete.label, exact: true })
    .click();

  // The title is the production mapper's over the split the verb returns: two deleted, one refused.
  const notice = characterBulkRemoveRefusal(
    { applied: deleted.map(({ id }) => id), failed: [{ characterId: refused.id, error: { message: FAULT_MESSAGE } }] },
    () => undefined,
  );
  if (notice === null) {
    throw new Error("A refused card must raise a notice");
  }
  const toast = noticeToast(page, { title: notice.title });
  await expect(toast).toBeVisible();
  await expect(toast).toContainText(REFUSED_NAME);
  await expect(toast).toContainText(FAULT_MESSAGE);
  // The cards the verb deleted left the library; the refused one is the control that the list is still showing, and it is still selected.
  for (const { name } of deleted) {
    await expect(pick(name)).toHaveCount(0);
  }
  await expect(pick(REFUSED_NAME)).toBeChecked();
  await expect(bar.locator('[data-slot="selection-bar-count"]')).toHaveText(selectionCountLabel(1));
});
