// @subject tests/support/node/corpus-sdk-sessions.ts
// @subject packages/inference/src/backends/agent-sdk/session/store.ts
// @subject packages/server/src/domain/connection/persistence/session-entries.ts
import { assertReferentialIntegrity } from "@orb/db";
import { toChatRequest } from "@orb/inference";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { SDK_SCRIPT_IDENTITY_TYPE } from "./contract/sdk-process.ts";
import { CORPUS_SDK_HOLD, CORPUS_SDK_QUERY, CORPUS_SDK_REPLY, CORPUS_SDK_REUSE } from "./corpus-sdk-protocol.ts";
import { seedCorpusSdkActor, seedCorpusSdkSessions } from "./corpus-sdk-sessions.ts";
import { createCorpusSdkExecution } from "./corpus-sdk-wire.ts";
import { expect, test } from "./fixtures.ts";
import { createServerHarness, SECRET_BOX_TEST_KEY } from "./server.ts";

test("native resumed transcript identities replay without dropping distinct child turns", async () => {
  const replay = async (): Promise<ReturnType<typeof createCorpusSdkExecution>["receipts"]> => {
    const wire = createCorpusSdkExecution({ prompts: [CORPUS_SDK_QUERY, CORPUS_SDK_REUSE, CORPUS_SDK_REUSE] });
    await using root = await createServerHarness({ secretBoxKey: SECRET_BOX_TEST_KEY, sdkSpawn: wire.spawn });
    const actor = await seedCorpusSdkActor(root);
    const caller = await root.internalCallerFor(actor.principal.userId);
    const { chat } = await caller.chat.startChat({ characterIds: [], opening: "none" });
    const { resolved } = await root.app.runtime.resolve({ principal: actor.principal, connectionId: actor.connection.id, task: "chat", cachedFacts: true });
    if (resolved.task !== "chat") {
      throw new Error("native SDK identity control lost its chat task");
    }
    const connection = { ...resolved, task: resolved.task };
    const first = await root.app.runtime.executor.runChatTurn(
      toChatRequest({
        connection,
        chatId: chat.id,
        params: {},
        systemPrompt: { static: "", dynamic: "" },
        history: [
          { role: "user", content: [{ type: "text", text: "The deterministic SDK opening." }] },
          { role: "assistant", content: [{ type: "text", text: "The canonical seed reply." }] },
          { role: "user", content: [{ type: "text", text: CORPUS_SDK_QUERY }] },
        ],
      }),
    );
    const sessionId = wire.receipts[0]?.sessionId;
    expect(first).toMatchObject({ providerMetadata: { sdkSessionId: sessionId } });
    for (const prompt of [CORPUS_SDK_REUSE, CORPUS_SDK_REUSE]) {
      const result = await root.app.runtime.executor.runChatTurn({
        api: "agent-sdk",
        connection,
        chatId: chat.id,
        params: {},
        prompt,
        systemPrompt: { static: "", dynamic: "" },
      });
      expect(result.reply).toBe(CORPUS_SDK_REPLY);
      expect(result).toMatchObject({ providerMetadata: { sdkSessionId: sessionId } });
    }
    await wire.settle();
    const [seed, second, third] = wire.receipts;
    expect(wire.receipts).toHaveLength(3);
    expect(seed?.resume).toBe(sessionId);
    expect(wire.receipts.map((receipt) => receipt.sessionId)).toEqual(wire.receipts.map(() => seed?.resume));
    expect(third?.frames).toHaveLength((second?.frames.length ?? 0) + 2);
    const transcript = z.array(z.object({ uuid: z.uuid() })).parse(third?.frames);
    expect(new Set(transcript.map((frame) => frame.uuid)).size).toBe(transcript.length);
    expect(JSON.stringify(third?.frames)).toContain(CORPUS_SDK_QUERY);
    expect(JSON.stringify(third?.frames)).toContain(CORPUS_SDK_REUSE);
    expect(JSON.stringify(wire.receipts)).not.toContain(SDK_SCRIPT_IDENTITY_TYPE);
    expect(wire.children.every((child) => child.exitCode === 0 && child.signalCode === null)).toBe(true);
    return wire.receipts;
  };
  expect(await replay()).toEqual(await replay());
});

