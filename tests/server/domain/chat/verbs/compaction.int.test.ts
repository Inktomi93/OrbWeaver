// The manual `compact` lever + the lock-free `runCompaction` core (#9 full-reset chained marker). Proves against
// a real libSQL db: compaction rebuilds ONE marker over [prior marker + prompt-eligible turns since it, through
// the coverage point] via the injected `quietGenerate` (a non-canon generation through the chat's OWN model — NOT
// the summarizer rail), writes the PORTABLE marker (`chats.compactSummary` + `compactedAtSeq`). The quiet
// generation is a deterministic stub. Reached through `createCompaction(ctx, { emit, quietGenerate, resolveConnection })`.

import type { ChatBusEvent } from "@orb/contracts/chat";
import type { ResolvedConnection } from "@orb/contracts/connection";
import type { Principal } from "@orb/contracts/identity";
import { PROSE_SLOTS } from "@orb/contracts/prose";
import type { Db } from "@orb/db";
import { chats } from "@orb/db";
import type { CharacterId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { beforeEach, describe } from "vitest";
import type { QuietGenerate, QuietGenerateParams } from "../../../../../packages/server/src/domain/chat/contract/context.ts";
import { ChatOperationError } from "../../../../../packages/server/src/domain/chat/contract/errors.ts";
import { createCompaction } from "../../../../../packages/server/src/domain/chat/verbs/compaction.ts";
import { freshDb } from "../../../../support/db.ts";
import { principal as makePrincipal } from "../../../../support/factories/principal.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeChatContext, seedChat, seedMessage, seedParticipant, seedUser, testConnection } from "../_support.ts";

let db: Db;
let emitted: ChatBusEvent[];
let quietCalls: QuietGenerateParams[];

beforeEach(async () => {
  db = await freshDb();
  emitted = [];
  quietCalls = [];
});

const emit = (event: ChatBusEvent): Promise<void> => {
  emitted.push(event);
  return Promise.resolve();
};

function principal(userId: UserId): Principal {
  return makePrincipal(userId, { handle: castId<Handle>("h") });
}

const CONNECTION = testConnection("vllm", "agent-sdk");
const OWNER = castId<UserId>("user_host");
const resolveConnection = (): Promise<ResolvedConnection> => Promise.resolve(CONNECTION);

/** A deterministic quiet-generation stub that records its params + returns a fixed marker text (or empty). */
function quietStub(text: string): QuietGenerate {
  return (params: QuietGenerateParams) => {
    quietCalls.push(params);
    return Promise.resolve({ text, costUsd: null });
  };
}

/** Build `createCompaction` deps over a fresh ctx with the given quiet-generation output. */
function compactionWith(text: string): ReturnType<typeof createCompaction> {
  return createCompaction(makeChatContext(db), { emit, quietGenerate: quietStub(text), resolveConnection });
}

async function seedRoom(): Promise<{ host: UserId; member: UserId; chatId: Awaited<ReturnType<typeof seedChat>> }> {
  const host = await seedUser(db, castId<Handle>("host"));
  const member = await seedUser(db, castId<Handle>("member"));
  const chatId = await seedChat(db, "a");
  await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
  await seedParticipant(db, { chatId, key: "m", userId: member, role: "member" });
  return { host, member, chatId };
}

describe("compact — the manual lever (host)", () => {
  test("builds the marker via the chat's model, writes the checkpoint, emits chatUpdated", async () => {
    const { host, chatId } = await seedRoom();
    await seedMessage(db, chatId, 1, { role: "user", authorUserId: host, content: "hello" });
    await seedMessage(db, chatId, 2, { role: "assistant", content: "hi there" });
    const compaction = compactionWith("THE MARKER");

    const result = await compaction.compact({ principal: principal(host), chatId });

    expect(result).toEqual({ summary: "THE MARKER", compactedAtSeq: 2, updated: true });
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.compactSummary).toBe("THE MARKER");
    expect(row?.compactedAtSeq).toBe(2);
    expect(emitted).toEqual([{ type: "chatUpdated", chatId }]);
    // The quiet generation rode the chat's resolved connection (agent-sdk), NOT a summarizer rail.
    expect(quietCalls.at(0)?.connection).toBe(CONNECTION);
    const userText = quietCalls.at(0)?.userText ?? "";
    expect(userText).toContain("hello");
    expect(userText).toContain("hi there");
  });

  // PROSE-1 census 77 — the summarizer instruction is a per-USER slot resolved against the ROOM HOST via
  // `ctx.resolveChatProse`. Unset ⇒ the shipped default (the arm above rides it); set ⇒ the host's bytes.
  test("the summarizer instruction is the room host's prose slot", async () => {
    const { host, chatId } = await seedRoom();
    await seedMessage(db, chatId, 1, { role: "user", authorUserId: host, content: "hello" });
    const shipped = createCompaction(makeChatContext(db), { emit, quietGenerate: quietStub("M"), resolveConnection });
    await shipped.compact({ principal: principal(host), chatId });
    expect(quietCalls.at(0)?.systemPrompt).toBe(PROSE_SLOTS["chat.compaction.system"].text);

    // A fresh prompt-eligible turn so the second pass has a non-empty span (an already-covered span no-ops).
    await seedMessage(db, chatId, 2, { role: "assistant", content: "hi there" });
    const overridden = createCompaction(
      makeChatContext(db, { resolveChatProse: () => Promise.resolve({ "chat.compaction.system": { text: "Summarize like a ship's log.", baseVersion: 1 } }) }),
      { emit, quietGenerate: quietStub("M"), resolveConnection },
    );
    await overridden.compact({ principal: principal(host), chatId });
    expect(quietCalls.at(1)?.systemPrompt).toBe("Summarize like a ship's log.");
  });

  test("a member is refused (not_host)", async () => {
    const { member, chatId } = await seedRoom();
    const compaction = compactionWith("x");
    const err = await compaction.compact({ principal: principal(member), chatId }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("not_host");
    expect(quietCalls).toHaveLength(0);
  });
});

describe("runCompaction — the injected core (chained-marker math)", () => {
  test("the second pass folds the prior marker + only the turns since the coverage point", async () => {
    const { host, chatId } = await seedRoom();
    await seedMessage(db, chatId, 1, { role: "user", authorUserId: host, content: "first" });
    const first = await compactionWith("MARKER-A").runCompaction({ chatId, connection: CONNECTION, ownerId: OWNER });
    expect(first).toEqual({ summary: "MARKER-A", compactedAtSeq: 1, updated: true });

    await seedMessage(db, chatId, 2, { role: "assistant", content: "second" });
    const second = await compactionWith("MARKER-B").runCompaction({ chatId, connection: CONNECTION, ownerId: OWNER });

    expect(second).toEqual({ summary: "MARKER-B", compactedAtSeq: 2, updated: true });
    const text = quietCalls.at(-1)?.userText ?? "";
    expect(text).toContain("second"); // the new turn
    expect(text).not.toContain("first"); // the already-compacted turn is not re-read
    expect(text).toContain("MARKER-A"); // the prior marker folds in (chained)
  });

  test("no new turns after the coverage point is an idempotent no-op (updated:false, no generation)", async () => {
    const { host, chatId } = await seedRoom();
    await seedMessage(db, chatId, 1, { role: "user", authorUserId: host, content: "only" });
    const compaction = compactionWith("ONCE");
    await compaction.runCompaction({ chatId, connection: CONNECTION, ownerId: OWNER });
    quietCalls = [];

    const again = await compaction.runCompaction({ chatId, connection: CONNECTION, ownerId: OWNER });
    expect(again).toEqual({ summary: "ONCE", compactedAtSeq: 1, updated: false });
    expect(quietCalls).toHaveLength(0); // nothing new to summarize
  });

  test("coveragePoint caps the compacted span (rows above the coverage point only)", async () => {
    const { host, chatId } = await seedRoom();
    await seedMessage(db, chatId, 1, { role: "user", authorUserId: host, content: "aged-out-one" });
    await seedMessage(db, chatId, 2, { role: "assistant", content: "aged-out-two" });
    await seedMessage(db, chatId, 3, { role: "user", authorUserId: host, content: "still-in-window" });
    const compaction = compactionWith("SPAN");

    // The fit boundary kept seq 3 → the span above is seqs 1-2; compact through the coverage point 2.
    const result = await compaction.runCompaction({ chatId, connection: CONNECTION, ownerId: OWNER, coveragePoint: 2 });

    expect(result).toEqual({ summary: "SPAN", compactedAtSeq: 2, updated: true });
    const text = quietCalls.at(-1)?.userText ?? "";
    expect(text).toContain("aged-out-one");
    expect(text).toContain("aged-out-two");
    expect(text).not.toContain("still-in-window"); // seq 3 is above the coverage point
  });

  test("prompt-hidden rows are EXCLUDED from the marker but still advance the checkpoint (no peek leak)", async () => {
    const { host, chatId } = await seedRoom();
    await seedMessage(db, chatId, 1, { role: "user", authorUserId: host, content: "visible-canon" });
    await seedMessage(db, chatId, 2, { role: "assistant", content: "SECRET-HIDDEN-LINE", excludedFromPrompt: true });
    const compaction = compactionWith("MARKER");

    const result = await compaction.runCompaction({ chatId, connection: CONNECTION, ownerId: OWNER });

    expect(result.compactedAtSeq).toBe(2); // the checkpoint advances over the whole span
    const text = quietCalls.at(-1)?.userText ?? "";
    expect(text).toContain("visible-canon");
    expect(text).not.toContain("SECRET-HIDDEN-LINE");
  });

  // D129: the marker stands in for PROMPT-ELIGIBLE history, so the row-PURPOSE policy gates it exactly like
  // the host's hide does. A `comment` is `prompt:"never"` — folding one into a durable, member-peekable marker
  // would smuggle into the prompt the very row the policy holds out of it. Read off `MESSAGE_KIND_POLICY`, so
  // this is the policy record's enforcement, not a second kind list.
  test("a `comment`-kind row is EXCLUDED from the marker but still advances the checkpoint", async () => {
    const { host, chatId } = await seedRoom();
    await seedMessage(db, chatId, 1, { role: "user", authorUserId: host, content: "visible-canon" });
    await seedMessage(db, chatId, 2, { role: "assistant", kind: "comment", content: "OOC-SIDEBAR-LINE" });
    const compaction = compactionWith("MARKER");

    const result = await compaction.runCompaction({ chatId, connection: CONNECTION, ownerId: OWNER });

    expect(result.compactedAtSeq).toBe(2);
    const text = quietCalls.at(-1)?.userText ?? "";
    expect(text).toContain("visible-canon");
    expect(text).not.toContain("OOC-SIDEBAR-LINE");
  });

  test("§3.5 summary plane: a card collapses to the STUB and a hidden tag's truth NEVER reaches the summarizer transcript", async () => {
    const { host, chatId } = await seedRoom();
    const lieTag = '<lie character="Zandik" type="location" truth="He is in the crypt" reason="the heist"/>';
    await seedMessage(db, chatId, 1, { role: "user", authorUserId: host, content: 'look:\n:::card title="Terminal"\n<div>multi-KB blob</div>\n:::' });
    await seedMessage(db, chatId, 2, { role: "assistant", content: `He nods. ${lieTag} nothing more.` });
    const compaction = compactionWith("MARKER");

    await compaction.runCompaction({ chatId, connection: CONNECTION, ownerId: OWNER });

    const text = quietCalls.at(-1)?.userText ?? "";
    // The card rides as its deterministic stub — the summarizer never eats the blob.
    expect(text).toContain("[card: Terminal]");
    expect(text).not.toContain("multi-KB blob");
    // The member-peekable marker pipeline never sees the truth bytes (the §3.6 leak class, closed here too).
    expect(text).toContain("He nods.");
    expect(text).not.toContain("crypt");
    expect(text).not.toContain("<lie");
  });

  test("a span of ONLY hidden rows advances the checkpoint without a generation (updated:false)", async () => {
    const { host, chatId } = await seedRoom();
    await seedMessage(db, chatId, 1, { role: "user", authorUserId: host, content: "seed" });
    await compactionWith("SEED-MARKER").runCompaction({ chatId, connection: CONNECTION, ownerId: OWNER });
    quietCalls = [];
    await seedMessage(db, chatId, 2, { role: "assistant", content: "hidden-only", excludedFromPrompt: true });
    const compaction = compactionWith("SHOULD-NOT-FIRE");

    const result = await compaction.runCompaction({ chatId, connection: CONNECTION, ownerId: OWNER });

    expect(quietCalls).toHaveLength(0); // no spend on an empty transcript
    expect(result).toEqual({ summary: "SEED-MARKER", compactedAtSeq: 2, updated: false }); // checkpoint advances, marker preserved
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.compactedAtSeq).toBe(2);
  });

  test("FAILURE HONESTY: an EMPTY generation over a real span THROWS compaction_empty, marker untouched", async () => {
    const { host, chatId } = await seedRoom();
    await seedMessage(db, chatId, 1, { role: "user", authorUserId: host, content: "one" });
    await compactionWith("GOOD-MARKER").runCompaction({ chatId, connection: CONNECTION, ownerId: OWNER });
    await seedMessage(db, chatId, 2, { role: "assistant", content: "two" });

    // The model returns empty over a NON-empty span — a real failure. The marker must NOT be blanked/advanced.
    const err = await compactionWith("")
      .runCompaction({ chatId, connection: CONNECTION, ownerId: OWNER })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ChatOperationError);
    expect((err as ChatOperationError).code).toBe("compaction_empty");
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.compactSummary).toBe("GOOD-MARKER"); // untouched
    expect(row?.compactedAtSeq).toBe(1); // NOT advanced — an honest retry next turn
  });

  test("FAILURE HONESTY: a THROWING generation propagates (never a half-written marker)", async () => {
    const { host, chatId } = await seedRoom();
    await seedMessage(db, chatId, 1, { role: "user", authorUserId: host, content: "one" });
    const throwing: QuietGenerate = () => Promise.reject(new Error("provider down"));
    const compaction = createCompaction(makeChatContext(db), { emit, quietGenerate: throwing, resolveConnection });

    const err = await compaction.runCompaction({ chatId, connection: CONNECTION, ownerId: OWNER }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    const [row] = await db.select().from(chats).where(eq(chats.id, chatId));
    expect(row?.compactSummary).toBeNull(); // nothing written
  });

  test("COST VISIBILITY: a non-null generation cost stamps a cost-only stats delta on the owner", async () => {
    const { host, chatId } = await seedRoom();
    await seedMessage(db, chatId, 1, { role: "user", authorUserId: host, content: "one" });
    // Record every applyStatsDelta the core fires (the spy the injected-op seam allows).
    const deltas: { ownerId: string; costUsd: number | undefined; characterId: CharacterId | null; model: string | null }[] = [];
    const ctx = makeChatContext(db, {
      applyStatsDelta: (_batch, _db, delta) => {
        deltas.push({ ownerId: delta.ownerId, costUsd: delta.costUsd, characterId: delta.characterId, model: delta.model });
      },
    });
    const costing: QuietGenerate = () => Promise.resolve({ text: "MARKER", costUsd: 0.042 });
    const compaction = createCompaction(ctx, { emit, quietGenerate: costing, resolveConnection });

    await compaction.runCompaction({ chatId, connection: CONNECTION, ownerId: OWNER });

    // The compaction spend landed as a cost-only, character/model-less owner delta.
    const costDelta = deltas.find((d) => d.costUsd === 0.042);
    expect(costDelta).toBeDefined();
    expect(costDelta?.ownerId).toBe(OWNER);
    expect(costDelta?.characterId).toBeNull();
    expect(costDelta?.model).toBeNull();
  });

  test("a NULL generation cost stamps NO cost delta (a local vLLM turn reports none)", async () => {
    const { host, chatId } = await seedRoom();
    await seedMessage(db, chatId, 1, { role: "user", authorUserId: host, content: "one" });
    const deltas: unknown[] = [];
    const ctx = makeChatContext(db, { applyStatsDelta: (_b, _d, delta) => void deltas.push(delta) });
    const compaction = createCompaction(ctx, { emit, quietGenerate: quietStub("MARKER"), resolveConnection }); // quietStub → costUsd:null

    await compaction.runCompaction({ chatId, connection: CONNECTION, ownerId: OWNER });
    expect(deltas).toHaveLength(0);
  });
});
