// What the host reads off the game's own tabs: every hidden span by turn behind the Status ledger's disclosure, and
// how each mark was made. Hidden spans come from a real card greeting and marks from the real verb.
import { createCharacterSchema } from "@orb/contracts/character";
import { HIDDEN_TAGS } from "@orb/kit/content";
import type { ChatId } from "@orb/kit/ids";
import { routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness, seedRpgGame } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import type { RpgContextTabStory } from "./_own-key-panels-stories.tsx";

const TAB_STORY = "tests/client/features/rpg/components/_own-key-panels-stories/RpgContextTabStory";
const TRUTH = "the-ledger-burned";
const UNSEEN = "a-footstep-behind-the-door";
const LIE_GREETING = `The loom is quiet. <lie character="Warden" type="secret" truth="${TRUTH}" reason="Protect the ledger"/>`;
const UNSEEN_GREETING = `The loom is quiet. <ofilter event="${UNSEEN}" reason="Nobody turned around"/> <lie/>`;

function revealLabel(tag: string): string {
  const label = HIDDEN_TAGS.find((def) => def.tag === tag)?.revealLabel;
  if (label === undefined) {
    throw new Error(`no hidden tag ${tag}`);
  }
  return label;
}

/** A game whose opening carries `greeting`, with every read its tabs make served to `page`. */
async function mountRoom(root: Awaited<ReturnType<typeof createCorpusHarness>>, page: Page, greeting: string): Promise<ChatId> {
  const caller = await root.internalCallerFor(root.ownerId);
  const character = await caller.character.create({
    input: createCharacterSchema.parse({ handle: "ct-warden", name: "Warden", description: "Keeps the ledger.", greetings: [{ text: greeting }] }),
  });
  const chatId = (await caller.chat.startChat({ characterIds: [character.id], opening: "first-message" })).chat.id;
  await seedRpgGame(root, { principal: await root.principalFor(root.ownerId), chatId, mode: "lite" });
  expect(await caller.rpg.editSnapshot({ chatId, patch: { location: "The gate" } })).toEqual({ ok: true });
  await caller.rpg.createCheckpoint({ chatId, label: "Before the gate" });
  await routeTrpc(
    page,
    serveCorpusProcedures(caller, [
      "sessions.me",
      "settings.getUserSettings",
      "chat.getChat",
      "chat.listMessages",
      "rpg.getGame",
      "rpg.getTrackerView",
      "rpg.revealHidden",
      "rpg.listJournal",
      "rpg.listCheckpoints",
    ]),
  );
  return chatId;
}

test("the hidden log stays shut and each span's fields stay unmounted until the host asks", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const chatId = await mountRoom(root, page, LIE_GREETING);
  await mount<typeof RpgContextTabStory>(TAB_STORY, { chatId, tab: "rpg.status" });

  const log = page.locator('[data-slot="rpg-veiled-log"]');
  await expect(log).toBeVisible();
  await expect(page.getByText(revealLabel("lie"), { exact: true })).toHaveCount(0);

  await log.getByRole("button").first().click();
  const row = page.locator('[data-slot="rpg-veiled-log-row"]');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(revealLabel("lie"));
  await expect(row.locator('[data-slot="rpg-turn-ref"]')).toBeVisible();
  await expect(row).not.toContainText(TRUTH);

  await row.getByRole("button").click();
  await expect(row).toContainText(`truth: ${TRUTH}`);
});

test("a room with no standing lie still shows what was concealed, and a span with nothing to read says so", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const chatId = await mountRoom(root, page, UNSEEN_GREETING);
  await mount<typeof RpgContextTabStory>(TAB_STORY, { chatId, tab: "rpg.status" });

  const log = page.locator('[data-slot="rpg-veiled-log"]');
  await log.getByRole("button").first().click();
  const rows = page.locator('[data-slot="rpg-veiled-log-row"]');
  await expect(rows).toHaveCount(2);

  const unseen = rows.filter({ hasText: revealLabel("ofilter") });
  await unseen.getByRole("button").click();
  await expect(unseen).toContainText(`event: ${UNSEEN}`);

  const unreadable = rows.filter({ hasText: revealLabel("lie") });
  await expect(unreadable.getByRole("button")).toHaveCount(0);
  await expect(unreadable.locator('[data-slot="rpg-veiled-log-unreadable"]')).toBeVisible();
});

test("each mark names how it was made", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const chatId = await mountRoom(root, page, LIE_GREETING);
  await mount<typeof RpgContextTabStory>(TAB_STORY, { chatId, tab: "rpg.journal" });

  await page.getByText("Marks", { exact: true }).click();
  await expect(page.locator('[data-slot="rpg-mark-row"] [data-slot="rpg-mark-trigger"]')).not.toBeEmpty();
});
