// @subject packages/server/src/domain/chat/service.ts
// @subject packages/server/src/domain/chat/engine/engine.ts
import "@orb/testkit/node/composed-real.ts";
import { createCharacterSchema } from "@orb/contracts/character";
import { chatDigests, chatSegments, messages } from "@orb/db";
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
import { eq } from "drizzle-orm";
import { vi } from "vitest";
// biome-ignore lint/performance/noNamespaceImport: vi.spyOn requires the shared live module export; a named-import wrapper cannot observe production.
import * as engineModule from "../../../../../packages/server/src/domain/chat/engine/engine.ts";
// biome-ignore lint/performance/noNamespaceImport: vi.spyOn requires the shared live module export; a named-import wrapper cannot observe production.
import * as digestModule from "../../../../../packages/server/src/domain/chat/memory/generate/digests.ts";
// biome-ignore lint/performance/noNamespaceImport: vi.spyOn requires the shared live module export; a named-import wrapper cannot observe production.
import * as memoryModule from "../../../../../packages/server/src/domain/chat/memory/generate/turn.ts";
// biome-ignore lint/performance/noNamespaceImport: vi.spyOn requires the shared live module export; a named-import wrapper cannot observe production.
import * as memoryQueries from "../../../../../packages/server/src/domain/chat/memory/persistence/queries.ts";
// biome-ignore lint/performance/noNamespaceImport: vi.spyOn requires the shared live module export; a named-import wrapper cannot observe production.
import * as recallModule from "../../../../../packages/server/src/domain/chat/memory/recall/recall.ts";

test("the production root gives the engine no request authority or full RPG control surface", async () => {
  const engine = vi.spyOn(engineModule, "createTurnEngine");
  try {
    await using root = await createServerHarness();
    expect(engine).toHaveBeenCalledOnce();
    const args = engine.mock.calls[0];
    if (args === undefined) {
      throw new Error("the production root did not construct its real turn engine");
    }
    const [context] = args;
    expect("can" in context).toBe(false);
    expect("generatePicture" in context).toBe(false);
    expect("resolveHandle" in context).toBe(false);
    expect("resolveChat" in context).toBe(false);
    expect(context.rpg).not.toBeNull();
    expect(Object.keys(context.rpg ?? {}).toSorted()).toEqual(["markDicePreRollEligible", "onTurnAborted", "onTurnCompleted"]);
    expect(context.db).toBe(root.db);
    expect(context.now()).toBe(root.clock.now());
  } finally {
    engine.mockRestore();
  }
});

test("a member's actual turn uses the frozen host connection while keeping the member's message attribution", async () => {
  const engine = vi.spyOn(engineModule, "createTurnEngine");
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "The orbital marker remains with its host.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  try {
    await using root = await createServerHarness({ providerFetch: provider.execute });
    const { owner, secondUserId } = await seedCorpusActors(root);
    const member = await root.principalFor(secondUserId);
    const card = await root.services.character.create({
      principal: owner,
      input: createCharacterSchema.parse({ handle: "engine-authority-host", name: "Ledger keeper", description: "An orbital witness." }),
    });
    const room = await root.services.chat.startChat({ principal: owner, characterIds: [card.id], opening: "none" });
    const invite = await root.services.chat.createInvite({ principal: owner, chatId: room.chat.id, input: { invitedHandle: member.handle } });
    await root.services.chat.acceptInvite({ principal: member, inviteId: invite.invite.id });
    const args = engine.mock.calls[0];
    if (args === undefined) {
      throw new Error("the production root did not construct its real turn engine");
    }
    const run = vi.spyOn(args[0], "runChatTurn");
    if (args[0].rpg === null) {
      throw new Error("the production root did not bind RPG terminal hooks");
    }
    const completed = vi.spyOn(args[0].rpg, "onTurnCompleted");
    const hostOnline = new AbortController();
    root.app.presence.connect(owner.userId, hostOnline.signal);
    try {
      const outcome = await root.services.chat.send({ principal: member, chatId: room.chat.id, content: "Witness the orbital marker.", intent: {} });
      expect(outcome.aborted).toBe(false);
      expect(run).toHaveBeenCalled();
      for (const [request] of run.mock.calls) {
        expect(request.connection.ownerId).toBe(owner.userId);
        expect(request.connection.ownerId).not.toBe(member.userId);
      }
      expect(outcome.messages.map((message) => message.content)).toContain("The orbital marker remains with its host.");
      expect(completed).toHaveBeenCalledOnce();
      await Promise.all(completed.mock.results.map((result) => result.value));
      const terminal = completed.mock.calls[0];
      if (terminal === undefined) {
        throw new Error("the committed turn did not reach the real RPG terminal hook");
      }
      expect(terminal[0]).toBe(room.chat.id);
      expect(terminal[4]).toMatchObject({ kind: "send", triggeredBy: member.userId, connection: { ownerId: owner.userId } });
      expect(terminal[4].transcript.map((message) => message.content)).toContain("The orbital marker remains with its host.");
      const canon = await root.db.select().from(messages).where(eq(messages.chatId, room.chat.id));
      expect(canon.filter((message) => message.role === "user")).toMatchObject([{ authorUserId: member.userId }]);
    } finally {
      hostOnline.abort();
      completed.mockRestore();
      run.mockRestore();
    }
  } finally {
    engine.mockRestore();
  }
});

