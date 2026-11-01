import { createCharacterSchema } from "@orb/contracts/character";
import type { MessageView } from "@orb/contracts/chat";
import { isReattributableReply } from "@orb/contracts/chat";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import type { ChatId } from "@orb/kit/ids";
import { routeAuthConfig, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import {
  MESSAGE_ACTIONS_MENU_NAME,
  MESSAGE_REATTRIBUTE_GENERATING,
  MESSAGE_REATTRIBUTE_NAME,
  MESSAGE_REATTRIBUTE_NO_OTHER_SEAT,
  MESSAGE_REATTRIBUTE_VOICE_NAME,
} from "#client/features/chat/lib/message-action-names.ts";
import type { RoomTranscriptStory } from "./_message-reasoning-and-move-stories.tsx";

// The production transcript over the real composed server and the corpus's own rooms.
const STORY = "tests/client/features/chat/components/_message-reasoning-and-move-stories/RoomTranscriptStory";
const SHORT_ROOM = { min: 3, max: 8 } as const;
const SECOND_VOICE = "Corwin Ashgrove";
const PROCEDURES = [
  "sessions.me",
  "settings.getUserSettings",
  "persona.list",
  "chat.getChat",
  "chat.listMessages",
  "chat.listReactions",
  "chat.listMessageVariants",
  "chat.previewContextFit",
  "chat.reattributeMessages",
  "plugin.list",
  "plugin.listDisplayTransforms",
  "plugin.listSurfaces",
  "regex.listScripts",
  "regex.listRoomDisplayScripts",
  "rpg.getGame",
  "rpg.listTurnToolCalls",
] as const;

type Harness = Awaited<ReturnType<typeof createCorpusHarness>>;
type Caller = Awaited<ReturnType<Harness["internalCallerFor"]>>;

interface SoloRoom {
  readonly chatId: ChatId;
  readonly host: Caller;
  readonly reply: MessageView;
  readonly userLine: MessageView | undefined;
}

/** A short room the owner hosts with one character seat and a reply, so every row is mounted. */
async function soloRoom(root: Harness): Promise<SoloRoom> {
  const host = await root.internalCallerFor(root.ownerId);
  for (const room of (await host.chat.listChats({ limit: 100 })).items) {
    const detail = await host.chat.getChat({ chatId: room.id });
    const page = await host.chat.listMessages({ chatId: room.id });
    const seats = detail.participants.filter((seat) => seat.kind === "character" && seat.leftSeq === null);
    const reply = page.messages.find(isReattributableReply);
    if (detail.viewerIsHost && seats.length === 1 && reply !== undefined && page.previousCursor === null && page.messages.length <= SHORT_ROOM.max) {
      return { chatId: room.id, host, reply, userLine: page.messages.find((row) => row.role === "user" && row.authorUserId === root.ownerId) };
    }
  }
  throw new Error("The corpus has no short solo room the owner hosts");
}

async function seatSecondVoice(room: SoloRoom): Promise<ReturnType<Caller["character"]["create"]>> {
  const card = await room.host.character.create({
    input: createCharacterSchema.parse({ handle: "corwin-ashgrove", name: SECOND_VOICE, description: "The other voice in the room." }),
  });
  await room.host.chat.addCharacterToChat({ chatId: room.chatId, characterId: card.id });
  return card;
}

async function serveAs(root: Harness, page: Page, viewer: Caller): Promise<void> {
  await routeAuthConfig(page, await (await root.http.request("/api/auth/config")).text());
  await routeTrpc(page, serveCorpusProcedures(viewer, PROCEDURES));
}

const storyProps = (chatId: ChatId): Parameters<typeof RoomTranscriptStory>[0] => ({
  chatId,
  width: 960,
  height: 900,
  appearance: appearanceSettingsSchema.parse({}),
  startTurnLabel: "Start a turn",
});

async function openRowMenu(page: Page, message: MessageView): Promise<void> {
  const row = page.locator(`[data-message-id="${message.id}"]`);
  await row.hover();
  await row.getByRole("button", { name: MESSAGE_ACTIONS_MENU_NAME, exact: true }).click();
}

test("the host re-voices a reply through its Reattribute submenu, which lists the room's other seats", async ({ mount, page, corpusMedia }) => {
  await using root = await createCorpusHarness();
  const room = await soloRoom(root);
  const card = await seatSecondVoice(room);
  await serveAs(root, page, room.host);
  await corpusMedia();
  const mounted = await mount<typeof RoomTranscriptStory>(STORY, storyProps(room.chatId));

  await openRowMenu(page, room.reply);
  await page.getByRole("menuitem", { name: MESSAGE_REATTRIBUTE_VOICE_NAME, exact: true }).click();
  await page.getByRole("menuitem", { name: SECOND_VOICE, exact: true }).click();

  await expect
    .poll(async () => (await room.host.chat.listMessages({ chatId: room.chatId })).messages.find((row) => row.id === room.reply.id)?.characterId)
    .toBe(card.id);

  await mounted.unmount();
  await mount<typeof RoomTranscriptStory>(STORY, storyProps(room.chatId));
  await expect(page.locator(`[data-message-id="${room.reply.id}"]`).getByText(SECOND_VOICE, { exact: true })).toBeVisible();
});

test("while a turn is generating the voice door stays in the menu, disabled, and says why", async ({ mount, page, corpusMedia }) => {
  await using root = await createCorpusHarness();
  const room = await soloRoom(root);
  await seatSecondVoice(room);
  await serveAs(root, page, room.host);
  await corpusMedia();
  await mount<typeof RoomTranscriptStory>(STORY, storyProps(room.chatId));
  await expect(page.locator(`[data-message-id="${room.reply.id}"]`)).toBeVisible();
  await page.getByRole("button", { name: "Start a turn", exact: true }).click();

  await openRowMenu(page, room.reply);
  await expect(page.getByRole("menuitem", { name: MESSAGE_REATTRIBUTE_VOICE_NAME, exact: true })).toBeDisabled();
  await expect(page.getByText(MESSAGE_REATTRIBUTE_GENERATING, { exact: true })).toBeVisible();
});

test("with no other seat the door stays in the menu, disabled, and says why", async ({ mount, page, corpusMedia }) => {
  await using root = await createCorpusHarness();
  const room = await soloRoom(root);
  await serveAs(root, page, room.host);
  await corpusMedia();
  await mount<typeof RoomTranscriptStory>(STORY, storyProps(room.chatId));

  await openRowMenu(page, room.reply);
  await expect(page.getByRole("menuitem", { name: MESSAGE_REATTRIBUTE_VOICE_NAME, exact: true })).toBeDisabled();
  await expect(page.getByText(MESSAGE_REATTRIBUTE_NO_OTHER_SEAT, { exact: true })).toBeVisible();
});

test("a user line keeps the persona door and never gets the voice door", async ({ mount, page, corpusMedia }) => {
  await using root = await createCorpusHarness();
  const room = await soloRoom(root);
  if (room.userLine === undefined) {
    throw new Error("The room has no user line of the host's");
  }
  await seatSecondVoice(room);
  await serveAs(root, page, room.host);
  await corpusMedia();
  await mount<typeof RoomTranscriptStory>(STORY, storyProps(room.chatId));

  await openRowMenu(page, room.userLine);
  await expect(page.getByRole("menuitem", { name: MESSAGE_REATTRIBUTE_NAME, exact: true })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: MESSAGE_REATTRIBUTE_VOICE_NAME, exact: true })).toHaveCount(0);
});

test("a member is never offered the voice door", async ({ corpus, mount, page, corpusMedia }) => {
  await using root = await createCorpusHarness();
  const room = await soloRoom(root);
  await seatSecondVoice(room);
  const memberId = corpus.memberIdentities?.sharedMember.viewer.userId;
  if (memberId === undefined) {
    throw new Error("The corpus has no second human");
  }
  await room.host.settings.updateAppSettings({ partial: { localMultiUser: true } });
  // The multi-user toggle is read when a caller is built, so both callers are made after it is set.
  const host = await root.internalCallerFor(root.ownerId);
  const member = await root.internalCallerFor(memberId);
  await member.invites.redeemInvite({ token: (await host.invites.createInvite({ chatId: room.chatId, input: {} })).token });
  await serveAs(root, page, member);
  await corpusMedia();
  await mount<typeof RoomTranscriptStory>(STORY, storyProps(room.chatId));

  await openRowMenu(page, room.reply);
  await expect(page.getByRole("menuitem", { name: "Copy", exact: true })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: MESSAGE_REATTRIBUTE_VOICE_NAME, exact: true })).toHaveCount(0);
});
