// tests/server/domain/rpg/chat-ops/gather — the game turn's GATHER (rpg-design/05 §4.6-4.7 + the owner ruling
// 2026-07-27). Drives the real `gatherTurnContext` through the harness's `chatOps`: a non-game chat is
// byte-identical null; a game contributes the depth-0 reminder injection. The gather NEVER returns REGISTRY
// tools (`tools: []` in every mode — a registry tool would be executed and recursed on) and the reminder never
// carries update-guidance. On `folded` (R1) it DOES contribute `terminalTools`: the same 7 state tools, mounted
// on the character turn as a write surface whose calls are read back rather than executed.

import type { RpgActorVolatile } from "@orb/contracts/rpg";
import type { Db } from "@orb/db";
import { messages, rpgSnapshots } from "@orb/db";
import type { ChatId, MessageId, MessageVariantId, RpgGameId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { freshDb } from "../../../../support/db";
import type { RpgHarness } from "../_support";
import { addVariant, emptyState, expect, principal, questId, seedChat, seedLiteGame, seedMessage, target, test } from "../_support";

/** One cast actor's volatile row carrying an HP value (the delta block's numeric plane). */
function kael(hp: number): RpgActorVolatile {
  return { actorRef: { kind: "cast", castKey: "kael" }, hp: { value: hp, max: 20 }, trackerValues: {}, conditions: [], inventory: [], wallet: [], status: "" };
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

test("#40 a DISENGAGED game gathers null (byte-identical no-op — reminder/steering/macros all off, rows preserved)", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db);
  await h.service.updateConfig({ principal: principal("host"), chatId, patch: { engaged: false } });
  expect(await h.chatOps.gatherTurnContext(chatId, undefined, false)).toBeNull();
  // Reversible: re-engage and the gather contributes again (the game rows were never touched).
  await h.service.updateConfig({ principal: principal("host"), chatId, patch: { engaged: true } });
  expect(await h.chatOps.gatherTurnContext(chatId, undefined, false)).not.toBeNull();
});

test("a game contributes ONE depth-0 system reminder injection + the rpg macro/CEL feed (parity-plus §12)", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db);
  const out = await h.chatOps.gatherTurnContext(chatId, undefined, false);
  expect(out).not.toBeNull();
  // An empty seeded game stages the lite-relevant macro KEYS (all empty-string here) — the full-mode keys
  // (rpgMap/rpgMorale/…) stay ABSENT ⇒ they resolve "". A READ mirror, never a write.
  expect(out?.macros).toEqual({ rpgSceneState: "", rpgCast: "", rpgQuests: "", rpgDelta: "" });
  expect(Object.keys(out?.macros ?? {})).not.toContain("rpgMap");
  // The `rpg` CEL binding is always staged on a game turn (the whole scene/cast/quests read surface).
  expect(out?.celBindings).toHaveProperty("rpg");
  expect(out?.injections).toHaveLength(1);
  const inj = out?.injections[0];
  expect(inj?.position).toBe("in_chat");
  expect(inj?.depth).toBe(0);
  expect(inj?.role).toBe("system");
  // P4: the M2 card wire knob rides the structural gather contract (default 0 = every card stubs), and the
  // default-on `immersiveHtml` composes the card teach into the reminder (the `:::card` grammar line).
  expect(out?.cardKeepLastX).toBe(0);
  expect(inj?.content).toContain(":::card");
});

// The steeringNote substitution fix (end-to-end through the gather): a host-authored steeringNote with
// {{user}}/{{char}} renders to the ACTIVE persona name / the Ruling-B `{{char}}` — BOTH resolved CHAT-SIDE and
// threaded in via the `steerIdentity` arg (chat owns identity resolution; rpg splices, never re-derives).
// NEVER literal braces reaching the wire injection.
test("the reminder RENDERS the steeringNote's {{user}}/{{char}} from chat's threaded identity (not literal)", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db);
  await h.service.updateConfig({ principal: principal("host"), chatId, patch: { steeringNote: "{{user}} keeps running into {{char}} at the konbini." } });

  // chat's threaded binding: {{user}} = the active persona, {{char}} = the SOLO single cast name (Ruling B).
  const out = await h.chatOps.gatherTurnContext(chatId, undefined, false, { user: "Nate", char: "Niko" });
  const reminder = out?.injections[0]?.content ?? "";

  expect(reminder).toContain("Nate keeps running into Niko at the konbini.");
  expect(reminder).not.toContain("{{user}}");
  expect(reminder).not.toContain("{{char}}");
});

