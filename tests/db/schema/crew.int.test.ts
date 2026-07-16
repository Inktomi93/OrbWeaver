// .int tests for schema/crew (D59 — the chat-crew baseline rider). Real libSQL :memory: via freshDb
// (FK PRAGMA ON). Covers: the enum test-mirrors (status ← CREW_EDIT_PROPOSAL_STATUSES, guide role ←
// MESSAGE_ROLES); crew_chats round-trip (config blob via crewConfigSchema, counter defaults 0) + the
// chat CASCADE; crew_plots round-trip; crew_edit_proposals lifecycle shape — pending default, the
// ONE-pending-per-variant partial unique (second pending collides; pending + resolved coexist), the
// status CHECK; crew_guides — composite (chatId, guideKey) PK, born defaults (system role, labeled,
// enabled, no auto-refresh), and injectionId SET NULL on injection delete (flush keeps the definition).

import type { CrewEditProposalStatus } from "@orb/contracts/crew";
import { CREW_EDIT_PROPOSAL_STATUSES, crewConfigSchema } from "@orb/contracts/crew";
import type { Db } from "@orb/db";
import { chatInjections, chats, crewChats, crewEditProposals, crewGuides, crewPlots, isConstraintViolation, messages, messageVariants } from "@orb/db";
import type { ChatId, ChatInjectionId, CrewEditProposalId, MessageId, MessageVariantId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { MESSAGE_ROLES } from "@orb/kit/message-role";
import { eq } from "drizzle-orm";
import { freshDb } from "../../support/db";
import { expect, test } from "../../support/fixtures";
import { seedChat } from "./_support.ts";

async function seedVariant(db: Db, chatId: ChatId, messageId: string, variantId: string): Promise<{ messageId: MessageId; variantId: MessageVariantId }> {
  const mid = castId<MessageId>(messageId);
  const vid = castId<MessageVariantId>(variantId);
  await db.insert(messages).values({ id: mid, chatId, seq: 1, role: "assistant" });
  await db.insert(messageVariants).values({ id: vid, messageId: mid, idx: 0, content: "reply" });
  return { messageId: mid, variantId: vid };
}

// ── Test-mirrors: the db column enums derive the ONE canonical tuples ──────────────────────────────────

test("crew_edit_proposals.status enum mirrors CREW_EDIT_PROPOSAL_STATUSES (derives, never re-spells)", () => {
  expect(crewEditProposals.status.enumValues).toEqual([...CREW_EDIT_PROPOSAL_STATUSES]);
});

test("crew_guides.role enum mirrors MESSAGE_ROLES (D32 — the one role axis)", () => {
  expect(crewGuides.role.enumValues).toEqual([...MESSAGE_ROLES]);
});

// ── crew_chats: config blob + counter columns ──────────────────────────────────────────────────────────

test("crew_chats round-trips the config blob and borns counters at 0", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, { id: "chat_crew_cfg" });
  const config = crewConfigSchema.parse({ version: 1 }); // every member defaults OFF

  await db.insert(crewChats).values({ chatId, config });
  const rows = await db.select().from(crewChats).where(eq(crewChats.chatId, chatId));
  expect(rows).toHaveLength(1);
  expect(rows[0]?.config).toEqual(config);
  expect(rows[0]?.config?.keeper.enabled).toBe(false);
  expect(rows[0]?.keeperLastSeq).toBe(0);
  expect(rows[0]?.cardEvolutionLastSeq).toBe(0);
  expect(rows[0]?.directorTurnCounter).toBe(0);
});

test("crew_chats + crew_plots CASCADE on chat delete (one crew per chat, no orphans)", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, { id: "chat_crew_cascade" });
  await db.insert(crewChats).values({ chatId });
  await db.insert(crewPlots).values({ chatId, arc: "the hidden storm", guidance: "foreshadow it", lastPassSeq: 4 });

  await db.delete(chats).where(eq(chats.id, chatId));
  expect(await db.select().from(crewChats)).toHaveLength(0);
  expect(await db.select().from(crewPlots)).toHaveLength(0);
});

test("crew_plots round-trips the twist banks (JSON string[] columns)", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, { id: "chat_crew_plot" });
  await db.insert(crewPlots).values({
    chatId,
    arc: "a slow-burn betrayal",
    twists: ["the letter is forged"],
    retiredTwists: ["the storm hit early"],
    guidance: "plant doubt about the letter",
    lastPassSeq: 42,
  });

  const rows = await db.select().from(crewPlots).where(eq(crewPlots.chatId, chatId));
  expect(rows[0]?.twists).toEqual(["the letter is forged"]);
  expect(rows[0]?.retiredTwists).toEqual(["the storm hit early"]);
  expect(rows[0]?.guidance).toBe("plant doubt about the letter");
});

// ── crew_edit_proposals: pending default + the one-pending-per-variant partial unique ──────────────────

