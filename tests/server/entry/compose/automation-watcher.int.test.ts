// entry/compose/automation-watcher — the composed `AutomationOps.chat.getMessageFact`, against a real libSQL
// db. THE SECURITY PROPERTY (#1456): the fact resolver hands this op BOTH `chatId` and `messageId`, and the
// composed binding used to DROP the chat scope (`(_chatId, messageId) => getMessageFact(db, messageId)`) over
// a query that filtered on `messages.id` alone. A malformed, stale or cross-wired event carrying a message id
// from another room therefore hydrated a fact out of that room — and the fact is exactly what gets handed to
// third-party automation rules and plugin guest code. The contract already carried the scope; the query now
// uses it.
//
// Asserted THROUGH `createAutomationOps` rather than against the private helper: the defect was in the
// BINDING, so a test that calls the helper directly would have passed while the seam stayed broken.

import type { Db } from "@orb/db";
import type { MessageId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { AutomationOps } from "@orb/server/domain/automation";
import { beforeEach } from "vitest";
import { createAutomationOps } from "../../../../packages/server/src/entry/compose/automation-watcher.ts";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { seedChat, seedMessage } from "../../domain/chat/_support.ts";

let db: Db;

beforeEach(async () => {
  db = await freshDb();
});

/** Every dep this pin does not exercise. Reaching one is the failure, so it throws rather than stubbing a
 *  plausible answer — a silent stub would let a mis-bound op look like a passing read. */
function unreachable(): never {
  throw new Error("automation-watcher pin: this op is not part of the getMessageFact seam");
}

function opsFor(database: Db): AutomationOps {
  return createAutomationOps({
    db: database,
    resolveViewerVisibility: unreachable,
    applyVariableOps: unreachable,
    upsertEntries: unreachable,
    emitNotification: unreachable,
    generatePicture: unreachable,
    requestTurn: unreachable,
    listBackgroundChoices: unreachable,
    setChatBackground: unreachable,
    resolveChatProse: unreachable,
    summarizeQuiet: unreachable,
    isToolDrivableBy: unreachable,
    runTool: unreachable,
  });
}

test("the message's OWN chat resolves the selected variant's content (the control)", async () => {
  const chatId = await seedChat(db, "own");
  const { messageId } = await seedMessage(db, chatId, 1, { content: "the room's own line" });

  const fact = await opsFor(db).chat.getMessageFact(chatId, messageId);

  expect(fact?.id).toBe(messageId);
  expect(fact?.content).toBe("the room's own line");
});

test("SECURITY: a message id paired with a DIFFERENT chat id resolves null — no cross-room fact reaches a rule", async () => {
  const mine = await seedChat(db, "mine");
  const theirs = await seedChat(db, "theirs");
  const { messageId } = await seedMessage(db, theirs, 1, { content: "their private line" });

  const fact = await opsFor(db).chat.getMessageFact(mine, messageId);

  expect(fact).toBeNull();
});

test("an id that names no live slot resolves null (a raced delete is not an error)", async () => {
  const chatId = await seedChat(db, "gone");

  const fact = await opsFor(db).chat.getMessageFact(chatId, castId<MessageId>("message_never"));

  expect(fact).toBeNull();
});