test("bound memory ports build genuine shared and witnessed character buckets after a scoped group turn", async () => {
  const engine = vi.spyOn(engineModule, "createTurnEngine");
  const digests = vi.spyOn(digestModule, "generateDigests");
  const build = vi.spyOn(memoryModule, "buildTurnMemory");
  const recall = vi.spyOn(recallModule, "recallMemory");
  const horizons = vi.spyOn(memoryQueries, "loadWitnessHorizons");
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "The orbital witnesses retain the ledger.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  try {
    await using root = await createServerHarness({ providerFetch: provider.execute });
    const { owner } = await seedCorpusActors(root);
    const caller = await root.internalCallerFor(owner.userId);
    await caller.settings.updateUserSettingsSection({ section: "memory", patch: { enabled: true } });
    await caller.settings.updateAppSettings({ partial: { memoryDefaults: { mode: "mixA", blockSize: 1, verbatimWindow: 0, maxTier: 0 } } });
    const first = await caller.character.create({
      input: createCharacterSchema.parse({ handle: "first-orbital-witness", name: "First witness", description: "An orbital ledger witness." }),
    });
    const second = await caller.character.create({
      input: createCharacterSchema.parse({ handle: "second-orbital-witness", name: "Second witness", description: "Another orbital ledger witness." }),
    });
    const room = await caller.chat.startChat({ characterIds: [first.id, second.id], opening: "none" });
    await caller.chat.setGroupConfig({ chatId: room.chat.id, config: { output: "per-speaker", cardScope: "scoped", policy: "list" } });
    const args = engine.mock.calls[0];
    if (args === undefined) {
      throw new Error("the production root did not construct its real turn engine");
    }
    const [context] = args;
    const outcome = await root.services.chat.send({
      principal: owner,
      chatId: room.chat.id,
      content: "Both witnesses remember this orbital ledger.",
      intent: {},
    });
    expect(outcome.aborted).toBe(false);
    expect(build).toHaveBeenCalled();
    await Promise.all(build.mock.results.map((result) => result.value));
    for (const [, input] of build.mock.calls) {
      expect(input).toMatchObject({ chatId: room.chat.id, funderUserId: owner.userId, runAsUserId: owner.userId });
      expect(input.signal).toBe(context.backgroundSignal);
      expect("can" in input).toBe(false);
    }
    const witnessedRecall = recall.mock.calls.filter(([, input]) => input.witnessing !== undefined);
    expect(witnessedRecall.map(([, input]) => input.scope.scopedCharacterId)).toEqual(expect.arrayContaining([first.id, second.id]));
    for (const [, input] of witnessedRecall) {
      expect(input.scope).toMatchObject({ chatId: room.chat.id, isGroup: true });
      expect(input.witnessing).toEqual([{ joinSeq: 0, leftSeq: null }]);
    }
    expect(horizons.mock.calls).toEqual(
      expect.arrayContaining([
        [root.db, room.chat.id, first.id],
        [root.db, room.chat.id, second.id],
      ]),
    );
    const scopedBuilds = digests.mock.calls.filter(([, input]) => input.witnessing !== undefined);
    expect(scopedBuilds.map(([, input]) => input.scope.scopedCharacterId)).toEqual(expect.arrayContaining([first.id, second.id]));
    for (const [, input] of scopedBuilds) {
      expect(input.witnessing).toEqual([{ joinSeq: 0, leftSeq: null }]);
    }
    const stored = await root.db.select().from(chatDigests).where(eq(chatDigests.chatId, room.chat.id));
    const buckets = [...new Set(stored.map((row) => row.scopedCharacterId))];
    expect(buckets).toEqual(expect.arrayContaining([first.id, second.id]));
    expect(buckets.filter((id) => id !== first.id && id !== second.id)).toHaveLength(1);
    expect(await root.db.select().from(chatSegments).where(eq(chatSegments.chatId, room.chat.id))).not.toEqual([]);
  } finally {
    build.mockRestore();
    recall.mockRestore();
    horizons.mockRestore();
    digests.mockRestore();
    engine.mockRestore();
  }
});
