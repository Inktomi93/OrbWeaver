// A large SillyTavern chat in a profile import is translated for its write in slices: between its character landing
// and its room landing, the import hands the event loop back once per slice of the text it translates, beside the
// turn the write gives each landing stage before its room lands, so the rest of the server runs while a chat of
// megabytes is estimated and mapped. The storage read is the subject: a chain of immediates counts the turns of the
// loop between the character row and the room row. The proof counts turns against the production slice and stage
// bounds, never milliseconds, so it reads the same on any host.
// @subject packages/server/src/domain/import/substrate/chat-input.ts
// @subject packages/server/src/primitives/abort/index.ts

import { ST_SETTINGS_FILE } from "@orb/contracts/import";
import { characters, chats } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { WORKLOAD_DEADLINE_MS } from "@orb/testkit/node/composed";
import { sql } from "drizzle-orm";
import { LANDING_STAGE_CHARS } from "#server/domain/chat/persistence/import-landing.ts";
import { CHAT_SLICE_BUDGET } from "#server/primitives/serde/chat/index.ts";
import { admit, cardPng, harness, settings } from "./_st-tree-door.ts";

const CARD = "Aria";
const TRANSCRIPT_CHARS = 5 * 1024 * 1024;
const PROSE = "The harbor lantern sways in the wind while the tide pulls at the pilings. ".repeat(540);

/** A transcript of long turns, each reply carrying a second swipe, and the characters of variant text it holds. */
function longTranscript(): { readonly text: string; readonly variantChars: number } {
  const lines = [`{"user_name":"Bob","character_name":"${CARD}","create_date":"2025-07-18@12h00m00s"}`];
  let size = 0;
  let variantChars = 0;
  for (let turn = 0; size < TRANSCRIPT_CHARS; turn += 1) {
    const user = turn % 2 === 0;
    const mes = `${String(turn)} ${PROSE}`;
    const swipes = [mes, `alt ${PROSE.slice(0, 400)}`];
    const line = JSON.stringify({
      name: user ? "Bob" : CARD,
      ["is_user"]: user,
      ["is_system"]: false,
      ["send_date"]: "2025-07-18@12h00m01s",
      mes,
      ...(user ? {} : { swipes, ["swipe_id"]: 0 }),
    });
    lines.push(line);
    size += line.length + 1;
    variantChars += user ? mes.length : swipes.reduce((sum, swipe) => sum + swipe.length, 0);
  }
  return { text: lines.join("\n"), variantChars };
}

// On a database that only inserts, a table's largest rowid is its row count, read by one seek.
const LAST_ROWID = sql<number | null>`max(rowid)`;
async function landed(root: ServerTestHarness): Promise<{ readonly characters: number; readonly rooms: number }> {
  const [cards] = await root.db.select({ n: LAST_ROWID }).from(characters);
  const [rooms] = await root.db.select({ n: LAST_ROWID }).from(chats);
  return { characters: cards?.n ?? 0, rooms: rooms?.n ?? 0 };
}

test("a large chat hands the loop back at least once per slice it translates between its character and its first message", async () => {
  await using root = await harness();
  const { text, variantChars } = longTranscript();
  const id = await admit(root, { [ST_SETTINGS_FILE]: settings({}), [`characters/${CARD}.png`]: cardPng(root, CARD), [`chats/${CARD}/long.jsonl`]: text });
  const before = await landed(root);
  if (root.runAdmittedWorkload === undefined) {
    throw new Error("the harness owns workload execution only with startJobs: false");
  }

  // A chain of immediates stands for the rest of the server: each one runs only when the import hands the loop back.
  let turnsAfterCharacter = 0;
  let turnsBeforeRoom: number | null = null;
  const watch = { on: true };
  const watcher = (async (): Promise<void> => {
    while (watch.on && turnsBeforeRoom === null) {
      await new Promise((resolve) => setImmediate(resolve));
      const now = await landed(root);
      if (now.rooms > before.rooms) {
        turnsBeforeRoom = turnsAfterCharacter;
      } else if (now.characters > before.characters) {
        turnsAfterCharacter += 1;
      }
    }
  })();
  await root.runAdmittedWorkload(id, AbortSignal.timeout(WORKLOAD_DEADLINE_MS));
  watch.on = false;
  await watcher;

  const [chat] = (await root.services.chat.listChats({ principal: await root.principalFor(root.ownerId) })).items;
  expect(chat?.messageCount).toBe(text.split("\n").length - 1);
  // The write holds at most a stage's characters a stage and turns the loop once per stage before its room lands; the
  // translation turns it once per slice on top. Each count is a floor of the text over its bound.
  expect(turnsBeforeRoom).toBeGreaterThanOrEqual(Math.floor(variantChars / LANDING_STAGE_CHARS) + Math.floor(variantChars / CHAT_SLICE_BUDGET.chars));
});
