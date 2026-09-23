// verbs/checkpoint/list-checkpoints — listCheckpoints (docs/plans/rpg/design.md). Member-gated read of the
// game's labeled bookmarks.

import type { Db } from "@orb/db";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import { freshDb } from "../../../../../support/db.ts";
import { expect, principal, seedLiteGame, test } from "../../_support.ts";

let db: Db;
beforeEach(async () => {
  db = await freshDb();
});

describe("listCheckpoints", () => {
  test("returns the game's checkpoints (the just-created one)", async () => {
    const { chatId, h } = await seedLiteGame(db);
    await h.service.editSnapshot({ principal: principal(castId<Handle>("host")), chatId, patch: { location: "The Ruins" } });
    const checkpointId = await h.service.createCheckpoint({ principal: principal(castId<Handle>("host")), chatId, label: "before the fight" });

    const list = await h.service.listCheckpoints({ principal: principal(castId<Handle>("host")), chatId });
    expect(list.map((c) => c.label)).toEqual(["before the fight"]);
    expect(list[0]?.id).toBe(checkpointId);
  });
});

// #1528 — a checkpoint `label` is free text on a MEMBER-gated read, so it carries the same hidden-span belt
// as the tracker view and the journal. The member→host fork already stripped checkpoint labels for exactly
// this reason; the source read served them whole. Principals: `host` (the room's host), `member` (a plain
// present member).
const HIDDEN_SPAN = '<lie character="Mara" truth="she is the informant"/>';

describe("listCheckpoints — hidden spans are the HOST's plane, not the member's", () => {
  test("a member reads the label STRIPPED; the host reads it whole", async () => {
    const { chatId, h } = await seedLiteGame(db);
    h.fakes.membership.set("user_member", "member");
    await h.service.editSnapshot({ principal: principal(castId<Handle>("host")), chatId, patch: { location: "The Ruins" } });
    await h.service.createCheckpoint({ principal: principal(castId<Handle>("host")), chatId, label: `before the fight ${HIDDEN_SPAN}` });

    const memberList = await h.service.listCheckpoints({ principal: principal(castId<Handle>("member")), chatId });
    const hostList = await h.service.listCheckpoints({ principal: principal(castId<Handle>("host")), chatId });

    expect(memberList.map((c) => c.label)).toEqual(["before the fight "]);
    expect(hostList.map((c) => c.label)).toEqual([`before the fight ${HIDDEN_SPAN}`]);
  });
});