// Ruling B (Chat-Macro-Resolution.md): a host/null-speaker `{{char}}` is the CAST — the JOINED cast names in a
// multi-character room (== {{group}}), the single name in solo. Chat computes the joined value and threads it;
// the reminder splices it verbatim (NOT a re-derived first-roster protagonist, the corrected binding).
test("Ruling B: a MULTI-character game's steeringNote {{char}} renders the JOINED CAST (chat's value, not one protagonist)", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db);
  await h.service.updateConfig({ principal: principal("host"), chatId, patch: { steeringNote: "Keep {{char}} distinct in voice." } });

  // Chat threads the Ruling-B joined cast (`joinedCastName(room.castNames)` — roster order): "Niko, Aria".
  const out = await h.chatOps.gatherTurnContext(chatId, undefined, false, { user: "Nate", char: "Niko, Aria" });
  const reminder = out?.injections[0]?.content ?? "";

  expect(reminder).toContain("Keep Niko, Aria distinct in voice.");
  expect(reminder).not.toContain("{{char}}");
});

// GUIDED-SAFE end-to-end: a steeringNote's non-identity macros ({{random}}/{{setvar}}) do NOT resolve through
// the gather — only identity substitution (the steer-neutralization ruling).
test("the gather does NOT grant the steeringNote full macro power — {{random}}/{{setvar}} stay literal", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db);
  await h.service.updateConfig({ principal: principal("host"), chatId, patch: { steeringNote: "As {{user}}: {{random::a::b}}{{setvar::x::1}}" } });

  const out = await h.chatOps.gatherTurnContext(chatId, undefined, false, { user: "Nate", char: "Niko" });
  const reminder = out?.injections[0]?.content ?? "";

  expect(reminder).toContain("As Nate:"); // {{user}} resolved
  expect(reminder).toContain("{{random::a::b}}"); // volatile — NOT rolled
  expect(reminder).toContain("{{setvar::x::1}}"); // variable — NOT executed
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

// ── the P6 macro × rpg FEED (parity-plus §12) — the gather populates rpgSceneState/rpgCast/rpgQuests + the `rpg`
// CEL tree from the SAME tracker view the reminder reads (one projection, three consumers). A READ mirror.

/** Seed a COMMITTED snapshot carrying a scene (location + present cast with a relationship + an active quest) —
 *  the populated-feed input. The tracker view resolves this current head; roster (party sheets) stays empty. */
async function seedScene(db: Db, opts: { chatId: ChatId; gameId: RpgGameId; seq: number }): Promise<void> {
  const { variantId } = await seedMessage(db, opts.chatId, opts.seq, { role: "assistant" });
  await db.insert(rpgSnapshots).values({
    ...target({ gameId: opts.gameId, chatId: opts.chatId, seq: opts.seq, variantId, key: `scene${opts.seq}` }),
    ...emptyState(),
    location: "Village of Dunmoor",
    presentCharacters: [{ key: "mari", name: "Mari", emoji: "", mood: "wary", relationship: { kind: "enemy", label: "" } }],
    quests: [
      {
        id: questId("key"),
        name: "The Missing Key",
        status: "active",
        description: "",
        objectives: [{ id: "o1", text: "find the locksmith", completed: false }],
      },
    ],
    fieldLocks: null,
    committed: 1,
  });
}

test("the gather populates rpgSceneState/rpgCast/rpgQuests from the tracker view (on-game values)", async () => {
  const db = await freshDb();
  const { chatId, gameId, h } = await seedLiteGame(db);
  await seedScene(db, { chatId, gameId, seq: 2 });
  const out = await h.chatOps.gatherTurnContext(chatId, undefined, false);
  expect(out?.macros["rpgSceneState"]).toContain("Village of Dunmoor");
  expect(out?.macros["rpgSceneState"]).toContain("Mari");
  expect(out?.macros["rpgSceneState"]).toContain("enemy");
  expect(out?.macros["rpgCast"]).toContain("Mari");
  expect(out?.macros["rpgQuests"]).toContain("The Missing Key");
  expect(out?.macros["rpgQuests"]).toContain("find the locksmith");
});

test("the gather stages the `rpg` CEL tree so {{expr::rpg.…}} reads scene/cast/quests state", async () => {
  const db = await freshDb();
  const { chatId, gameId, h } = await seedLiteGame(db);
  await seedScene(db, { chatId, gameId, seq: 2 });
  const out = await h.chatOps.gatherTurnContext(chatId, undefined, false);
  // The `rpg` binding is a data-only CelValue tree — its documented read-set (scene.location, cast[].relationship,
  // quests[].status) carries the tracker view, so an `{{expr}}` predicate on the turn evaluates against real state.
  const rpg = (out?.celBindings as { rpg: { scene: { location: string }; cast: { relationship: string }[]; quests: { status: string }[] } }).rpg;
  expect(rpg.scene.location).toBe("Village of Dunmoor");
  expect(rpg.cast[0]?.relationship).toBe("enemy");
  expect(rpg.quests[0]?.status).toBe("active");
});

