// domain/rpg/guard — the DECIDE-vs-REFUSE split at rpg's one authority chokepoint, driven through the REAL
// `can()` kernel (`domain/admin/guard.ts`), never a stand-in: the whole point of the reroute is that the host
// COMPARISON is the kernel's and only the refusal SENTENCE is rpg's, so a test that faked `can` would prove
// the opposite of the invariant. The db-touching arms (`resolveMember`/`resolveHost`) are pinned against a
// real db by `authority.suite.int.test.ts`; what lives here is the pure verdict surface that suite drives
// through — including the two arms it cannot reach (a non-DomainForbidden kernel fault, and the host BYPASS
// of the self-write check).

import type { Can } from "@orb/contracts/identity";
import type { RpgActorRef } from "@orb/contracts/rpg";
import { DomainForbiddenError } from "@orb/kit/errors";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { freshDb } from "@orb/testkit/node/db.ts";
import { principal } from "@orb/testkit/node/factories/principal.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import { can } from "#server/domain/admin/guard.ts";
import { assertHostRole, assertOwnUserRef, notFoundGame } from "#server/domain/rpg/guard.ts";
import { seatRoles } from "../chat/_support.ts";

// Seat roles are captured row data: one in-memory room supplies the host and member roles these checks read.
const ROLES = await seatRoles(await freshDb());

// These callers resolve from rows in one in-memory database; the subject under test reads no database of its own.
const callersDb = await freshDb();
const MEMBER = await principal({ db: callersDb }, castId<UserId>("user_member"));
const OTHER: UserId = castId<UserId>("user_other");
const REASON = "host authority required to hand-edit an actor";

const userRef = (userId: UserId): RpgActorRef => ({ kind: "user", userId });

describe("assertHostRole — the kernel decides, rpg words the refusal", () => {
  test("a host passes; a member is refused with the CALLER'S sentence, not a generic one", () => {
    expect(() => assertHostRole(can, MEMBER, ROLES.host, REASON)).not.toThrow();
    expect(() => assertHostRole(can, MEMBER, ROLES.member, REASON)).toThrow(new DomainForbiddenError(REASON));
  });

  test("a kernel fault that is NOT a deny propagates — a catch-all here would turn a broken kernel into a grant", () => {
    const brokenKernel = ((): void => {
      throw new TypeError("the participants shape changed under the kernel");
    }) as Can;

    expect(() => assertHostRole(brokenKernel, MEMBER, ROLES.member, REASON)).toThrow(TypeError);
  });
});

describe("assertOwnUserRef — a member writes their own row; the host arm is a BYPASS", () => {
  test("a member may write their OWN user ref and no other", () => {
    expect(() => assertOwnUserRef(can, MEMBER, ROLES.member, userRef(MEMBER.userId))).not.toThrow();
    expect(() => assertOwnUserRef(can, MEMBER, ROLES.member, userRef(OTHER))).toThrow(DomainForbiddenError);
  });

  test("a non-`user` ref is not a member's to write — the ref KIND is part of the self-check", () => {
    const characterRef: RpgActorRef = { kind: "character", characterId: castId<CharacterId>("character_npc") };

    expect(() => assertOwnUserRef(can, MEMBER, ROLES.member, characterRef)).toThrow(DomainForbiddenError);
    // …and the host bypass grants exactly the refs the member was denied, through the SAME kernel question,
    // so host authority can never widen for the gate without widening for the bypass.
    expect(() => assertOwnUserRef(can, MEMBER, ROLES.host, characterRef)).not.toThrow();
    expect(() => assertOwnUserRef(can, MEMBER, ROLES.host, userRef(OTHER))).not.toThrow();
  });
});

test("notFoundGame is LEAK-FREE — it surfaces the chat id as a `game` not-found and nothing about the room", () => {
  const chatId = castId<Parameters<typeof notFoundGame>[0]>("chat_secret");

  expect(() => notFoundGame(chatId)).toThrow(/game/u);
});
