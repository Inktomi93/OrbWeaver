// The invite wording a visitor reads at every door: the signed-in join dialog, the local sign-up form and the OIDC
// pending join. One home, so a dead link and a room read the same wherever the link is opened.

import type { InvitePreview } from "@orb/contracts/chat";

/** What every door says when a link names no invite that still admits anyone. */
export const DEAD_INVITE_SENTENCE = "This invite link has expired or is used up. Ask the host for a new one.";

/** A room's people, counted in one word everywhere an invite shows them. */
export function memberCountPhrase(count: number): string {
  return `${count} ${count === 1 ? "member" : "members"}`;
}

/** Who invited the visitor, to which room, and how full it is. */
export function inviteRoomSentence(preview: Pick<InvitePreview, "hostHandle" | "roomName" | "memberCount">): string {
  const room = preview.roomName.length > 0 ? preview.roomName : "a room";
  return `${preview.hostHandle} invited you to ${room} (${memberCountPhrase(preview.memberCount)}).`;
}
