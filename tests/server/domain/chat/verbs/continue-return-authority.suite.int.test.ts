// @subject packages/server/src/domain/chat/verbs/turn.ts
// Current public authority can change after a valid commit without rolling canon back or leaking private channels.
import type { MessageView } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import { chatEvents, chatParticipants, messageVariants, statsCanonVersions } from "@orb/db";
import { ChatNotFoundError } from "@orb/server/domain/chat";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { and, eq, gt } from "drizzle-orm";
import { IMAGE_TOOL, TOOL_SIGNATURE } from "../engine/inline-image-physical.ts";
import {
  ADDITION,
  ADDITION_REASONING,
  PRIVATE_BODY,
  PRIVATE_PREFIX,
  PRIVATE_REASONING,
  privateContinuation,
  VISIBLE_BODY,
} from "./continue-private-physical.ts";

const METHODS = ["undoContinue", "revertContinue"] as const;
const RETURN_CASES = ["demotion", "membership", "history-floor", "host-floor", "member-floor"] as const;

async function handoff(f: Awaited<ReturnType<typeof privateContinuation>>, from: Principal, to: Principal): Promise<void> {
  const { h } = f.image;
  await h.root.services.chat.nominateHostHandoff({ principal: from, chatId: h.chatId, userId: to.userId });
  await h.root.services.chat.acceptHostHandoff({ principal: to, chatId: h.chatId });
}

function expectMemberView(view: MessageView, undo: boolean): void {
  expect(view.content).toBe(undo ? VISIBLE_BODY : VISIBLE_BODY + ADDITION);
  expect(view.reasoning).toBeNull();
  expect(view.toolCalls[0]).toMatchObject({ arguments: "{}", result: "Moon", textOffset: 13, exchangeTextEnd: 13 });
  expect(JSON.stringify(view)).not.toMatch(/host-secret|reason-private|base-private|a-private|private-native|<lie/u);
}

test.for(METHODS.flatMap((method) => RETURN_CASES.map((kind) => ({ method, kind }))))(
  "current restore return $method / $kind preserves the committed private snapshot under actual authority",
  async ({ method, kind }) => {
    await using f = await privateContinuation(true);
    const { h } = f.image;
    const { caller, currentHost } = await prepareReturn(f, method, kind);
    const args = { principal: caller, chatId: h.chatId, messageId: f.slot.id };
    const versions = await h.root.db.select().from(statsCanonVersions).orderBy(statsCanonVersions.ownerId);
    const oldVersion = versions.find(({ ownerId }) => ownerId === currentHost.userId)?.version ?? 0;
    const beforeEvents = await h.root.db.select().from(chatEvents).where(eq(chatEvents.chatId, h.chatId)).orderBy(chatEvents.seq);
    const lastEvent = beforeEvents.at(-1)?.seq ?? 0;
    const gate = f.held.hold(/insert into "chat_events"/u);
    const returning = h.root.services.chat[method](args);
    const settled = Promise.allSettled([returning]);
    const subscriptionAbort = new AbortController();
    try {
      await gate.reached;
      gate.disarm();
      const undo = method === "undoContinue";
      const landed = await h.root.db.select().from(messageVariants).where(eq(messageVariants.id, f.slot.selectedVariantId)).get();
      expect(landed?.content).toBe(undo ? PRIVATE_BODY : PRIVATE_BODY + ADDITION);
      expect(landed?.reasoning).toBe(undo ? PRIVATE_REASONING : PRIVATE_REASONING + ADDITION_REASONING);
      expect(landed?.metadata).toEqual({ ...f.before.metadata, continuationTools: { ...f.before.metadata?.continuationTools, undone: undo } });
      expect(landed?.toolCalls).toEqual(undo ? f.before.metadata?.continuationTools?.before : f.before.metadata?.continuationTools?.after);
      expect(landed).toEqual({
        ...f.before,
        content: undo ? PRIVATE_BODY : PRIVATE_BODY + ADDITION,
        reasoning: undo ? PRIVATE_REASONING : PRIVATE_REASONING + ADDITION_REASONING,
        rawContent: null,
        macroFreezes: null,
        metadata: { ...f.before.metadata, continuationTools: { ...f.before.metadata?.continuationTools, undone: undo } },
        toolCalls: undo ? f.before.metadata?.continuationTools?.before : f.before.metadata?.continuationTools?.after,
      });
      const committedVersions = await h.root.db.select().from(statsCanonVersions).orderBy(statsCanonVersions.ownerId);
      expect(committedVersions.find(({ ownerId }) => ownerId === currentHost.userId)?.version).toBe(oldVersion + 1);
      expect(committedVersions.filter(({ ownerId }) => ownerId !== currentHost.userId)).toEqual(
        versions.filter(({ ownerId }) => ownerId !== currentHost.userId),
      );
      const recipient = await changeAuthority(f, kind, currentHost);
      const changes = h.root.app.liveBuses.user.subscribeUserEvents(recipient.userId, subscriptionAbort.signal)[Symbol.asyncIterator]();
      const changed = changes.next();
      const fanSettled = Promise.allSettled([changed]);
      gate.release();
      try {
        await VERIFY_RETURN[kind](returning, f, undo);
        expect((await changed).value).toEqual({ type: "chatsChanged" });
        expect(await h.root.db.select().from(messageVariants).where(eq(messageVariants.id, f.slot.selectedVariantId)).get()).toEqual(landed);
        const commits = await h.root.db
          .select()
          .from(chatEvents)
          .where(and(eq(chatEvents.chatId, h.chatId), gt(chatEvents.seq, lastEvent), eq(chatEvents.type, "messageCommitted")));
        expect(commits).toHaveLength(1);
        expect(commits[0]?.payload).toMatchObject({ type: "messageCommitted", view: { content: landed?.content, reasoning: landed?.reasoning } });
      } finally {
        subscriptionAbort.abort();
        await changes.return?.();
        await fanSettled;
      }
    } finally {
      subscriptionAbort.abort();
      gate.release();
      await settled;
    }
  },
);

