// tests/server/domain/rpg/chat-ops/gather — the game turn's GATHER (rpg-design/05 §4.6-4.7 + the owner ruling
// 2026-07-27). Drives the real `gatherTurnContext` through the harness's `chatOps`: a non-game chat is
// byte-identical null; a game contributes the depth-0 reminder injection. THE CHARACTER TURN IS ALWAYS
// TOOL-LESS PROSE in every mode — state is captured by a DEDICATED STATE ROUND post-commit (cheap = a tool
// round, reliable = an extraction), so the gather NEVER returns tools + the char-turn reminder omits the
// update-guidance (the char turn is never asked to call a tool).

import type { RpgActorVolatile } from "@orb/contracts/rpg";
import type { Db } from "@orb/db";
import { messages, rpgSnapshots } from "@orb/db";
import type { ChatId, MessageId, MessageVariantId, RpgGameId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { freshDb } from "../../../../support/db";
import type { RpgHarness } from "../_support";
import { addVariant, emptyState, expect, principal, seedChat, seedLiteGame, seedMessage, target, test } from "../_support";

/** One cast actor's volatile row carrying an HP value (the delta block's numeric plane). */
function kael(hp: number): RpgActorVolatile {
  return { actorRef: { kind: "cast", castKey: "kael" }, hp: { value: hp, max: 20 }, pools: [], conditions: [], inventory: [], wallet: [], status: "" };
}

/** Seed a COMMITTED snapshot on a fresh assistant slot — the delta block's lineage input. Returns the slot's
 *  message + selected-variant ids so a swipe test can fork the slot. */
async function seedBeat(
  db: Db,
  opts: { chatId: ChatId; gameId: RpgGameId; seq: number; hp: number },
): Promise<{ messageId: MessageId; variantId: MessageVariantId }> {
  const { messageId, variantId } = await seedMessage(db, opts.chatId, opts.seq, { role: "assistant" });
  await db.insert(rpgSnapshots).values({
    ...target({ gameId: opts.gameId, chatId: opts.chatId, seq: opts.seq, variantId, key: `beat${opts.seq}` }),
    ...emptyState(),
    actorState: [kael(opts.hp)],
    fieldLocks: null,
    committed: 1,
  });
  return { messageId, variantId };
}

/** Insert a COMMITTED snapshot keyed to an EXISTING variant (a swipe sibling on an already-seeded slot). */
async function seedVariantSnapshot(
  db: Db,
  opts: { chatId: ChatId; gameId: RpgGameId; seq: number; variantId: MessageVariantId; key: string; hp: number },
): Promise<void> {
  await db.insert(rpgSnapshots).values({
    ...target({ gameId: opts.gameId, chatId: opts.chatId, seq: opts.seq, variantId: opts.variantId, key: opts.key }),
    ...emptyState(),
    actorState: [kael(opts.hp)],
    fieldLocks: null,
    committed: 1,
  });
}

/** The gather's reminder text (the depth-0 system injection content) — the delta block lands inside it. */
async function reminderText(h: RpgHarness, chatId: ChatId): Promise<string> {
  const out = await h.chatOps.gatherTurnContext(chatId, undefined, false);
  return out?.injections[0]?.content ?? "";
}

test("a NON-game chat gathers null (byte-identical no-op)", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, "plain");
  const { chatOps } = (await seedLiteGame(db)).h; // build a harness, but gather a DIFFERENT (non-game) chat
  const out = await chatOps.gatherTurnContext(chatId, undefined, false);
  expect(out).toBeNull();
});

test("a game contributes ONE depth-0 system reminder injection, no macros", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db);
  const out = await h.chatOps.gatherTurnContext(chatId, undefined, false);
  expect(out).not.toBeNull();
  expect(out?.macros).toEqual({});
  expect(out?.injections).toHaveLength(1);
  const inj = out?.injections[0];
  expect(inj?.position).toBe("in_chat");
  expect(inj?.depth).toBe(0);
  expect(inj?.role).toBe("system");
});

test("reliable mode: the char turn is tool-less, guidance omitted (state round fires post-turn)", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db); // seedLiteGame defaults to reliable
  const out = await h.chatOps.gatherTurnContext(chatId, undefined, false);
  expect(out?.tools).toEqual([]);
  expect(out?.injections[0]?.content).not.toContain("update_party");
});

