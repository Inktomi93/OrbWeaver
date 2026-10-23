// @subject packages/server/src/domain/chat/persistence/role-encoding.ts
// @subject packages/server/src/domain/chat/verbs/turn.ts
import { createCharacterSchema } from "@orb/contracts/character";
import { DomainNotFoundError } from "@orb/kit/errors";
import { expect, test } from "@orb/testkit/node";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
  seedCorpusActors,
} from "@orb/testkit/node/composed";

const BODY = 'Visible receipt <lie character="Witness" truth="continuation-role-secret"/>';
const VISIBLE = "Visible receipt ";

test("a real member continuation restores the exact canonical snapshot through the stored-role fence without exposing host-only truth", async () => {
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: BODY,
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using root = await createServerHarness({ providerFetch: provider.execute });
  const { owner, secondUserId } = await seedCorpusActors(root);
  const member = await root.principalFor(secondUserId);
  const outsider = await root.principalFor((await root.actor()).id);
  const card = await root.services.character.create({
    principal: owner,
    input: createCharacterSchema.parse({ handle: "role-continuation", name: "Witness", description: "A continuation witness." }),
  });
  const room = await root.services.chat.startChat({ principal: owner, characterIds: [card.id], opening: "none" });
  const chatId = room.chat.id;
  const invitation = await root.services.chat.createInvite({ principal: owner, chatId, input: { invitedHandle: member.handle } });
  await root.services.chat.acceptInvite({ principal: member, inviteId: invitation.invite.id });
  const presence = new AbortController();
  root.app.presence.connect(owner.userId, presence.signal);
  try {
    const first = await root.services.chat.send({ principal: owner, chatId, content: "Begin the role receipt." });
    const reply = first.messages.find(({ role }) => role === "assistant");
    if (reply === undefined) {
      throw new Error("the actual provider turn did not persist its assistant reply");
    }
    expect(reply.content).toBe(BODY);
    const continued = await root.services.chat.continueTurn({ principal: member, chatId, messageId: reply.id });
    expect(continued.aborted).toBe(false);
    expect(continued.messages.find(({ id }) => id === reply.id)?.content).toBe(VISIBLE + VISIBLE);
    await expect(root.services.chat.undoContinue({ principal: outsider, chatId, messageId: reply.id })).rejects.toThrow(DomainNotFoundError);
    const undo = await root.services.chat.undoContinue({ principal: member, chatId, messageId: reply.id });
    expect(undo.content).toBe(VISIBLE);
    expect((await root.services.chat.listMessages({ principal: owner, chatId })).messages.find(({ id }) => id === reply.id)?.content).toBe(BODY);
    const revert = await root.services.chat.revertContinue({ principal: member, chatId, messageId: reply.id });
    expect(revert.content).toBe(VISIBLE + VISIBLE);
    expect((await root.services.chat.listMessages({ principal: owner, chatId })).messages.find(({ id }) => id === reply.id)?.content).toBe(BODY + BODY);
  } finally {
    presence.abort();
  }
});