test.for(METHODS)("restore-first %s retains paid signed/tool state before the next actual generation replaces it", async (method) => {
  await using f = await privateContinuation(false);
  const { h } = f.image;
  const args = { principal: h.owner, chatId: h.chatId, messageId: f.slot.id };
  expect(f.before.metadata?.continuationTools?.before[0]?.hidden).toBe(true);
  expect(f.before.metadata?.continuationTools?.after[1]?.deleted).toBe(true);
  expect(f.before).toMatchObject({ tokensIn: 20, tokensOut: 8, tokenDetails: { input: [{ modality: "text", tokens: 20 }] } });
  if (method === "revertContinue") {
    await h.root.services.chat.undoContinue(args);
  }
  const version = await h.root.db.select().from(statsCanonVersions).where(eq(statsCanonVersions.ownerId, h.owner.userId)).get();
  const restored = await h.root.services.chat[method](args);
  const undo = method === "undoContinue";
  expect(restored.content).toBe(undo ? PRIVATE_BODY : PRIVATE_BODY + ADDITION);
  const row = await h.root.db.select().from(messageVariants).where(eq(messageVariants.id, f.slot.selectedVariantId)).get();
  expect(row?.costUsd).toBeGreaterThan(0);
  expect(row).toEqual({
    ...f.before,
    content: undo ? PRIVATE_BODY : PRIVATE_BODY + ADDITION,
    reasoning: undo ? PRIVATE_REASONING : PRIVATE_REASONING + ADDITION_REASONING,
    rawContent: null,
    macroFreezes: null,
    metadata: { ...f.before.metadata, continuationTools: { ...f.before.metadata?.continuationTools, undone: undo } },
    toolCalls: undo ? f.before.metadata?.continuationTools?.before : f.before.metadata?.continuationTools?.after,
  });
  expect(row?.metadata).toEqual({ ...f.before.metadata, continuationTools: { ...f.before.metadata?.continuationTools, undone: undo } });
  expect(row?.toolCalls).toEqual(undo ? f.before.metadata?.continuationTools?.before : f.before.metadata?.continuationTools?.after);
  expect((await h.root.db.select().from(statsCanonVersions).where(eq(statsCanonVersions.ownerId, h.owner.userId)).get())?.version).toBe(
    (version?.version ?? 0) + 1,
  );
  await f.nextContinuation();
  await h.root.settleBackground();
  const next = await h.root.db.select().from(messageVariants).where(eq(messageVariants.id, f.slot.selectedVariantId)).get();
  expect(next).toMatchObject({
    tokensIn: null,
    tokensOut: 0,
    cacheReadTokens: null,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    tokenDetails: { output: [{ modality: "text", tokens: 0 }] },
    responseCache: null,
    costUsd: null,
    costDetails: null,
    costProvenance: "unrecorded",
  });
  expectNativeB(next, f.before, undo);
  const afterGenerationVersion = await h.root.db.select().from(statsCanonVersions).where(eq(statsCanonVersions.ownerId, h.owner.userId)).get();
  // Paid observations and their canon transfer advance their own fences; measure the next restore from its actual boundary.
  const restoredB = await h.root.services.chat.undoContinue(args);
  expect(restoredB.content).toBe(row?.content);
  expect(restoredB.reasoning).toBe(row?.reasoning);
  expect((await h.root.db.select().from(statsCanonVersions).where(eq(statsCanonVersions.ownerId, h.owner.userId)).get())?.version).toBe(
    (afterGenerationVersion?.version ?? 0) + 1,
  );
});

