// @subject packages/server/src/domain/chat/substrate/member-visibility.ts
// The producer stamps member bytes once, so a member resuming the durable log mid-span never reads the truth.
import { createCharacterSchema } from "@orb/contracts/character";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
} from "@orb/testkit/node/corpus-provider.ts";
import { seedCorpusActors } from "@orb/testkit/node/corpus-seed.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";

const TRUTH_HEAD = "stamp-truth-";
const TRUTH_TAIL = "resumed-tail";
// The hidden span straddles three deltas, so a resume cursor can land inside it.
const CHUNKS = ["Visible opening ", '<lie character="Witness" truth="', TRUTH_HEAD, `${TRUTH_TAIL}"/>`, " visible close"];

test("every durable resume cursor gives a member the stamped bytes, never the hidden truth", async () => {
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: CHUNKS.join(""),
    chatChunks: CHUNKS,
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using root = await createServerHarness({ providerFetch: provider.execute });
  const { owner, secondUserId } = await seedCorpusActors(root);
  const member = await root.principalFor(secondUserId);
  const card = await root.services.character.create({
    principal: owner,
    input: createCharacterSchema.parse({ handle: "stamp-witness", name: "Witness", description: "A hidden-span witness." }),
  });
  const room = await root.services.chat.startChat({ principal: owner, characterIds: [card.id], opening: "none" });
  const chatId = room.chat.id;
  const invitation = await root.services.chat.createInvite({ principal: owner, chatId, input: { invitedHandle: member.handle } });
  await root.services.chat.acceptInvite({ principal: member, inviteId: invitation.invite.id });
  const presence = new AbortController();
  root.app.presence.connect(owner.userId, presence.signal);
  try {
    await root.services.chat.send({ principal: owner, chatId, content: "Begin the witness turn." });
  } finally {
    presence.abort();
  }
  const hostLog = await root.services.chat.replayChatEvents({ principal: owner, chatId });
  const textDeltas = hostLog.filter(({ event }) => event.type === "delta" && event.delta.kind === "text");
  // The control: the host log really carries the truth, split across separate deltas.
  expect(textDeltas.filter(({ event }) => JSON.stringify(event).includes(TRUTH_HEAD))).toHaveLength(1);
  expect(textDeltas.filter(({ event }) => JSON.stringify(event).includes(TRUTH_TAIL))).toHaveLength(1);
  const cursors = [0, ...textDeltas.map(({ seq }) => seq)];
  const resumes = await Promise.all(cursors.map((afterSeq) => root.services.chat.replayChatEvents({ principal: member, chatId, afterSeq })));
  for (const [index, rows] of resumes.entries()) {
    const bytes = JSON.stringify(rows);
    expect(bytes, `resume after seq ${String(cursors[index])}`).not.toContain(TRUTH_HEAD);
    expect(bytes, `resume after seq ${String(cursors[index])}`).not.toContain(TRUTH_TAIL);
  }
  expect(JSON.stringify(resumes[0])).toContain("visible close");
});