// ── R1: the FOLDED gather's terminal-tool mount ───────────────────────────────────────────────────
// `terminalTools` is the ONLY thing the fold adds to the turn. `tools` stays `[]` on every path (the registry
// is not the vehicle), and the reminder's CONTENT is untouched except on a reconcile beat — the fold adds a
// WRITE surface, it never changes what the character reads.

test("R1 folded: the gather mounts the terminal tools — registry `tools` stays empty", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db);
  await h.service.updateConfig({ principal: principal("host"), chatId, extractionMode: "folded" });
  const out = await h.chatOps.gatherTurnContext(chatId, undefined, false);

  expect(out?.tools).toEqual([]); // never the registry — a registry tool would execute + recurse
  expect(out?.terminalTools?.map((t) => t.name)).toEqual(["update_scene"]); // the harness fake's set
  // The tools are built against THIS turn's resolution-ladder head (the same base the flush will apply to).
  expect(h.fakes.foldedToolBuilds).toEqual([{ chatId, reconcile: false }]);
  // The reminder is unchanged — no tool-update guidance leaks into what the character narrates from.
  expect(out?.injections[0]?.content).not.toContain("update_party");
  expect(out?.injections[0]?.content).not.toContain("RECONCILE");
});

test("R1: reliable + cheap contribute NO terminal tools (byte-identical to before the fold)", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db);
  // A FRESH game is BORN folded (owner ruling 2026-08-01), so the fold is what a new room gets with no config.
  expect((await h.chatOps.gatherTurnContext(chatId, undefined, false))?.terminalTools).toBeDefined();
  // …and each two-call opt-out mounts NOTHING — the mode, not the capability, decides the vehicle.
  await h.service.updateConfig({ principal: principal("host"), chatId, extractionMode: "reliable" });
  expect((await h.chatOps.gatherTurnContext(chatId, undefined, false))?.terminalTools).toBeUndefined();
  await h.service.updateConfig({ principal: principal("host"), chatId, extractionMode: "cheap" });
  expect((await h.chatOps.gatherTurnContext(chatId, undefined, false))?.terminalTools).toBeUndefined();
  expect(h.fakes.foldedToolBuilds).toHaveLength(1); // consulted for the born-folded gather ONLY
});

test("R1 folded + readonly: NO terminal tools — a manual-steering game never mounts a write surface", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db, { trackersReadOnly: true });
  await h.service.updateConfig({ principal: principal("host"), chatId, extractionMode: "folded" });
  const out = await h.chatOps.gatherTurnContext(chatId, undefined, false);
  expect(out?.terminalTools).toBeUndefined();
  expect(h.fakes.foldedToolBuilds).toHaveLength(0);
});

test("R1 folded: a RECONCILE beat appends the write-surface note to the reminder", async () => {
  const db = await freshDb();
  const { chatId, gameId, h } = await seedLiteGame(db);
  await h.service.updateConfig({ principal: principal("host"), chatId, extractionMode: "folded", patch: { reconcileEveryBeats: 2 } });
  // One prior beat ⇒ this beat's ordinal is 2 ⇒ 2 % 2 === 0 ⇒ RECONCILE.
  await seedBeat(db, { chatId, gameId, seq: 2, hp: 12 });
  const out = await h.chatOps.gatherTurnContext(chatId, undefined, false);

  expect(h.fakes.foldedToolBuilds).toEqual([{ chatId, reconcile: true }]);
  // The note rides the SAME depth-0 injection (one injection, not a second one) — the harness fake returns
  // the literal "RECONCILE" as its note.
  expect(out?.injections).toHaveLength(1);
  expect(out?.injections[0]?.content).toContain("RECONCILE");
});

test("R1 folded: a mount that THROWS never fails the turn — the gather degrades to tool-less + surfaces it", async () => {
  const db = await freshDb();
  // The mount is the fold's only PRE-commit step and it reads the db. A throw here used to propagate out of
  // `buildTurnContext` and kill the character turn BEFORE any narrative existed — a state-tracking convenience
  // taking down the reply, the exact inversion the delivery model forbids.
  const { chatId, h } = await seedLiteGame(db, { foldedToolsThrow: true });
  await h.service.updateConfig({ principal: principal("host"), chatId, extractionMode: "folded" });

  const out = await h.chatOps.gatherTurnContext(chatId, undefined, false);

  // The gather still produced a complete, byte-identically tool-less contribution — the turn assembles + commits.
  expect(out).not.toBeNull();
  expect(out?.terminalTools).toBeUndefined();
  expect(out?.tools).toEqual([]);
  expect(out?.injections).toHaveLength(1);
  // …and the swallow is NOT silent: this recorder is the only evidence the fold stopped folding (and that the
  // game quietly started paying the second call again).
  expect(h.fakes.foldBuildFailures).toEqual([{ chatId, gameId: expect.any(String) }]);
});
