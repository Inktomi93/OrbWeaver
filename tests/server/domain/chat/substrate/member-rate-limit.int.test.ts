// @subject packages/contracts/src/chat/member-projection.ts
// @subject packages/server/src/domain/chat/verbs/fork.ts
// The provider's rate-limit state belongs to the host's connection: the host reads it on the history page and the
// turn outcome, a member reads none of it on the page, in the durable replay or in a copy of the room they fork.
import type { MessageView } from "@orb/contracts/chat";
import { builtinProvider, modelIdSchema } from "@orb/contracts/inference";
import { PUBLIC_PEER_ADDRESS } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import {
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  createChatRoot,
  createCorpusProviderExecution,
  SECRET_BOX_TEST_KEY,
} from "@orb/testkit/node/composed";
import { anthropicTextReply } from "@orb/testkit/node/helpers";

const MODEL = modelIdSchema.parse("claude-opus-5");
const REQUESTS_LIMIT = 100;
const REQUESTS_REMAINING = 5;
const RESET_AT = "2026-06-01T12:00:00.000Z";

const assistantRows = (messages: readonly MessageView[]): readonly MessageView[] => messages.filter((row) => row.role === "assistant");

test("a member reads no rate-limit state on the page, in the replay or in a forked copy, and the host reads it", async () => {
  const endpoint = builtinProvider("anthropic")?.baseUrl;
  if (endpoint === undefined) {
    throw new Error("Anthropic provider has no endpoint");
  }
  const provider = createCorpusProviderExecution({
    baseUrl: endpoint,
    modelIds: [MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "unused",
    images: [],
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    anthropicMessages: () => anthropicTextReply(MODEL, "The lamp is lit."),
  });
  await using h = await createChatRoot({
    memoryEnabled: false,
    server: { secretBoxKey: SECRET_BOX_TEST_KEY, networkExecution: { resolver: () => Promise.resolve([PUBLIC_PEER_ADDRESS]) } },
    providerFetch: async (input, init) => {
      const reply = await provider.execute(new Request(input, init));
      const headers = new Headers(reply.headers);
      headers.set("anthropic-ratelimit-requests-limit", String(REQUESTS_LIMIT));
      headers.set("anthropic-ratelimit-requests-remaining", String(REQUESTS_REMAINING));
      headers.set("anthropic-ratelimit-requests-reset", RESET_AT);
      return new Response(reply.body, { status: reply.status, headers });
    },
  });
  const credential = await h.root.services.credentials.add({ principal: h.owner, provider: "anthropic", key: "controlled-corpus-key" });
  const connection = await h.root.services.connection.create({
    principal: h.owner,
    providerId: "anthropic",
    credentialId: credential.id,
    baseUrl: null,
    model: MODEL,
  });
  await h.caller.connection.setBinding({ task: "chat", connectionId: connection.id });
  const member = await h.root.principalFor((await h.root.actor()).id);
  const invitation = await h.root.services.chat.createInvite({ principal: h.owner, chatId: h.chatId, input: { invitedHandle: member.handle } });
  await h.root.services.chat.acceptInvite({ principal: member, inviteId: invitation.invite.id });
  await h.root.services.chat.commitMessage({ principal: h.owner, chatId: h.chatId, content: "A line to answer." });

  await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId, intent: { effort: "low" } });

  const stated = { status: "allowed_warning", resetsAt: Date.parse(RESET_AT) };
  // Control: the host's page carries the stamp, so a member's null is the projection and not an absent stamp.
  const hosted = assistantRows((await h.root.services.chat.listMessages({ principal: h.owner, chatId: h.chatId })).messages);
  expect(hosted.map((row) => row.rateLimit)).toEqual([stated]);

  const page = (await h.root.services.chat.listMessages({ principal: member, chatId: h.chatId })).messages;
  const replay = await h.root.services.chat.replayChatEvents({ principal: member, chatId: h.chatId });
  const committed = replay.flatMap(({ event }) => (event.type === "messageCommitted" && event.view !== undefined ? [event.view] : []));
  expect(assistantRows(committed)).not.toHaveLength(0);
  for (const rows of [assistantRows(page), assistantRows(committed)]) {
    expect(rows.map((row) => row.rateLimit)).toEqual(rows.map(() => null));
  }

  // The forker hosts the copy and reads it verbatim, so the copy itself must hold no stamp.
  await h.root.services.chat.selfLeave({ principal: h.owner, chatId: h.chatId });
  const fork = await h.root.services.chat.forkChat({ principal: member, chatId: h.chatId });
  const copied = assistantRows((await h.root.services.chat.listMessages({ principal: member, chatId: fork.chat.id })).messages);
  expect(copied).not.toHaveLength(0);
  expect(copied.map((row) => row.rateLimit)).toEqual(copied.map(() => null));
});
