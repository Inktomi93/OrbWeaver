// op: resolveViewerVisibility — THE cross-domain viewer-visibility op (the read-visibility D-entry), against a
// real libSQL db. It is the ONLY sanctioned way a non-chat domain answers "may this human see this chat's
// CONTENT", so what these tests pin is the INSEPARABILITY: every non-null answer carries the D16 floor, and
// the absent-member answer is `null`, never a floor of 0 (which reads as UNCLAMPED to a forgetful consumer).
//
// Proves: a `from-join` member resolves to their own joinSeq as an INCLUSIVE floor; a `full` member (the
// column default, the common case) and a born-here host resolve to NO_HISTORY_FLOOR; the floor is PER-CALLER
// (one member's restriction never clamps another's read); a non-member, an unknown chat, and a LEFT member all
// resolve to the one leak-free `null`.

import type { Db } from "@orb/db";
import type { ChatId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import { NO_HISTORY_FLOOR } from "../../../../../packages/server/src/domain/chat/substrate/auth/clamp.ts";
import { createResolveViewerVisibility } from "../../../../../packages/server/src/domain/chat/verbs/resolve-viewer-visibility.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedChat, seedParticipant, seedUser } from "../_support.ts";

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

describe("resolveViewerVisibility — membership and the D16 floor are ONE answer", () => {
  test("a from-join member carries their own joinSeq as the floor; host + full members are unclamped", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const clamped = await seedUser(db, castId<Handle>("clamped"));
    const openMember = await seedUser(db, castId<Handle>("open"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "host", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "clamped", userId: clamped, role: "member", joinSeq: 7, joinHistoryVisibility: "from-join" });
    // No explicit policy ⇒ the COLUMN default (`full`) — the ordinary invitee, even with a late joinSeq.
    await seedParticipant(db, { chatId, key: "open", userId: openMember, role: "member", joinSeq: 9 });

    const resolveViewerVisibility = createResolveViewerVisibility({ db });

    expect(await resolveViewerVisibility(chatId, clamped)).toEqual({ role: "member", historyFloorSeq: 7, readsHidden: false });
    expect(await resolveViewerVisibility(chatId, openMember)).toEqual({ role: "member", historyFloorSeq: NO_HISTORY_FLOOR, readsHidden: false });
    expect(await resolveViewerVisibility(chatId, host)).toEqual({ role: "host", historyFloorSeq: NO_HISTORY_FLOOR, readsHidden: true });
  });

  // F2 — the host has full control (owner ratified): a PROMOTED host (a member who joined late with a
  // `from-join` restriction, then handed the host seat) resolves to NO_HISTORY_FLOOR despite their row still
  // carrying `from-join` at a nonzero joinSeq. This is the incoherence F2 closes: their `listMessages` used to
  // withhold pre-join history while export-chat + discovery already handed them full canon. The row shape here
  // is exactly what a host-handoff leaves behind — the seat flips to `host`, the `joinSeq`/policy do not.
  test("a promoted host (from-join row, late joinSeq) is unclamped — F2 host full control", async () => {
    const promoted = await seedUser(db, castId<Handle>("promoted"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "promoted", userId: promoted, role: "host", joinSeq: 15, joinHistoryVisibility: "from-join" });

    const resolveViewerVisibility = createResolveViewerVisibility({ db });

    expect(await resolveViewerVisibility(chatId, promoted)).toEqual({ role: "host", historyFloorSeq: NO_HISTORY_FLOOR, readsHidden: true });
  });

  test("the floor is PER-CALLER — one member's restriction never clamps another member's read", async () => {
    const clamped = await seedUser(db, castId<Handle>("clamped"));
    const other = await seedUser(db, castId<Handle>("other"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "clamped", userId: clamped, role: "member", joinSeq: 12, joinHistoryVisibility: "from-join" });
    await seedParticipant(db, { chatId, key: "other", userId: other, role: "member", joinSeq: 3, joinHistoryVisibility: "from-join" });

    const resolveViewerVisibility = createResolveViewerVisibility({ db });

    expect(await resolveViewerVisibility(chatId, clamped)).toEqual({ role: "member", historyFloorSeq: 12, readsHidden: false });
    expect(await resolveViewerVisibility(chatId, other)).toEqual({ role: "member", historyFloorSeq: 3, readsHidden: false });
  });

  test("non-member, unknown chat, and a LEFT member are all the one leak-free null (never a floor of 0)", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const outsider = await seedUser(db, castId<Handle>("outsider"));
    const gone = await seedUser(db, castId<Handle>("gone"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "host", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "gone", userId: gone, role: "member", joinSeq: 4, leftSeq: 11 });

    const resolveViewerVisibility = createResolveViewerVisibility({ db });

    expect(await resolveViewerVisibility(chatId, outsider)).toBeNull();
    expect(await resolveViewerVisibility(chatId, gone)).toBeNull();
    expect(await resolveViewerVisibility(castId<ChatId>("chat_does_not_exist"), host)).toBeNull();
  });
});
