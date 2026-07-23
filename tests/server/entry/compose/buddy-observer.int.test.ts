// entry/compose/buddy-observer — the AP3-2 actingUserId FEED (agent-principal-design/04 §6). The public
// ChatBusEvent carries no turn identity (D19), so the observer adapter resolves the acting principal from the
// completed turn's committed row: a self-attributed AGENT turn feeds the agent's userId, arming the
// signal-router's self-drop belt (PD-45) so a seated buddy stops quip-reacting to its OWN room turn. The belt
// LOGIC is proven in observer/signal-router.int.test.ts; this pins the feed that was runtime-inert until now.

import type { Db } from "@orb/db";
import type { ChatId } from "@orb/kit/ids";
import { beforeEach, describe } from "vitest";
import { resolveLiteChat } from "../../../../packages/server/src/entry/compose/buddy-observer.ts";
import { freshDb } from "../../../support/db";
import { expect, test } from "../../../support/fixtures";
import { seedAgent, seedChat, seedMessage, seedUser } from "../../domain/chat/_support";

const AT = 1_750_000_000_000;

let db: Db;
let chatId: ChatId;

beforeEach(async () => {
  db = await freshDb();
  chatId = await seedChat(db, "room");
});

describe("resolveLiteChat — the AP3-2 actingUserId feed", () => {
  test("a completed AGENT turn feeds the agent's userId (the belt goes live)", async () => {
    const owner = await seedUser(db, "owner");
    const agent = await seedAgent(db, owner, "buddy");
    const { messageId } = await seedMessage(db, chatId, 1, { role: "assistant", authorUserId: agent });

    const lite = await resolveLiteChat(db, { type: "turnCompleted", chatId, intent: "send", messageId }, AT);
    expect(lite?.kind).toBe("turn-completed");
    // The belt's input: the acting principal is the self-attributed agent — signal-router drops it iff its
    // owner is the reacting host.
    expect(lite?.actingUserId).toBe(agent);
  });

  test("a completed turn with no self-attributed author feeds null (a character turn — the buddy reacts to it)", async () => {
    const { messageId } = await seedMessage(db, chatId, 1, { role: "assistant", authorUserId: null });
    const lite = await resolveLiteChat(db, { type: "turnCompleted", chatId, intent: "send", messageId }, AT);
    expect(lite?.actingUserId).toBeNull();
  });

  test("a turn-aborted / first-message beat carries no messageId → actingUserId null", async () => {
    const aborted = await resolveLiteChat(db, { type: "turnAborted", chatId, intent: "send", reason: "user", automationDepth: 0 }, AT);
    expect(aborted?.kind).toBe("turn-aborted");
    expect(aborted?.actingUserId).toBeNull();
  });

  test("an event the observer ignores maps to null", async () => {
    expect(await resolveLiteChat(db, { type: "chatUpdated", chatId }, AT)).toBeNull();
  });
});
