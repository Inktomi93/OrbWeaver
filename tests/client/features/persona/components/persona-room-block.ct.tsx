// @subject packages/client/src/features/persona/components/persona-room-block.tsx
// The host's re-pin list and the card-pin line name the player behind a persona, even when two players' personas
// carry the same name.

import { createPersonaSchema } from "@orb/contracts/persona";
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
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { personaWithPlayer } from "#client/features/persona/lib/persona-copy.ts";
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

test("a member whose persona shares the host's persona name is named by their handle in the re-pin list and the pin line", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const memberId = corpus.memberIdentities?.sharedMember.viewer.userId;
  const captured = corpus.reads["chat.getChat"].find(({ output }) => output.participants.some((person) => person.userId === memberId))?.output;
  if (captured === undefined || memberId === undefined) {
    throw new Error("The corpus has no shared human room");
  }
  await (await root.internalCallerFor(root.ownerId)).settings.updateAppSettings({ partial: { localMultiUser: true } });
  // The multi-user toggle is read when a caller is built, so both callers are made after it is set.
  const host = await root.internalCallerFor(root.ownerId);
  const member = await root.internalCallerFor(memberId);
  const room = await host.chat.getChat({ chatId: captured.id });
  const hostSeat = room.participants.find((person) => person.userId === room.viewerUserId);
  const memberSeat = room.participants.find((person) => person.userId === memberId);
  if (hostSeat === undefined || memberSeat === undefined || memberSeat.handle === null) {
    throw new Error("The corpus room lacks a host seat or the member's handle");
  }
  // A seat's display name is its persona's name, so the member's persona name is all the room shows of them:
  // naming theirs like the host's leaves only the handle to tell the two players apart.
  const sharedName = hostSeat.displayName;
  const persona = await member.persona.create({ input: createPersonaSchema.parse({ name: sharedName, description: "The member's seat." }) });
  await member.persona.setActivePersona({ chatId: captured.id, personaId: persona.id });
  expect(memberSeat.handle).not.toBe(sharedName);
  const expected = personaWithPlayer(sharedName, memberSeat.handle);

  await seedShellState(page, { activeSection: "chats" });
  await routeAuthConfig(page, await (await root.http.request("/api/auth/config")).text());
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(host, SERVED),
  });
  await mount<typeof PersonaRoomBlockStory>(STORY, { chatId: captured.id });

  await page.getByRole("button", { name: /^(Playing as .+|Account & personas)$/u }).click();
  const line = page.locator('[data-slot="persona-anchor-line"]');
  await line.getByRole("button", { name: "Re-pin…", exact: true }).click();
  await page.getByRole("menuitem", { name: expected, exact: true }).click();
  await expect(line).toContainText(expected);
});