test("cheap mode: the char turn is ALSO tool-less (owner ruling — the dedicated tool round runs post-commit)", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db);
  await h.service.updateConfig({ principal: principal("host"), chatId, extractionMode: "cheap" });
  const out = await h.chatOps.gatherTurnContext(chatId, undefined, false);
  // The char turn NEVER mounts tools — cheap captures state in the dedicated tool round, not on the narration.
  expect(out?.tools).toEqual([]);
  expect(out?.injections[0]?.content).not.toContain("update_party");
  // The reminder still injects the tracked state as flavor (the depth-0 system injection is always present).
  expect(out?.injections).toHaveLength(1);
  expect(out?.injections[0]?.role).toBe("system");
});

test("readonly (manual-steering): tool-less char turn + the reminder still steers via hand-edited state", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db, { trackersReadOnly: true });
  await h.service.updateConfig({ principal: principal("host"), chatId, extractionMode: "cheap" });
  const out = await h.chatOps.gatherTurnContext(chatId, undefined, false);
  expect(out?.tools).toEqual([]);
  expect(out?.injections[0]?.content).not.toContain("update_party");
});

// ── the DELTA BLOCK (§2.7) — the gather's second ladder read + swipe-consistency + hand-edit-as-source ─────
// These drive the REAL gather over a committed-snapshot lineage: the delta must resolve prev→current on the
// selected chain (swipe-consistency is a flush→read ROUND-TRIP, not a staging peek) and a host hand-edit must
// surface as a delta next turn (the GM tweak lands — every write source lands in the snapshot uniformly).

test("the delta block renders prev→current across a two-beat committed lineage", async () => {
  const db = await freshDb();
  const { chatId, gameId, h } = await seedLiteGame(db);
  await seedBeat(db, { chatId, gameId, seq: 2, hp: 12 }); // prior beat
  await seedBeat(db, { chatId, gameId, seq: 4, hp: 16 }); // current head
  const text = await reminderText(h, chatId);
  // cur (seq 4, HP 16) vs prev (seq 2, HP 12) → a +4 delta line, before the license.
  expect(text).toContain("CHANGES SINCE LAST BEAT");
  expect(text).toContain("kael HP 12→16 (+4)");
});

test("swipe-consistency: selecting a sibling variant re-resolves the delta on the NEW lineage", async () => {
  const db = await freshDb();
  const { chatId, gameId, h } = await seedLiteGame(db);
  await seedBeat(db, { chatId, gameId, seq: 2, hp: 12 }); // shared prior beat
  // The current head slot (seq 4) has TWO swipe variants: A (HP 16) selected by seedBeat, B (HP 8).
  const head = await seedBeat(db, { chatId, gameId, seq: 4, hp: 16 });
  const variantB = await addVariant(db, head.messageId, 1, "swipe B");
  await seedVariantSnapshot(db, { chatId, gameId, seq: 4, variantId: variantB, key: "beat4B", hp: 8 });

  // A selected ⇒ delta is 12→16 (+4).
  expect(await reminderText(h, chatId)).toContain("kael HP 12→16 (+4)");

  // Swipe to B ⇒ the delta re-resolves prev(12)→cur(8) = a -4 line (the OTHER outcome), byte-different.
  await db.update(messages).set({ selectedVariantId: variantB }).where(eq(messages.id, head.messageId));
  const swiped = await reminderText(h, chatId);
  expect(swiped).toContain("kael HP 12→8 (-4)");
  expect(swiped).not.toContain("12→16");
});

test("hand-edit-as-source: a host editSnapshot surfaces as a delta on the next gather", async () => {
  const db = await freshDb();
  const { chatId, gameId, h } = await seedLiteGame(db);
  // A committed prior beat (HP 12) is the lineage head; there is no newer beat yet.
  await seedBeat(db, { chatId, gameId, seq: 2, hp: 12 });
  // The host hand-edits HP to 18 — editSnapshot clone-forwards onto a fresh committed narrator slot (the head
  // was committed), which becomes the new current head; the prior beat (HP 12) is now the prev on the lineage.
  await h.service.editSnapshot({ principal: principal("host"), chatId, patch: { actorState: [kael(18)] } });
  const text = await reminderText(h, chatId);
  // The GM tweak lands next turn: prev(12)→cur(18) = a +6 delta line (the diff is agnostic to the WRITE source).
  expect(text).toContain("kael HP 12→18 (+6)");
});
