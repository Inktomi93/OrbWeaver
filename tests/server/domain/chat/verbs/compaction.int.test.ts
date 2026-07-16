// The manual `compact` lever + the lock-free `runCompaction` core (chat.md §Decisions; D25). Proves against a
// real libSQL db: compaction summarizes the history AFTER the current checkpoint via the injected `summarize`
// role, writes the PORTABLE checkpoint (`chats.compactSummary` + `compactedAtSeq`), and resume reads
// `seq > compactedAtSeq`. The summarizer is a deterministic stub. Reached through `createCompaction(ctx, {emit})`.

import type { ChatBusEvent } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { SummarizeInput, SummarizeOptions } from "@orb/contracts/role-clients";
import type { Db } from "@orb/db";
import { chats } from "@orb/db";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import type { ChatContext } from "../../../../../packages/server/src/domain/chat/context";
import { ChatOperationError } from "../../../../../packages/server/src/domain/chat/contract/errors";
import { createCompaction } from "../../../../../packages/server/src/domain/chat/verbs/compaction";
import { freshDb } from "../../../../support/db";
import { principal as makePrincipal } from "../../../../support/factories/principal.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeChatContext, seedChat, seedMessage, seedParticipant, seedUser } from "../_support";

let db: Db;
let emitted: ChatBusEvent[];
let summarizeCalls: SummarizeInput[][];

beforeEach(async () => {
  db = await freshDb();
  emitted = [];
  summarizeCalls = [];
});

const emit = (event: ChatBusEvent): Promise<void> => {
  emitted.push(event);
  return Promise.resolve();
};

function principal(userId: UserId): Principal {
  return makePrincipal(userId, { handle: castId<Handle>("h") });
}

/** A deterministic summarizer stub that records its inputs + returns a fixed summary text. */
function ctxWithSummarizer(text: string): ChatContext {
  const summarize: ChatContext["summarize"] = (inputs: SummarizeInput[], _opts?: SummarizeOptions) => {
    summarizeCalls.push(inputs);
    return Promise.resolve({
      items: [{ text, usage: { tokensIn: 1, tokensOut: 1, costUsd: null } }],
      model: "stub",
    });
  };
  return makeChatContext(db, { summarize });
}

async function seedRoom(): Promise<{
  host: UserId;
  member: UserId;
  chatId: Awaited<ReturnType<typeof seedChat>>;
}> {
  const host = await seedUser(db, "host");
  const member = await seedUser(db, "member");
  const chatId = await seedChat(db, "a");
  await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
  await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
  return { host, member, chatId };
}

describe("compact — the manual lever (host)", () => {
  test("summarizes the canon, writes the D25 checkpoint, emits chatUpdated", async () => {
    const { host, chatId } = await seedRoom();
    await seedMessage(db, chatId, 1, { role: "user", authorUserId: host, content: "hello" });
    await seedMessage(db, chatId, 2, { role: "assistant", content: "hi there" });
    const compaction = createCompaction(ctxWithSummarizer("THE SUMMARY"), { emit });

    const result = await compaction.compact({ principal: principal(host), chatId });

    expect(result).toEqual({ summary: "THE SUMMARY", compactedAtSeq: 2 });
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.compactSummary).toBe("THE SUMMARY");
    expect(row?.compactedAtSeq).toBe(2);
    expect(emitted).toEqual([{ type: "chatUpdated", chatId }]);
    const userPrompt = summarizeCalls.at(0)?.at(0)?.userPrompt ?? "";
    expect(userPrompt).toContain("hello");
    expect(userPrompt).toContain("hi there");
  });

  test("a member is refused (not_host)", async () => {
    const { member, chatId } = await seedRoom();
    const compaction = createCompaction(ctxWithSummarizer("x"), { emit });
    const err = await compaction.compact({ principal: principal(member), chatId }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("not_host");
    expect(summarizeCalls).toHaveLength(0);
  });
});

describe("runCompaction — the injected core (resume math)", () => {
  test("the second pass only summarizes seq > compactedAtSeq, folding in the prior summary", async () => {
    const { host, chatId } = await seedRoom();
    await seedMessage(db, chatId, 1, { role: "user", authorUserId: host, content: "first" });
    const compaction = createCompaction(ctxWithSummarizer("SUMMARY-A"), { emit });
    const first = await compaction.runCompaction({ chatId });
    expect(first.compactedAtSeq).toBe(1);

    await seedMessage(db, chatId, 2, { role: "assistant", content: "second" });
    const compaction2 = createCompaction(ctxWithSummarizer("SUMMARY-B"), { emit });
    const second = await compaction2.runCompaction({ chatId });

    expect(second).toEqual({ summary: "SUMMARY-B", compactedAtSeq: 2 });
    const prompt = summarizeCalls.at(-1)?.at(0)?.userPrompt ?? "";
    expect(prompt).toContain("second"); // the new turn
    expect(prompt).not.toContain("first"); // the already-compacted turn is NOT re-summarized
    expect(prompt).toContain("SUMMARY-A"); // the prior checkpoint folds in
  });

  test("no new turns after the checkpoint is an idempotent no-op (the summarizer is not called)", async () => {
    const { host, chatId } = await seedRoom();
    await seedMessage(db, chatId, 1, { role: "user", authorUserId: host, content: "only" });
    const compaction = createCompaction(ctxWithSummarizer("ONCE"), { emit });
    await compaction.runCompaction({ chatId });
    summarizeCalls = [];

    const again = await compaction.runCompaction({ chatId });
    expect(again).toEqual({ summary: "ONCE", compactedAtSeq: 1 });
    expect(summarizeCalls).toHaveLength(0); // nothing new to summarize
  });
});
