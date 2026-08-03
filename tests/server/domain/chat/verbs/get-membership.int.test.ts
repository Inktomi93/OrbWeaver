// op: getMembership (rpg-design/02 §1.1 #3) — the rpg-facing narrow membership read, against a real libSQL db.
// Proves: a present member resolves to `{ role }` (host / member), a non-member (or unknown chat) is a
// leak-free `null` (the not-a-participant 404 rpg surfaces), and a LEFT member (leftSeq set) reads null.

import type { Db } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import { createGetMembership } from "../../../../../packages/server/src/domain/chat/verbs/get-membership.ts";
import { freshDb } from "../../../../support/db";
import { expect, test } from "../../../../support/fixtures";
import { makeChatContext, seedChat, seedParticipant, seedUser } from "../_support";

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

describe("getMembership", () => {
  test("resolves a present member's role and null for a non-member", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const member = await seedUser(db, castId<Handle>("member"));
    const outsider = await seedUser(db, castId<Handle>("outsider"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "host", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "member", userId: member, role: "member" });

    const getMembership = createGetMembership(makeChatContext(db));
    expect(await getMembership(chatId, host)).toEqual({ role: "host" });
    expect(await getMembership(chatId, member)).toEqual({ role: "member" });
    expect(await getMembership(chatId, outsider)).toBeNull();
  });

  test("a member who left (leftSeq set) reads null", async () => {
    const host = await seedUser(db, castId<Handle>("host"));
    const gone = await seedUser(db, castId<Handle>("gone"));
    const chatId = await seedChat(db, "a");
    await seedParticipant(db, { chatId, key: "host", userId: host, role: "host" });
    await seedParticipant(db, { chatId, key: "gone", userId: gone, role: "member", leftSeq: 5 });

    const getMembership = createGetMembership(makeChatContext(db));
    expect(await getMembership(chatId, gone)).toBeNull();
  });
});
