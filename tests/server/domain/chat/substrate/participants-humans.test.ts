// domain/chat/substrate/roster-humans — pins THE PERSONA CONSENT SET header claim: a present human seat's
// userId is in the set, a character seat never contributes, and — the 2026-08-15 fix — a DISABLED backing
// account is filtered out too, the same class of silent-dead-pin bug the file's header warns was already
// paid for once on the presence axis.

import type { ParticipantKind } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import { presentAndEnabledHumanUserIdsOf } from "../../../../../packages/server/src/domain/chat/substrate/participants-humans.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeChatContext } from "../_support.ts";

const ALICE = castId<UserId>("user_alice");
const BOB = castId<UserId>("user_bob");

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

function seat(kind: ParticipantKind, userId: UserId | null): { readonly kind: ParticipantKind; readonly userId: UserId | null; readonly characterId: null } {
  return { kind, userId, characterId: null };
}

describe("presentAndEnabledHumanUserIdsOf", () => {
  test("only HUMAN seats contribute — a character seat is never in the persona consent set", async () => {
    const roster = [seat("human", ALICE), seat("character", null)];
    const ctx = makeChatContext(db, { resolveUserEnabled: () => Promise.resolve(true) });
    expect(await presentAndEnabledHumanUserIdsOf(ctx, roster)).toEqual([ALICE]);
  });

  test("a disabled backing account is filtered OUT — the 2026-08-15 fix this file's header describes", async () => {
    const roster = [seat("human", ALICE), seat("human", BOB)];
    const ctx = makeChatContext(db, { resolveUserEnabled: (userId) => Promise.resolve(userId !== BOB) });
    expect(await presentAndEnabledHumanUserIdsOf(ctx, roster)).toEqual([ALICE]);
  });

  test("the set is DEDUPED — the same human seated twice (co-drives) contributes one id", async () => {
    const roster = [seat("human", ALICE), seat("human", ALICE)];
    const ctx = makeChatContext(db, { resolveUserEnabled: () => Promise.resolve(true) });
    expect(await presentAndEnabledHumanUserIdsOf(ctx, roster)).toEqual([ALICE]);
  });

  test("an empty roster resolves to an empty set", async () => {
    const ctx = makeChatContext(db, { resolveUserEnabled: () => Promise.resolve(true) });
    expect(await presentAndEnabledHumanUserIdsOf(ctx, [])).toEqual([]);
  });
});
