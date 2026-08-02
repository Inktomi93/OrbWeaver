// The roster host-LOOKUP (D19 role → identity) — the ONE spelling stage R2 collapsed ~14 inline
// `roster.find((r) => r.role === "host" …)` sites onto. What these pin is the part that had TWO spellings
// before the collapse: the `userId` belt. Three of the fourteen sites dropped it, so the helper's single
// answer has to be stated as behavior, not as a comment — a future edit that drops the belt to "simplify"
// makes the third test red instead of silently changing what a hostless-shaped roster resolves to.
//
// No factory and no cast: the helper is structural over `{ role, userId }`, and object literals ARE the
// contract it advertises (both `chat_participants` rows and `ParticipantView`s pass by that shape alone).

import type { ParticipantRole } from "@orb/contracts/identity";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { hostSeatOf, hostUserIdOf } from "../../../../../packages/server/src/domain/chat/substrate/roster-host";
import { expect, test } from "../../../../support/fixtures";

const hostUser = castId<UserId>("user_host");
const memberUser = castId<UserId>("user_member");

function seat(role: ParticipantRole, userId: UserId | null): { readonly role: ParticipantRole; readonly userId: UserId | null } {
  return { role, userId };
}

test("hostUserIdOf resolves the host seat's user id past the members ahead of it", () => {
  const roster = [seat("member", memberUser), seat("member", null), seat("host", hostUser)];
  expect(hostUserIdOf(roster)).toBe(hostUser);
});

test("hostUserIdOf answers null for a hostless roster — the archived-orphan arm every caller degrades on", () => {
  expect(hostUserIdOf([seat("member", memberUser)])).toBe(null);
  expect(hostUserIdOf([])).toBe(null);
});

// THE BELT (the one answer for the class): a `host`-labelled seat carrying no `userId` cannot own a card /
// a stats delta / a notification, so it is SKIPPED rather than accepted-then-nulled. Unreachable today (no
// write path grants `host` to a userId-less seat), which is why collapsing the three beltless sites was
// byte-identical — it is the seat-wave's fail-safe (the dormant `observer` arm is both-null by DDL CHECK).
test("hostUserIdOf skips a userId-less host seat and keeps looking", () => {
  const roster = [seat("host", null), seat("host", hostUser)];
  expect(hostUserIdOf(roster)).toBe(hostUser);
});

test("hostUserIdOf is null when the ONLY host seat carries no userId — never a fabricated owner", () => {
  expect(hostUserIdOf([seat("host", null), seat("member", memberUser)])).toBe(null);
});

// The seat lens is the same comparison, not a second one: the invite preview reads the host's `handle` off
// the returned ROW, so the caller's own field set must survive the lookup.
test("hostSeatOf returns the caller's own row shape, undefined when hostless", () => {
  const host = { role: "host" as ParticipantRole, userId: hostUser, handle: "@host" };
  expect(hostSeatOf([{ role: "member" as ParticipantRole, userId: memberUser, handle: "@member" }, host])).toBe(host);
  expect(hostSeatOf([{ role: "member" as ParticipantRole, userId: memberUser, handle: "@member" }])).toBe(undefined);
});
