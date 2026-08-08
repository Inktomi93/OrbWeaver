// verbs/sheet — patchSheet (rpg-design/05 §4.4, §6.2). MA-4 patch semantics (omit preserves; a null maxHp is a
// real clear) + attribute-key ∈ profile-vocabulary + range enforcement. Row-on-first-write. Mutations asserted
// at the persisted row (assert-the-mutation-fired).
//
// The last describe pins the PER-FIELD host floor over `trackerGrants`/`trackerRevokes`: `assertOwnUserRef`
// decides whose ROW, never which FIELDS, so a member self-granting a meter on their own `user` sheet was
// reachable until 2026-08-07 (the host-only invariant was client-side only).

import { RPG_PROFILE_D20 } from "@orb/contracts/rpg";
import type { Db } from "@orb/db";
import { DomainForbiddenError } from "@orb/kit/errors";
import type { CharacterId, ChatId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import { findGameByChat } from "../../../../../packages/server/src/domain/rpg/persistence/games.ts";
import { findSheet } from "../../../../../packages/server/src/domain/rpg/persistence/sheets.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, makeRpgService, principal, seedChat, seedUser, test } from "../_support.ts";

const RANGE_RE = /out of range/i;
const UNKNOWN_ATTR_RE = /not in the profile/i;

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

async function seedGame(): Promise<{
  chatId: import("@orb/kit/ids").ChatId;
  userId: import("@orb/kit/ids").UserId;
  service: ReturnType<typeof makeRpgService>["service"];
  fakes: ReturnType<typeof makeRpgService>["fakes"];
}> {
  const chatId = await seedChat(db, "a");
  const userId = await seedUser(db, castId<Handle>("host"));
  const { service, fakes } = makeRpgService(db);
  fakes.membership.set("user_host", "host");
  await service.createGame({ principal: principal(castId<Handle>("host")), chatId, mode: "lite", profile: RPG_PROFILE_D20 });
  fakes.busEvents.length = 0; // drop the createGame emit — the tests below assert the patchSheet emit alone
  return { chatId, userId, service, fakes };
}

/** A game with BOTH seats on the roster — the grid the tracker-exception gate is decided over (a host, and a
 *  present member whose OWN `user` sheet `assertOwnUserRef` already lets them write). */
async function seedGameWithMember(): Promise<{
  chatId: ChatId;
  memberId: UserId;
  service: ReturnType<typeof makeRpgService>["service"];
  fakes: ReturnType<typeof makeRpgService>["fakes"];
}> {
  const chatId = await seedChat(db, "a");
  await seedUser(db, castId<Handle>("host"));
  const memberId = await seedUser(db, castId<Handle>("member"));
  const { service, fakes } = makeRpgService(db);
  fakes.membership.set("user_host", "host");
  fakes.membership.set("user_member", "member");
  await service.createGame({ principal: principal(castId<Handle>("host")), chatId, mode: "lite", profile: RPG_PROFILE_D20 });
  fakes.busEvents.length = 0;
  return { chatId, memberId, service, fakes };
}

describe("patchSheet", () => {
  test("row-on-first-write; a second patch MERGES (omit preserves)", async () => {
    const { chatId, userId, service, fakes } = await seedGame();
    const ref = { kind: "user" as const, userId };
    await service.patchSheet({ principal: principal(castId<Handle>("host")), chatId, actorRef: ref, patch: { className: "Rogue", attributes: { str: 12 } } });
    const game = await findGameByChat(db, chatId);
    if (!game) {
      throw new Error("no game");
    }
    let sheet = (await findSheet(db, game.id, { userId }))?.sheet;
    expect(sheet?.className).toBe("Rogue");
    expect(sheet?.attributes["str"]).toBe(12);
    // §4.9: patchSheet emits `sheetChanged` with the row's real id.
    const row = await findSheet(db, game.id, { userId });
    expect(fakes.busEvents).toEqual([{ type: "sheetChanged", chatId, sheetId: row?.id }]);

    // A patch that omits className keeps it; adds dex.
    await service.patchSheet({ principal: principal(castId<Handle>("host")), chatId, actorRef: ref, patch: { attributes: { str: 12, dex: 15 } } });
    sheet = (await findSheet(db, game.id, { userId }))?.sheet;
    expect(sheet?.className).toBe("Rogue"); // preserved
    expect(sheet?.attributes["dex"]).toBe(15);
  });

  test("maxHp is GONE from the sheet door (R3) — a stray key writes nothing, it is not a field", async () => {
    // The clear-vs-keep semantic it used to pin now lives on `level` (the test below); what is pinned HERE is
    // that the retired dial cannot be resurrected by a caller who still sends it: the dual-max home the
    // unification killed for pools does not come back through the wire.
    const { chatId, userId, service } = await seedGame();
    const ref = { kind: "user" as const, userId };
    // The point is that a caller still sending the retired dial writes nothing — only expressible by sending
    // a key the type no longer has.
    // FABRICATION-OK: a deliberate INVALID-INPUT probe (the retired `maxHp` key).
    await service.patchSheet({ principal: principal(castId<Handle>("host")), chatId, actorRef: ref, patch: { maxHp: 30 } as never });
    const game = await findGameByChat(db, chatId);
    if (!game) {
      throw new Error("no game");
    }
    expect((await findSheet(db, game.id, { userId }))?.sheet).not.toHaveProperty("maxHp");
  });

  test("level (§2.6 hand-only) writes + clears via patchSheet — its ONLY write door", async () => {
    const { chatId, userId, service } = await seedGame();
    const ref = { kind: "user" as const, userId };
    const game = await findGameByChat(db, chatId);
    if (!game) {
      throw new Error("no game");
    }
    // Born null (nullable-honesty).
    await service.patchSheet({ principal: principal(castId<Handle>("host")), chatId, actorRef: ref, patch: { className: "Fighter" } });
    expect((await findSheet(db, game.id, { userId }))?.sheet.level).toBeNull();
    // Hand-set the level.
    await service.patchSheet({ principal: principal(castId<Handle>("host")), chatId, actorRef: ref, patch: { level: 4 } });
    expect((await findSheet(db, game.id, { userId }))?.sheet.level).toBe(4);
    // Omit keeps it (MA-4).
    await service.patchSheet({ principal: principal(castId<Handle>("host")), chatId, actorRef: ref, patch: { className: "Paladin" } });
    expect((await findSheet(db, game.id, { userId }))?.sheet.level).toBe(4);
    // Explicit null clears it (key-presence, not ??).
    await service.patchSheet({ principal: principal(castId<Handle>("host")), chatId, actorRef: ref, patch: { level: null } });
    expect((await findSheet(db, game.id, { userId }))?.sheet.level).toBeNull();
  });

  test("an attribute key NOT in the profile is refused", async () => {
    const { chatId, userId, service } = await seedGame();
    await expect(
      service.patchSheet({ principal: principal(castId<Handle>("host")), chatId, actorRef: { kind: "user", userId }, patch: { attributes: { nonsense: 5 } } }),
    ).rejects.toThrow(UNKNOWN_ATTR_RE);
  });

  test("an attribute value out of range is refused", async () => {
    const { chatId, userId, service } = await seedGame();
    await expect(
      service.patchSheet({ principal: principal(castId<Handle>("host")), chatId, actorRef: { kind: "user", userId }, patch: { attributes: { str: 99 } } }),
    ).rejects.toThrow(RANGE_RE);
  });
});

describe("patchSheet — the tracker EXCEPTIONS are host-only, even on a member's own row", () => {
  // Grants/revokes decide which METERS an actor carries (`sheet.trackerGrants`/`trackerRevokes` → the tracker
  // view's `carriesTracker`), which is the host's call — the client omits the control for a member, and this
  // is the server floor that makes the omission an invariant instead of a suggestion.

  test("a MEMBER self-granting on their OWN user-ref sheet is FORBIDDEN and writes nothing", async () => {
    const { chatId, memberId, service, fakes } = await seedGameWithMember();
    const member = principal(castId<Handle>("member"));
    const ref = { kind: "user" as const, userId: memberId };
    // The member first makes a LEGITIMATE self-edit, so the row exists and a failed grant is provably a
    // no-write rather than a no-row.
    await service.patchSheet({ principal: member, chatId, actorRef: ref, patch: { className: "Rogue" } });
    fakes.busEvents.length = 0;

    await expect(service.patchSheet({ principal: member, chatId, actorRef: ref, patch: { trackerGrants: ["bound_will"] } })).rejects.toThrow(
      new DomainForbiddenError("host authority required to grant or revoke a tracker exception"),
    );
    // The REVOKE half is the same field pair and the same refusal — a member must not be able to drop a meter
    // the host's carrier class put on them either.
    await expect(service.patchSheet({ principal: member, chatId, actorRef: ref, patch: { trackerRevokes: ["mana"] } })).rejects.toThrow(DomainForbiddenError);
    // …and a grant SMUGGLED alongside a field the member may legitimately write is refused WHOLE: the patch is
    // rejected, so the co-carried `flavor` does not land either.
    await expect(service.patchSheet({ principal: member, chatId, actorRef: ref, patch: { flavor: "scarred", trackerGrants: ["bound_will"] } })).rejects.toThrow(
      DomainForbiddenError,
    );

    const game = await findGameByChat(db, chatId);
    if (!game) {
      throw new Error("no game");
    }
    const sheet = (await findSheet(db, game.id, { userId: memberId }))?.sheet;
    expect(sheet?.trackerGrants).toEqual([]);
    expect(sheet?.trackerRevokes).toEqual([]);
    expect(sheet?.flavor).toBe("");
    expect(sheet?.className).toBe("Rogue"); // the legitimate edit survived; only the refused patches wrote nothing
    // A refused write emits NOTHING — no `sheetChanged` repaint for a mutation that never happened.
    expect(fakes.busEvents).toEqual([]);
  });

  test("an EMPTY list is still a host ask — key-PRESENCE gates, never truthiness", async () => {
    // The gate reads `=== undefined`, the same MA-4 key-presence test `mergeSheet` uses, so `[]` is a real
    // whole-list REPLACE ("clear every exception on this actor") and not a no-op. A truthiness/length check
    // here would let a member wipe the host's grants with the emptiest possible payload — the arm is refused
    // BY CONSTRUCTION today, and this row is what keeps it that way if the condition is ever "simplified".
    const { chatId, memberId, service, fakes } = await seedGameWithMember();
    const member = principal(castId<Handle>("member"));
    const host = principal(castId<Handle>("host"));
    const ref = { kind: "user" as const, userId: memberId };
    const game = await findGameByChat(db, chatId);
    if (!game) {
      throw new Error("no game");
    }
    // The host authors an exception first, so the clear has something REAL to destroy.
    await service.patchSheet({ principal: host, chatId, actorRef: ref, patch: { trackerGrants: ["bound_will"], trackerRevokes: ["mana"] } });
    fakes.busEvents.length = 0;

    await expect(service.patchSheet({ principal: member, chatId, actorRef: ref, patch: { trackerGrants: [] } })).rejects.toThrow(
      new DomainForbiddenError("host authority required to grant or revoke a tracker exception"),
    );
    await expect(service.patchSheet({ principal: member, chatId, actorRef: ref, patch: { trackerRevokes: [] } })).rejects.toThrow(
      new DomainForbiddenError("host authority required to grant or revoke a tracker exception"),
    );

    // The host's exceptions SURVIVED both empty-list attempts, and nothing repainted.
    const sheet = (await findSheet(db, game.id, { userId: memberId }))?.sheet;
    expect(sheet?.trackerGrants).toEqual(["bound_will"]);
    expect(sheet?.trackerRevokes).toEqual(["mana"]);
    expect(fakes.busEvents).toEqual([]);
  });

  test("a member reaching a CHARACTER ref with grants is refused by the ROW gate first — no emit", async () => {
    // The two floors compose, and their ORDER is deliberate: `assertOwnUserRef` (whose row) runs before the
    // field floor (which fields), so a member aiming grants at a roster CHARACTER never reaches the tracker
    // check at all and gets the row-gate sentence. Pinned because the sentence is the contract and the
    // ordering is what makes the coarser refusal the one a member sees — both refusals are `Forbidden`, so
    // neither arm tells a member anything the other would not.
    const { chatId, service, fakes } = await seedGameWithMember();
    const member = principal(castId<Handle>("member"));
    const characterRef = { kind: "character" as const, characterId: castId<CharacterId>("character_mara") };
    fakes.busEvents.length = 0;

    await expect(service.patchSheet({ principal: member, chatId, actorRef: characterRef, patch: { trackerGrants: ["bound_will"] } })).rejects.toThrow(
      new DomainForbiddenError("a member may write only their own row"),
    );
    await expect(service.patchSheet({ principal: member, chatId, actorRef: characterRef, patch: { trackerRevokes: ["mana"] } })).rejects.toThrow(
      new DomainForbiddenError("a member may write only their own row"),
    );

    // No sheet row was minted for the character (the refusal lands before the first-write upsert) and nothing
    // repainted — a refused reach leaves no trace at all.
    const game = await findGameByChat(db, chatId);
    if (!game) {
      throw new Error("no game");
    }
    expect(await findSheet(db, game.id, { characterId: castId<CharacterId>("character_mara") })).toBeUndefined();
    expect(fakes.busEvents).toEqual([]);
  });

  test("the HOST grants + revokes on any actor's sheet — the editor's own whole-list replace still works", async () => {
    const { chatId, memberId, service, fakes } = await seedGameWithMember();
    const host = principal(castId<Handle>("host"));
    const ref = { kind: "user" as const, userId: memberId };
    const game = await findGameByChat(db, chatId);
    if (!game) {
      throw new Error("no game");
    }

    // The Tracker access editor's exact wire shape: BOTH lists, whole-list replace, on the MEMBER's row.
    await service.patchSheet({ principal: host, chatId, actorRef: ref, patch: { trackerGrants: ["bound_will"], trackerRevokes: [] } });
    expect((await findSheet(db, game.id, { userId: memberId }))?.sheet.trackerGrants).toEqual(["bound_will"]);

    // Flipping the same key to `revoke` clears it from grants (the editor keeps the pair disjoint).
    await service.patchSheet({ principal: host, chatId, actorRef: ref, patch: { trackerGrants: [], trackerRevokes: ["bound_will"] } });
    const flipped = (await findSheet(db, game.id, { userId: memberId }))?.sheet;
    expect(flipped?.trackerGrants).toEqual([]);
    expect(flipped?.trackerRevokes).toEqual(["bound_will"]);
    // The host's writes DID repaint (the mutation fired), which is what proves the gate is a member gate and
    // not a field freeze.
    expect(fakes.busEvents.filter((e) => e.type === "sheetChanged")).toHaveLength(2);
  });

  test("a member's ORDINARY self-edit is untouched — the gate is per-FIELD, not per-verb", async () => {
    const { chatId, memberId, service, fakes } = await seedGameWithMember();
    const member = principal(castId<Handle>("member"));
    const ref = { kind: "user" as const, userId: memberId };
    const game = await findGameByChat(db, chatId);
    if (!game) {
      throw new Error("no game");
    }

    // Every sheet field a member owns, in one patch that names NEITHER exception list.
    await service.patchSheet({
      principal: member,
      chatId,
      actorRef: ref,
      patch: { className: "Warden", attributes: { str: 12 }, flavor: "quiet, watchful", level: 3 },
    });
    const sheet = (await findSheet(db, game.id, { userId: memberId }))?.sheet;
    expect(sheet?.className).toBe("Warden");
    expect(sheet?.attributes["str"]).toBe(12);
    expect(sheet?.flavor).toBe("quiet, watchful");
    expect(sheet?.level).toBe(3);
    expect(fakes.busEvents.filter((e) => e.type === "sheetChanged")).toHaveLength(1);

    // A host-authored exception SURVIVES a member's later self-edit (omit-keeps, MA-4) — the member cannot
    // erase it by writing the fields they DO own.
    await service.patchSheet({ principal: principal(castId<Handle>("host")), chatId, actorRef: ref, patch: { trackerGrants: ["bound_will"] } });
    await service.patchSheet({ principal: member, chatId, actorRef: ref, patch: { flavor: "still watchful" } });
    expect((await findSheet(db, game.id, { userId: memberId }))?.sheet.trackerGrants).toEqual(["bound_will"]);
  });
});