function expectNativeB(next: typeof messageVariants.$inferSelect | undefined, before: typeof messageVariants.$inferSelect, undo: boolean): void {
  const restoredContent = undo ? PRIVATE_BODY : PRIVATE_BODY + ADDITION;
  const restoredReasoning = undo ? PRIVATE_REASONING : PRIVATE_REASONING + ADDITION_REASONING;
  expect(next?.content).toBe(`${restoredContent}B.B-end.`);
  expect(next?.reasoning).toBe(restoredReasoning);
  const priorCalls = undo ? before.metadata?.continuationTools?.before : before.metadata?.continuationTools?.after;
  const priorSignatures = undo ? before.metadata?.contentSignatures?.previous?.tools : before.metadata?.contentSignatures?.tools;
  const nextCall = next?.toolCalls?.at(-1);
  expect(priorSignatures).toHaveLength(undo ? 1 : 2);
  expect(next?.toolCalls).toEqual([
    ...(priorCalls ?? []),
    expect.objectContaining({
      toolCallId: "same",
      name: IMAGE_TOOL,
      arguments: "{}",
      result: "Moon",
      isError: false,
      durationMs: 0,
      textOffset: restoredContent.length + "B.".length,
      exchangeTextEnd: restoredContent.length + "B.".length,
      exchangeOrdinal: 0,
      callOrdinal: 0,
      turnId: expect.any(String),
    }),
  ]);
  expect(priorCalls?.map(({ turnId }) => turnId)).not.toContain(nextCall?.turnId);
  expect(next?.metadata?.continuationTools).toEqual({
    beforeContent: restoredContent,
    before: priorCalls,
    after: next?.toolCalls,
    undone: false,
  });
  const priorText = [
    { text: PRIVATE_PREFIX, thoughtSignature: "base-private" },
    { text: "Done.", thoughtSignature: "base-end-private" },
    ...(undo
      ? []
      : [
          { text: "A.", thoughtSignature: "a-private" },
          { text: "A-end.", thoughtSignature: "a-end-private" },
        ]),
  ];
  expect(next?.metadata?.contentSignatures).toEqual({
    content: `${restoredContent}B.B-end.`,
    text: [...priorText, { text: "B.", thoughtSignature: "b-private" }, { text: "B-end.", thoughtSignature: "b-end-private" }],
    images: [],
    tools: [...(priorSignatures ?? []), { toolCallId: "same", turnId: nextCall?.turnId, callOrdinal: 0, thoughtSignature: TOOL_SIGNATURE }],
    previous: { content: restoredContent, text: priorText, images: [], tools: priorSignatures },
  });
}

type ReturnKind = (typeof RETURN_CASES)[number];
type PrivateFixture = Awaited<ReturnType<typeof privateContinuation>>;
type ReturnVerifier = (returning: Promise<MessageView>, f: PrivateFixture, undo: boolean) => Promise<void>;