test("crew_edit_proposals borns pending, round-trips notes, and FKs the variant", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, { id: "chat_crew_prop" });
  const { messageId, variantId } = await seedVariant(db, chatId, "message_p1", "message_variant_p1");

  const id = castId<CrewEditProposalId>("crewprop_roundtrip");
  await db.insert(crewEditProposals).values({
    id,
    chatId,
    messageId,
    variantId,
    proposedContent: "a tighter reply",
    notes: [{ kind: "prose", note: "echoed the player's dialogue" }],
    auditedHash: "sha256-of-audited-content",
  });

  const rows = await db.select().from(crewEditProposals).where(eq(crewEditProposals.id, id));
  expect(rows[0]?.status).toBe("pending"); // the column default
  expect(rows[0]?.notes).toEqual([{ kind: "prose", note: "echoed the player's dialogue" }]);
  expect(rows[0]?.originalContent).toBeNull(); // stamped only AT ACCEPT
  expect(rows[0]?.resolvedAt).toBeNull();
});

test("a second PENDING proposal on the same variant collides (replace-on-new, made durable)", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, { id: "chat_crew_dup" });
  const { messageId, variantId } = await seedVariant(db, chatId, "message_d1", "message_variant_d1");
  const base = { chatId, messageId, variantId, proposedContent: "v1", auditedHash: "h1" };
  await db.insert(crewEditProposals).values({ id: castId<CrewEditProposalId>("crewprop_dup_a"), ...base });

  let caught: unknown;
  try {
    await db.insert(crewEditProposals).values({ id: castId<CrewEditProposalId>("crewprop_dup_b"), ...base });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("unique");
});

test("a pending proposal coexists with RESOLVED ones on the same variant (the index is partial)", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, { id: "chat_crew_hist" });
  const { messageId, variantId } = await seedVariant(db, chatId, "message_h1", "message_variant_h1");
  const base = { chatId, messageId, variantId, proposedContent: "x", auditedHash: "h" };

  await db.insert(crewEditProposals).values({
    id: castId<CrewEditProposalId>("crewprop_hist_done"),
    ...base,
    status: "dismissed",
  });
  await db.insert(crewEditProposals).values({
    id: castId<CrewEditProposalId>("crewprop_hist_stale"),
    ...base,
    status: "stale",
  });
  await db.insert(crewEditProposals).values({ id: castId<CrewEditProposalId>("crewprop_hist_open"), ...base });

  const all = await db.select().from(crewEditProposals);
  expect(all).toHaveLength(3);
});

test("the status CHECK rejects a non-member status", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, { id: "chat_crew_badstatus" });
  const { messageId, variantId } = await seedVariant(db, chatId, "message_b1", "message_variant_b1");

  let caught: unknown;
  try {
    await db.insert(crewEditProposals).values({
      id: castId<CrewEditProposalId>("crewprop_bad"),
      chatId,
      messageId,
      variantId,
      proposedContent: "x",
      auditedHash: "h",
      status: "rejected" as CrewEditProposalStatus, // not a tuple member — the CHECK is the guard
    });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("check");
});

// ── crew_guides: composite PK + born defaults + the CREW-1 injection linkage ───────────────────────────

test("crew_guides borns the packaged defaults (system role, labeled, enabled, no auto-refresh)", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, { id: "chat_guide_defaults" });
  await db.insert(crewGuides).values({
    chatId,
    guideKey: "thinking",
    name: "Thinking",
    template: "[OOC: what is everyone thinking]",
    depth: 0,
  });

  const rows = await db.select().from(crewGuides).where(eq(crewGuides.chatId, chatId));
  expect(rows[0]?.role).toBe("system");
  expect(rows[0]?.labeled).toBe(true);
  expect(rows[0]?.autoRefresh).toBe(false);
  expect(rows[0]?.enabled).toBe(true);
  expect(rows[0]?.injectionId).toBeNull(); // no content yet
  expect(rows[0]?.lastRefreshSeq).toBeNull();
});

test("the (chatId, guideKey) composite PK rejects a duplicate definition", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, { id: "chat_guide_dup" });
  const guide = { chatId, guideKey: "clothes", name: "Clothes", template: "t", depth: 1 };
  await db.insert(crewGuides).values(guide);

  let caught: unknown;
  try {
    await db.insert(crewGuides).values(guide);
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)).toBeDefined();
});

test("deleting the linked injection NULLs injectionId and keeps the definition (flush semantics)", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, { id: "chat_guide_flush" });
  const injectionId = castId<ChatInjectionId>("chat_injection_guide");
  await db.insert(chatInjections).values({
    id: injectionId,
    chatId,
    position: "in_chat",
    role: "system",
    content: "Characters are currently thinking: …",
  });
  await db.insert(crewGuides).values({
    chatId,
    guideKey: "thinking",
    injectionId,
    name: "Thinking",
    template: "t",
    depth: 0,
  });

  await db.delete(chatInjections).where(eq(chatInjections.id, injectionId));
  const rows = await db.select().from(crewGuides).where(eq(crewGuides.chatId, chatId));
  expect(rows).toHaveLength(1); // the definition survives
  expect(rows[0]?.injectionId).toBeNull();
});
