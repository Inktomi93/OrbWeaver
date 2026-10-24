// A solo room with a second user, for the attachment send gates.

import type { ServerTestHarness } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
  seedCorpusActors,
  seedRecallRoom,
} from "@orb/testkit/node/composed";

export async function room(): Promise<
  AsyncDisposable &
    Pick<Awaited<ReturnType<typeof seedCorpusActors>>, "owner" | "secondUserId"> & {
      readonly root: ServerTestHarness;
      readonly chatId: Awaited<ReturnType<typeof seedRecallRoom>>;
    }
> {
  await using construction = new AsyncDisposableStack();
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "ok",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  const root = construction.use(await createServerHarness({ providerFetch: provider.execute }));
  const { owner, secondUserId } = await seedCorpusActors(root);
  const chatId = await seedRecallRoom(await root.internalCallerFor(owner.userId));
  const lifetime = construction.move();
  return { root, owner, secondUserId, chatId, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}
