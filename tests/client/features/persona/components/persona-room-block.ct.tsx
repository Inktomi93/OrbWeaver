// @subject packages/client/src/features/persona/components/persona-room-block.tsx
// The host's re-pin list and the card-pin line name the player behind a persona, even when two players' personas
// carry the same name, and a held pin still names the player who left.

import { createPersonaSchema } from "@orb/contracts/persona";
import type { ChatId, Handle, PersonaId } from "@orb/kit/ids";
import { seedShellState } from "@orb/testkit/browser/spec";
import {
  createShellAmbientReads,
  ROOM_PROCEDURES,
  routeAuthConfig,
  routeTrpc,
  SECTION_PROCEDURES,
  SHELL_MOUNT_PROCEDURES,
  serveCorpusProcedures,
} from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusPlayback } from "@orb/testkit/iso";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { CLEAR_PIN_NAME, personaWithPlayer } from "#client/features/persona/lib/persona-copy.ts";
import type { PersonaRoomBlockStory } from "./_persona-room-block-stories.tsx";

const STORY = "tests/client/features/persona/components/_persona-room-block-stories/PersonaRoomBlockStory";
const SERVED = [
  ...SECTION_PROCEDURES,
  ...SHELL_MOUNT_PROCEDURES,
  ...ROOM_PROCEDURES,
  "chat.setChatAnchorPersona",
  "notifications.presence",
  "rpg.getGame",
  "rpg.listTurnToolCalls",
] as const;

test.use({ hasTouch: false, isMobile: false, viewport: { width: 1440, height: 900 } });

type Caller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;

interface SeatedMember {
  readonly host: Caller;
  readonly member: Caller;
  readonly chatId: ChatId;
  readonly personaId: PersonaId;
  readonly personaName: string;
  readonly memberHandle: Handle;
}

/** The corpus room the owner hosts, with its shared member playing a persona named like the host's. A seat's display
 *  name is its persona's name, so that persona name is all the room shows of either player: the member's handle is the
 *  only thing that tells them apart. */
async function seatMemberLikeHost(root: ServerTestHarness, corpus: CorpusPlayback): Promise<SeatedMember> {
  const memberId = corpus.memberIdentities?.sharedMember.viewer.userId;
  const captured = corpus.reads["chat.getChat"].find(({ output }) => output.participants.some((person) => person.userId === memberId))?.output;
  if (captured === undefined || memberId === undefined) {
    throw new Error("The corpus has no shared human room");
  }
  await (await root.internalCallerFor(root.ownerId)).settings.updateAppSettings({ partial: { localMultiUser: true } });
  // The multi-user toggle is read when a caller is built, so both callers are made after it is set.
  const host = await root.internalCallerFor(root.ownerId);
  const member = await root.internalCallerFor(memberId);
  const chatId = captured.id;
  const room = await host.chat.getChat({ chatId });
  const hostSeat = room.participants.find((person) => person.userId === room.viewerUserId);
  const memberSeat = room.participants.find((person) => person.userId === memberId);
  if (hostSeat === undefined || memberSeat === undefined || memberSeat.handle === null) {
    throw new Error("The corpus room lacks a host seat or the member's handle");
  }
  const personaName = hostSeat.displayName;
  expect(memberSeat.handle).not.toBe(personaName);
  const persona = await member.persona.create({ input: createPersonaSchema.parse({ name: personaName, description: "The member's seat." }) });
  await member.persona.setActivePersona({ chatId, personaId: persona.id });
  return { host, member, chatId, personaId: persona.id, personaName, memberHandle: memberSeat.handle };
}

/** Serve the room to the host's own browser. */
async function routeRoomAsHost(page: Page, root: ServerTestHarness, corpus: CorpusPlayback, host: Caller): Promise<void> {
  await seedShellState(page, { activeSection: "chats" });
  await routeAuthConfig(page, await (await root.http.request("/api/auth/config")).text());
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(host, SERVED),
  });
}

async function showPersonaPanel(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^(Playing as .+|Account & personas)$/u }).click();
}

test("a member whose persona shares the host's persona name is named by their handle in the re-pin list and the pin line", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const seat = await seatMemberLikeHost(root, corpus);
  const expected = personaWithPlayer(seat.personaName, seat.memberHandle);
  await routeRoomAsHost(page, root, corpus, seat.host);
  await mount<typeof PersonaRoomBlockStory>(STORY, { chatId: seat.chatId });

  await showPersonaPanel(page);
  const line = page.locator('[data-slot="persona-anchor-line"]');
  await line.getByRole("button", { name: "Re-pin…", exact: true }).click();
  await page.getByRole("menuitem", { name: expected, exact: true }).click();
  await expect(line).toContainText(expected);
});

test("a pin held after its player left still names that player", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const seat = await seatMemberLikeHost(root, corpus);
  const expected = personaWithPlayer(seat.personaName, seat.memberHandle);
  await seat.host.chat.setChatAnchorPersona({ chatId: seat.chatId, personaId: seat.personaId });
  // The real leave path: the member walks out of the room, so only the pin is left of them.
  await seat.member.invites.selfLeave({ chatId: seat.chatId });
  await routeRoomAsHost(page, root, corpus, seat.host);
  await mount<typeof PersonaRoomBlockStory>(STORY, { chatId: seat.chatId });

  await showPersonaPanel(page);
  const line = page.locator('[data-slot="persona-anchor-line"]');
  await expect(line).toHaveAttribute("data-anchor-state", "held");
  await expect(line).toContainText(expected);
  // Nobody is left to pin, so the line offers the one thing it can do directly, not a menu holding only that.
  await expect(line.getByRole("button", { name: "Re-pin…", exact: true })).toHaveCount(0);
  await line.getByRole("button", { name: CLEAR_PIN_NAME, exact: true }).click();
  await expect(line).toHaveAttribute("data-anchor-state", "none");
});
