// A refinery call on a bound connection that withholds background consent reads differently from one with nothing bound.
// @subject packages/server/src/domain/refinery/substrate/summarizer.ts
// @subject packages/server/src/domain/refinery/verbs/preflight.ts
// @subject packages/server/src/domain/refinery/verbs/run-stage.ts

import { createCharacterSchema } from "@orb/contracts/character";
import { expect, test } from "@orb/testkit/node";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
  seedCorpusConnections,
} from "@orb/testkit/node/composed";

async function messageOf(attempt: Promise<unknown>): Promise<string> {
  const failure = await attempt.then(
    () => null,
    (error: unknown) => error,
  );
  expect(failure).toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  return failure instanceof Error ? failure.message : "";
}

test("a refused background connection is not reported as an unbound one, in preflight and in a run", async () => {
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "unused",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using root = await createServerHarness({ providerFetch: physical.execute });
  const principal = await root.principalFor(root.ownerId);
  const rows = await seedCorpusConnections(root, principal);
  const caller = await root.internalCallerFor(root.ownerId);
  const character = await caller.character.create({
    input: createCharacterSchema.parse({ handle: "refusal-card", name: "Refusal card", description: "A card to refine." }),
  });
  const session = await caller.refinery.startSession({ characterId: character.id });

  await root.services.connection.update({ principal, connectionId: rows.text.id, patch: { allowBackground: false } });
  const refusedPreflight = await messageOf(caller.refinery.preflight({ sessionId: session.id }));
  const refusedRun = await messageOf(caller.refinery.runStage({ sessionId: session.id, stage: "score" }));

  await root.services.connection.setBinding({ principal, task: "summarize", connectionId: null });
  const unboundPreflight = await messageOf(caller.refinery.preflight({ sessionId: session.id }));
  const unboundRun = await messageOf(caller.refinery.runStage({ sessionId: session.id, stage: "score" }));

  expect(refusedPreflight).not.toBe(unboundPreflight);
  expect(refusedRun).not.toBe(unboundRun);
  expect(physical.requests.filter((request) => !request.startsWith("GET "))).toEqual([]);
});