async function prepareReturn(
  f: PrivateFixture,
  method: (typeof METHODS)[number],
  kind: ReturnKind,
): Promise<{ readonly caller: Principal; readonly currentHost: Principal }> {
  const { h } = f.image;
  expect(f.before.content).toBe(PRIVATE_BODY + ADDITION);
  expect(f.before.reasoning).toBe(PRIVATE_REASONING + ADDITION_REASONING);
  expect(f.before.costUsd).toBeGreaterThan(0);
  expect(f.before.costProvenance).toBe("estimated");
  expect(f.before.metadata?.continuationTools?.before).toHaveLength(1);
  expect(f.before.metadata?.continuationTools?.after).toHaveLength(2);
  expect(f.before.metadata?.continuationTools?.before[0]?.hidden).toBe(true);
  expect(f.before.metadata?.continuationTools?.after[1]?.deleted).toBe(true);
  expect(f.before).toMatchObject({ tokensIn: 20, tokensOut: 8, tokenDetails: { input: [{ modality: "text", tokens: 20 }] } });
  for (const actor of [f.early, f.late]) {
    await h.root.services.chat.setMemberHistoryVisibility({ principal: h.owner, chatId: h.chatId, userId: actor.userId, visibility: "from-join" });
  }
  const early = await h.root.db
    .select()
    .from(chatParticipants)
    .where(and(eq(chatParticipants.chatId, h.chatId), eq(chatParticipants.userId, f.early.userId)))
    .get();
  const late = await h.root.db
    .select()
    .from(chatParticipants)
    .where(and(eq(chatParticipants.chatId, h.chatId), eq(chatParticipants.userId, f.late.userId)))
    .get();
  expect(early?.joinSeq).toBe(f.slot.seq);
  expect(late?.joinSeq).toBeGreaterThan(f.slot.seq);
  let caller = h.owner;
  let currentHost = h.owner;
  if (kind === "history-floor" || kind === "host-floor") {
    await handoff(f, h.owner, f.late);
    caller = f.late;
    currentHost = f.late;
  }
  if (kind === "member-floor") {
    caller = f.early;
  }
  if (method === "revertContinue") {
    await h.root.services.chat.undoContinue({ principal: caller, chatId: h.chatId, messageId: f.slot.id });
  }
  await h.root.settleBackground();
  return { caller, currentHost };
}

async function changeAuthority(f: PrivateFixture, kind: ReturnKind, currentHost: Principal): Promise<Principal> {
  const { h } = f.image;
  let recipient = currentHost;
  if (kind === "demotion" || kind === "membership") {
    await handoff(f, h.owner, f.early);
    recipient = f.early;
  }
  if (kind === "membership") {
    await h.root.services.chat.selfLeave({ principal: h.owner, chatId: h.chatId });
  }
  if (kind === "history-floor") {
    await handoff(f, f.late, h.owner);
    recipient = h.owner;
  }
  await h.root.settleBackground();
  return recipient;
}

async function expectRefusedReturn(returning: Promise<MessageView>): Promise<void> {
  await expect(returning).rejects.toBeInstanceOf(ChatNotFoundError);
}

async function expectMemberReturn(returning: Promise<MessageView>, _f: PrivateFixture, undo: boolean): Promise<void> {
  expectMemberView(await returning, undo);
}

async function expectHostReturn(returning: Promise<MessageView>, _f: PrivateFixture, undo: boolean): Promise<void> {
  const view = await returning;
  expect(view.content).toBe(undo ? PRIVATE_BODY : PRIVATE_BODY + ADDITION);
  expect(view.reasoning).toBe(undo ? PRIVATE_REASONING : PRIVATE_REASONING + ADDITION_REASONING);
  expect(view.toolCalls[0]?.textOffset).toBe(PRIVATE_PREFIX.length);
  expect(JSON.stringify(view)).not.toContain("private-native-tool-signature");
}

async function expectInclusiveReturn(returning: Promise<MessageView>, f: PrivateFixture, undo: boolean): Promise<void> {
  const view = await returning;
  expectMemberView(view, undo);
  expect(view.seq).toBe(f.slot.seq);
}

const VERIFY_RETURN: Record<ReturnKind, ReturnVerifier> = {
  demotion: expectMemberReturn,
  membership: expectRefusedReturn,
  "history-floor": expectRefusedReturn,
  "host-floor": expectHostReturn,
  "member-floor": expectInclusiveReturn,
};
