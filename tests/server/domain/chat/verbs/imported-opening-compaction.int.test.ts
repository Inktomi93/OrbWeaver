// @subject packages/server/src/domain/chat/verbs/compaction.ts
// @subject packages/server/src/domain/chat/persistence/queries.ts
// A first compaction over an import-born room must summarize its opening line, never skip it as "covered".
import { expect, test } from "@orb/testkit/node";
import { renumberFromZero } from "../persistence/legacy-canon.ts";
import { importedSeqs, importTranscript, LEGACY_IMPORT_ARMS, textRoom } from "../scenario-physical.ts";

const OPENING = "The lantern-lit opening line of the imported room.";
const REPLY = "The imported character's first answer.";
const SUMMARY = "The traveller lit a lantern and the character answered.";

test.for(LEGACY_IMPORT_ARMS)("$title: the first compaction window starts at the first imported message", async ({ legacy }) => {
  await using h = await textRoom([SUMMARY]);
  const chatId = await importTranscript(h, [
    { user: true, text: OPENING },
    { user: false, text: REPLY },
  ]);
  if (legacy) {
    await renumberFromZero(h, chatId);
  }
  const seqs = await importedSeqs(h, chatId);
  const result = await h.root.services.chat.compact({ principal: h.owner, chatId });
  expect(result).toEqual({ summary: SUMMARY, compactedAtSeq: seqs.at(-1), updated: true });
  const completions = h.requests.filter((request) => request.method === "POST" && new URL(request.url).pathname.endsWith("/chat/completions"));
  expect(completions).toHaveLength(1);
  const wire = await completions[0]?.clone().text();
  expect(wire).toContain("Conversation to summarize:");
  expect(wire).toContain(OPENING);
  expect(wire).toContain(REPLY);
});
