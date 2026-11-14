// The rpg sections that read behind a boundary with no fallback of their own hold their box while the read is in flight, so the
// surface below them does not move when the read lands: the Waystone band at the head of the context pane, and the host's Veiled
// ledger in the Status tab. A box that shrinks when the answer lands is ruled better than one that pushes the rows beneath it.
// @subject packages/client/src/features/rpg/components/rpg-hud-band.tsx
// @subject packages/client/src/features/rpg/components/rpg-veiled-section.tsx
import { contextToggleLabel } from "@orb/client/lib";
import { createCharacterSchema } from "@orb/contracts/character";
import type { ChatId } from "@orb/kit/ids";
import { LAYOUT_SUBPIXEL_PX, seedShellState } from "@orb/testkit/browser/spec";
import { createShellAmbientReads, holdServed, ROOM_PROCEDURES, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness, seedRpgGame } from "@orb/testkit/node/composed";
import type { Locator } from "@playwright/test";
import type { RpgContextTabStory, RpgRoomStory } from "./_own-key-panels-stories.tsx";

const ROOM_STORY = "tests/client/features/rpg/components/_own-key-panels-stories/RpgRoomStory";
const TAB_STORY = "tests/client/features/rpg/components/_own-key-panels-stories/RpgContextTabStory";
const READS = [
  "rpg.getGame",
  "rpg.getTrackerView",
  "rpg.revealHidden",
  "rpg.listJournal",
  "rpg.listCheckpoints",
  "rpg.listTurnToolCalls",
  "chat.getChat",
  "chat.listMessages",
] as const;
const LIE_GREETING = 'The loom is quiet. <lie character="Warden" type="secret" truth="the-ledger-burned" reason="Protect the ledger"/>';

test.use({ viewport: { width: 1440, height: 900 }, hasTouch: false, isMobile: false });

async function heightOf(locator: Locator): Promise<number> {
  return (await locator.boundingBox())?.height ?? Number.NaN;
}

async function gameChat(root: Awaited<ReturnType<typeof createCorpusHarness>>, greeting: string): Promise<ChatId> {
  const caller = await root.internalCallerFor(root.ownerId);
  const character = await caller.character.create({
    input: createCharacterSchema.parse({ handle: "ct-warden", name: "Warden", description: "Keeps the ledger.", greetings: [{ text: greeting }] }),
  });
  const chatId = (await caller.chat.startChat({ characterIds: [character.id], opening: "first-message" })).chat.id;
  await seedRpgGame(root, { principal: await root.principalFor(root.ownerId), chatId, mode: "lite" });
  expect(await caller.rpg.editSnapshot({ chatId, patch: { location: "The gate" } })).toEqual({ ok: true });
  return chatId;
}

test("the Waystone band holds its box while the tracker read is in flight and does not grow when it lands", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const chatId = await gameChat(root, "The loom is quiet.");
  const caller = await root.internalCallerFor(root.ownerId);
  const hold = holdServed();
  await seedShellState(page, { activeSection: "chats", panelOverrides: { chats: { list: "collapsed" } } });
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...ROOM_PROCEDURES, ...READS.filter((read) => read !== "rpg.getTrackerView")]),
    ...serveCorpusProcedures(caller, ["rpg.getTrackerView"], () => hold),
  });
  await mount<typeof RpgRoomStory>(ROOM_STORY, { chatId });
  await page.getByRole("button", { name: contextToggleLabel(true), exact: true }).click();
  await hold.requested;
  const band = page.locator('[data-slot="rpg-hud-band"]');
  await expect(band).toBeVisible();
  const held = await heightOf(band);
  expect(held).toBeGreaterThan(0);

  hold.release();
  await expect(page.locator('[data-slot="waystone"]')).toBeVisible();
  expect(await heightOf(band)).toBeLessThanOrEqual(held + LAYOUT_SUBPIXEL_PX);
});

test("the host's Veiled ledger holds its box while the reveal read is in flight and does not grow when it lands", async ({ mount, page }) => {
  await using root = await createCorpusHarness();
  const chatId = await gameChat(root, LIE_GREETING);
  const caller = await root.internalCallerFor(root.ownerId);
  const hold = holdServed();
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, ["sessions.me", "settings.getUserSettings", ...READS.filter((read) => read !== "rpg.revealHidden")]),
    ...serveCorpusProcedures(caller, ["rpg.revealHidden"], () => hold),
  });
  await mount<typeof RpgContextTabStory>(TAB_STORY, { chatId, tab: "rpg.status" });
  await hold.requested;
  const reserved = page.locator('[data-reserve-key="rpg.veiledLedger"]');
  await expect(reserved).toBeVisible();
  const held = await heightOf(reserved);

  hold.release();
  const log = page.locator('[data-slot="rpg-veiled-section"]');
  await expect(log).toBeVisible();
  expect(await heightOf(log)).toBeLessThanOrEqual(held + LAYOUT_SUBPIXEL_PX);
});
