// Seated members and owned image subjects for the media and imagery authority gates.

import { createCharacterSchema } from "@orb/contracts/character";
import type { Principal } from "@orb/contracts/identity";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { seedCharacter, seedChatInvite, seedInvitedChatParticipant } from "@orb/testkit/node/composed";

export const PNG = "image/png";

export async function actor(harness: ServerTestHarness, role: "admin" | "user" = "user"): Promise<Principal> {
  return await harness.principalFor((await harness.actor({ role })).id);
}

// Seats a member through the host's real targeted invite, never a hand-written roster row.
export async function seatMember(
  harness: ServerTestHarness,
  host: Principal,
  chatId: Parameters<typeof seedChatInvite>[1]["chatId"],
  member: Principal,
): Promise<void> {
  const invite = await seedChatInvite(harness, { principal: host, chatId, input: { invitedHandle: member.handle } });
  await seedInvitedChatParticipant(harness, { principal: member, inviteId: invite.id });
}

export async function subjectOf(harness: ServerTestHarness, owner: Principal): Promise<Awaited<ReturnType<typeof seedCharacter>>["row"]> {
  const input = createCharacterSchema.parse({ handle: "imagery-subject", name: "Imagery subject", description: "" });
  return (await seedCharacter(harness, { principal: owner, input })).row;
}