test("native SDK canon lineage persists, resumes, branches and returns without foreign ownership or empty-seed fabrication", async () => {
  const wire = createCorpusSdkExecution();
  await using root = await createServerHarness({ secretBoxKey: SECRET_BOX_TEST_KEY, sdkSpawn: wire.spawn });
  const result = await seedCorpusSdkSessions(root, wire);
  expect(result.empty.result.reply).toBe(CORPUS_SDK_REPLY);
  expect(result.empty.rows).toEqual([]);
  expect(result.seeded.rows).toHaveLength(1);
  expect(result.reused.rows).toEqual(result.seeded.rows);
  expect(result.rewound.rows).toEqual(result.seeded.rows);
  expect(result.branched.rows).toHaveLength(2);
  expect(result.branched.rows.filter((row) => row.isPrimary).map((row) => row.sdkSessionId)).toEqual([result.branched.rows.at(-1)?.sdkSessionId]);
  expect(result.readopted.rows.filter((row) => row.isPrimary).map((row) => row.sdkSessionId)).toEqual([result.seeded.rows[0]?.sdkSessionId]);
  expect(result.reseeded.rows).toHaveLength(result.readopted.rows.length);
  expect(result.reseeded.rows[0]?.sdkSessionId).toBe(result.seeded.rows[0]?.sdkSessionId);
  expect(result.reseeded.rows[0]?.canonHash).not.toBe(result.seeded.rows[0]?.canonHash);
  expect(result.restored.rows).toEqual(result.readopted.rows);
  expect(result.alternate.rows).toHaveLength(1);
  expect(result.alternate.rows[0]?.sdkSessionId).not.toBe(result.seeded.rows[0]?.sdkSessionId);
  expect(result.alternate.rows[0]?.connectionId).toBe(result.alternateConnection.id);
  expect(result.rows.filter((row) => row.isPrimary).map((row) => row.connectionId)).toEqual([result.connection.id, result.alternateConnection.id]);
  expect(result.seeded.result).toMatchObject({ reply: CORPUS_SDK_REPLY, providerMetadata: { sdkSessionId: result.seeded.rows[0]?.sdkSessionId } });
  expect(result.reused.result).toMatchObject({ reply: CORPUS_SDK_REPLY, providerMetadata: { sdkSessionId: result.seeded.rows[0]?.sdkSessionId } });
  expect(result.receipts).toHaveLength(10);
  const [, seededReceipt, , rewoundReceipt, , readoptedReceipt] = result.receipts;
  expect(seededReceipt).toMatchObject({ resume: result.seeded.rows[0]?.sdkSessionId, prompt: CORPUS_SDK_QUERY });
  expect(seededReceipt?.frames.length).toBeGreaterThan(0);
  for (const receipt of [rewoundReceipt, readoptedReceipt]) {
    expect(receipt).toMatchObject({ resume: seededReceipt?.resume, prompt: CORPUS_SDK_QUERY });
    expect(receipt?.frames).toEqual(seededReceipt?.frames);
    for (const tail of [CORPUS_SDK_REUSE, CORPUS_SDK_QUERY, CORPUS_SDK_REPLY]) {
      expect(JSON.stringify(receipt?.frames)).not.toContain(tail);
    }
  }
  const reuse = result.receipts.find(({ prompt }) => prompt === CORPUS_SDK_REUSE);
  expect(reuse?.resume).toBe(result.seeded.rows[0]?.sdkSessionId);
  expect(JSON.stringify(reuse?.frames)).toContain(CORPUS_SDK_REPLY);
  const branch = result.receipts.find(({ resume }) => resume === result.branched.rows.at(-1)?.sdkSessionId);
  expect(JSON.stringify(branch?.frames)).toContain("The alternative SDK branch is recorded.");
  expect(JSON.stringify(branch?.frames)).not.toContain("The original SDK branch is recorded.");
  expect(result.foreign.refusal).toBeInstanceOf(Error);
  expect(result.foreign.after).toEqual(result.foreign.before);
  expect(result.foreign.callsAfter).toBe(result.foreign.callsBefore);
  expect(result.cancellation).toMatchObject({ kind: "aborted" });
  expect(result.exits.every(({ exitCode, signalCode }) => exitCode === 0 && signalCode === null)).toBe(true);
  expect(result.receipts.some(({ resume, frames }) => resume !== null && frames.length > 0)).toBe(true);
  await assertReferentialIntegrity(root.db);
});

test("native SDK root disposal joins its actual held child before closing the corpus database", async () => {
  const wire = createCorpusSdkExecution({ deferHoldExit: true });
  await using root = await createServerHarness({ secretBoxKey: SECRET_BOX_TEST_KEY, sdkSpawn: wire.spawn });
  const actor = await seedCorpusSdkActor(root);
  const { resolved } = await root.app.runtime.resolve({ principal: actor.principal, connectionId: actor.connection.id, task: "chat", cachedFacts: true });
  if (resolved.task !== "chat") {
    throw new Error("native SDK disposal did not resolve its actual task");
  }
  const turn = root.app.runtime.executor
    .runChatTurn({
      api: "agent-sdk",
      connection: { ...resolved, task: resolved.task },
      params: {},
      prompt: CORPUS_SDK_HOLD,
      systemPrompt: { static: "", dynamic: "" },
    })
    .then(
      () => {
        throw new Error("disposed SDK child unexpectedly succeeded");
      },
      (error: Error) => error,
    );
  await wire.holding;
  let disposed = false;
  const disposal = root[Symbol.asyncDispose]().then(() => {
    disposed = true;
  });
  try {
    expect(await Promise.race([wire.eof.then(() => "eof"), disposal.then(() => "disposed")])).toBe("eof");
    expect(disposed).toBe(false);
    expect(wire.children.some((child) => child.exitCode === null && child.signalCode === null)).toBe(true);
    expect(await root.db.all(sql`select 1 as live`)).toEqual([{ live: 1 }]);
  } finally {
    wire.releaseHeldExit();
    await Promise.all([disposal, wire.settle()]);
  }
  expect(await turn).toMatchObject({ kind: "aborted" });
  expect(wire.children.every((child) => child.exitCode === 0 && child.signalCode === null)).toBe(true);
  await expect(root.db.all(sql`select 1`)).rejects.toThrow();
});
