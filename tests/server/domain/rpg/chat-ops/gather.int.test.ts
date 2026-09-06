// tests/server/domain/rpg/chat-ops/gather — the game turn's GATHER (rpg-design/05 §4.6-4.7 + the owner ruling
// 2026-07-27). Drives the real `gatherTurnContext` through the harness's `chatOps`: a non-game chat is
// byte-identical null; a game contributes the depth-0 reminder injection. The gather NEVER returns REGISTRY
// tools (`tools: []` in every mode — a registry tool would be executed and recursed on) and the reminder never
// carries update-guidance. On `folded` (R1) it DOES contribute `terminalTools`: the same 7 state tools, mounted
// on the character turn as a write surface whose calls are read back rather than executed.

import type { RpgActorEntry, RpgTrackerDef, RpgTrackerValue } from "@orb/contracts/rpg";
import { buildTrackerWriteGroups, gameTrackerWriteKeys, rpgTrackerDefSchema } from "@orb/contracts/rpg";
import type { Db } from "@orb/db";
import { messages, rpgSnapshots } from "@orb/db";
import type { ChatId, Handle, MessageId, MessageVariantId, RpgGameId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { freshDb } from "../../../../support/db.ts";
import type { RpgHarness } from "../_support.ts";
import {
  addVariant,
  emptyState,
  expect,
  principal,
  questId,
  rosterCharacter,
  rosterUser,
  seedChat,
  seedLiteGame,
  seedMessage,
  target,
  test,
} from "../_support.ts";

/** The HP tracker def the seeded beats read against (R3 — health is an ordinary meter now, so the delta
 *  block only renders it when the GAME defines it, which is the whole point of the demotion). */
const HP = trackerDef({ key: "hp", label: "HP", shape: "meter", write: "delta", subject: "actor", appliesTo: "everyone", max: 20, sort: 0 });

/** One npc's row carrying an HP reading (the delta block's numeric plane). */
function kael(hp: number): RpgActorEntry {
  return {
    actorRef: { kind: "npc", npcKey: "kael" },
    identity: { name: "Kael", emoji: "", mood: "", relationship: { kind: "neutral", label: "" } },
    volatile: { trackerValues: { hp: { value: hp, items: null, max: null } }, conditions: [], inventory: [], wallet: [], status: "" },
  };
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
    presentCharacters: ["npc:kael"],
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
    presentCharacters: ["npc:kael"],
    fieldLocks: null,
    committed: 1,
  });
}

/** The gather's reminder text (the depth-0 system injection content) — the delta block lands inside it. */
async function reminderText(h: RpgHarness, chatId: ChatId): Promise<string> {
  const out = await h.chatOps.gatherTurnContext({ chatId, pendingUserText: undefined, respondsToLatestUserTurn: false });
  return out?.injections[0]?.content ?? "";
}

test("a NON-game chat gathers null (byte-identical no-op)", async () => {
  const db = await freshDb();
  const chatId = await seedChat(db, "plain");
  const { chatOps } = (await seedLiteGame(db)).h; // build a harness, but gather a DIFFERENT (non-game) chat
  const out = await chatOps.gatherTurnContext({ chatId, pendingUserText: undefined, respondsToLatestUserTurn: false });
  expect(out).toBeNull();
});

test("#40 a DISENGAGED game gathers null (byte-identical no-op — reminder/steering/macros all off, rows preserved)", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db);
  await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, patch: { engaged: false } });
  expect(await h.chatOps.gatherTurnContext({ chatId, pendingUserText: undefined, respondsToLatestUserTurn: false })).toBeNull();
  // Reversible: re-engage and the gather contributes again (the game rows were never touched).
  await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, patch: { engaged: true } });
  expect(await h.chatOps.gatherTurnContext({ chatId, pendingUserText: undefined, respondsToLatestUserTurn: false })).not.toBeNull();
});

test("a game contributes ONE depth-0 system reminder injection + the rpg macro/CEL feed (parity-plus §12)", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db);
  const out = await h.chatOps.gatherTurnContext({ chatId, pendingUserText: undefined, respondsToLatestUserTurn: false });
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

// PROSE-1 RE-HOME (owner ruling 2026-08-08, "we are putting everything in presets"): the reminder's teach and
// heading OVERRIDES arrive as a gather ARG — chat resolves the turn preset's `promptConfig.prose` and threads it,
// exactly as it threads `steerIdentity`. The game row carries no prose plane at all any more, so this arg is the
// ONLY path an override has to the wire; absent ⇒ the shipped defaults, byte-identical.
test("a PRESET prose override threaded through the gather replaces the shipped teach in the reminder", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db);

  const base = await h.chatOps.gatherTurnContext({ chatId, pendingUserText: undefined, respondsToLatestUserTurn: false });
  // The control: with no override the shipped card teach rides (`immersiveHtml` is default-on).
  expect(base?.injections[0]?.content ?? "").toContain(":::card");

  const out = await h.chatOps.gatherTurnContext({
    chatId,
    pendingUserText: undefined,
    respondsToLatestUserTurn: false,
    prose: {
      "rpg.card.askInteractive": { text: "OUR TABLE'S OWN CARD ASK — :::card only for in-world signage.", baseVersion: 1 },
      "rpg.reminder.steeringLicense": { text: "OUR TABLE'S OWN LICENSE.", baseVersion: 1 },
    },
  });
  const reminder = out?.injections[0]?.content ?? "";

  expect(reminder).toContain("OUR TABLE'S OWN CARD ASK");
  expect(reminder).toContain("OUR TABLE'S OWN LICENSE.");
  // …and the bytes it REPLACED are gone, which is what "override" has to mean (an appended teach would still
  // contain `:::card` and pass a contains-only assertion).
  expect(reminder).not.toContain("you may render an immersive card");
});

// The steeringNote substitution fix (end-to-end through the gather): a host-authored steeringNote with
// {{user}}/{{char}} renders to the ACTIVE persona name / the Ruling-B `{{char}}` — BOTH resolved CHAT-SIDE and
// threaded in via the `steerIdentity` arg (chat owns identity resolution; rpg splices, never re-derives).
// NEVER literal braces reaching the wire injection.
test("the reminder RENDERS the steeringNote's {{user}}/{{char}} from chat's threaded identity (not literal)", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db);
  await h.service.updateConfig({
    principal: principal(castId<Handle>("host")),
    chatId,
    patch: { steeringNote: "{{user}} keeps running into {{char}} at the konbini." },
  });

  // chat's threaded binding: {{user}} = the active persona, {{char}} = the SOLO single cast name (Ruling B).
  const out = await h.chatOps.gatherTurnContext({
    chatId,
    pendingUserText: undefined,
    respondsToLatestUserTurn: false,
    steerIdentity: { user: "Nate", char: "Niko" },
  });
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
  await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, patch: { steeringNote: "Keep {{char}} distinct in voice." } });

  // Chat threads the Ruling-B joined candidate names (`joinedCandidateName(room.speakerCandidates)` — roster order): "Niko, Aria".
  const out = await h.chatOps.gatherTurnContext({
    chatId,
    pendingUserText: undefined,
    respondsToLatestUserTurn: false,
    steerIdentity: { user: "Nate", char: "Niko, Aria" },
  });
  const reminder = out?.injections[0]?.content ?? "";

  expect(reminder).toContain("Keep Niko, Aria distinct in voice.");
  expect(reminder).not.toContain("{{char}}");
});

// GUIDED-SAFE end-to-end: a steeringNote's non-identity macros ({{random}}/{{setvar}}) do NOT resolve through
// the gather — only identity substitution (the steer-neutralization ruling).
test("the gather does NOT grant the steeringNote full macro power — {{random}}/{{setvar}} stay literal", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db);
  await h.service.updateConfig({
    principal: principal(castId<Handle>("host")),
    chatId,
    patch: { steeringNote: "As {{user}}: {{random::a::b}}{{setvar::x::1}}" },
  });

  const out = await h.chatOps.gatherTurnContext({
    chatId,
    pendingUserText: undefined,
    respondsToLatestUserTurn: false,
    steerIdentity: { user: "Nate", char: "Niko" },
  });
  const reminder = out?.injections[0]?.content ?? "";

  expect(reminder).toContain("As Nate:"); // {{user}} resolved
  expect(reminder).toContain("{{random::a::b}}"); // volatile — NOT rolled
  expect(reminder).toContain("{{setvar::x::1}}"); // variable — NOT executed
});

// The WHOLE path (snapshot → tracker view → injection) for an NPC's affliction. `update_party` writes conditions
// onto an npc's `npc:<key>` row exactly as it does a roster member's, but the reminder rendered
// `conditions:` for ROSTER actors only — so a poisoned NPC was model-INVISIBLE and the model could neither play
// the affliction nor retire it (the reminder is the model's knowledge, D113 #4).
test("a scene-npc's CONDITIONS reach the reminder injection (snapshot → view → wire)", async () => {
  const db = await freshDb();
  const { chatId, gameId, h } = await seedLiteGame(db);
  const { variantId } = await seedMessage(db, chatId, 1, { role: "assistant" });
  await db.insert(rpgSnapshots).values({
    ...target({ gameId, chatId, seq: 1, variantId, key: "castcond" }),
    ...emptyState(),
    presentCharacters: ["npc:mari"],
    actorState: [
      {
        actorRef: { kind: "npc", npcKey: "mari" },
        identity: { name: "Mari", emoji: "", mood: "wary", relationship: { kind: "neutral", label: "" } },
        volatile: {
          trackerValues: {},
          conditions: [{ name: "poisoned", stat: null, modifier: 0, turnsLeft: null }],
          inventory: [],
          wallet: [],
          status: "",
        },
      },
    ],
    fieldLocks: null,
    committed: 1,
  });
  expect(await reminderText(h, chatId)).toContain("- Mari — wary — conditions: poisoned");
});

test("a BORN game's char turn carries no registry tools + no write guidance (the state round writes, not the reminder)", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db); // born folded — its write surface is the terminal channel, never `tools`
  const out = await h.chatOps.gatherTurnContext({ chatId, pendingUserText: undefined, respondsToLatestUserTurn: false });
  expect(out?.tools).toEqual([]);
  expect(out?.injections[0]?.content).not.toContain("update_party");
});

test("cheap mode: the char turn is ALSO tool-less (owner ruling — the dedicated tool round runs post-commit)", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db);
  await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, extractionMode: "cheap" });
  const out = await h.chatOps.gatherTurnContext({ chatId, pendingUserText: undefined, respondsToLatestUserTurn: false });
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
  await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, extractionMode: "cheap" });
  const out = await h.chatOps.gatherTurnContext({ chatId, pendingUserText: undefined, respondsToLatestUserTurn: false });
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
  // R3 — health only exists where the GAME defines it, so the delta lineage seeds the def first.
  await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, patch: { trackers: [HP] } });
  await seedBeat(db, { chatId, gameId, seq: 2, hp: 12 }); // prior beat
  await seedBeat(db, { chatId, gameId, seq: 4, hp: 16 }); // current head
  const text = await reminderText(h, chatId);
  // cur (seq 4, HP 16) vs prev (seq 2, HP 12) → a +4 delta line, before the license.
  expect(text).toContain("CHANGES SINCE LAST BEAT");
  expect(text).toContain("Kael HP 12→16 (+4)");
});

test("swipe-consistency: selecting a sibling variant re-resolves the delta on the NEW lineage", async () => {
  const db = await freshDb();
  const { chatId, gameId, h } = await seedLiteGame(db);
  await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, patch: { trackers: [HP] } });
  await seedBeat(db, { chatId, gameId, seq: 2, hp: 12 }); // shared prior beat
  // The current head slot (seq 4) has TWO swipe variants: A (HP 16) selected by seedBeat, B (HP 8).
  const head = await seedBeat(db, { chatId, gameId, seq: 4, hp: 16 });
  const variantB = await addVariant(db, head.messageId, 1, "swipe B");
  await seedVariantSnapshot(db, { chatId, gameId, seq: 4, variantId: variantB, key: "beat4B", hp: 8 });

  // A selected ⇒ delta is 12→16 (+4).
  expect(await reminderText(h, chatId)).toContain("Kael HP 12→16 (+4)");

  // Swipe to B ⇒ the delta re-resolves prev(12)→cur(8) = a -4 line (the OTHER outcome), byte-different.
  await db.update(messages).set({ selectedVariantId: variantB }).where(eq(messages.id, head.messageId));
  const swiped = await reminderText(h, chatId);
  expect(swiped).toContain("Kael HP 12→8 (-4)");
  expect(swiped).not.toContain("12→16");
});

test("hand-edit-as-source: a host patchActor surfaces as a delta on the next gather", async () => {
  const db = await freshDb();
  const { chatId, gameId, h } = await seedLiteGame(db);
  await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, patch: { trackers: [HP] } });
  // A committed prior beat (HP 12) is the lineage head; there is no newer beat yet.
  await seedBeat(db, { chatId, gameId, seq: 2, hp: 12 });
  // The host hand-edits HP to 18 through the OP door (R1 — the per-actor plane left `editSnapshot`). It
  // clone-forwards onto a fresh committed narrator slot (the head was committed), which becomes the new
  // current head; the prior beat (HP 12) is now the prev on the lineage.
  await h.service.patchActor({
    principal: principal(castId<Handle>("host")),
    chatId,
    targetRef: { kind: "npc", npcKey: "kael" },
    ops: [{ op: "setTracker", key: "hp", value: { value: 18 } }],
  });
  const text = await reminderText(h, chatId);
  // The GM tweak lands next turn: prev(12)→cur(18) = a +6 delta line (the diff is agnostic to the WRITE source).
  expect(text).toContain("Kael HP 12→18 (+6)");
});

// ── the P6 macro × rpg FEED (parity-plus §12) — the gather populates rpgSceneState/rpgCast/rpgQuests + the `rpg`
// CEL tree from the SAME tracker view the reminder reads (one projection, three consumers). A READ mirror.

/** Seed a COMMITTED snapshot carrying a scene (location + present characters with a relationship + an active quest) —
 *  the populated-feed input. The tracker view resolves this current head; roster (party sheets) stays empty. */
async function seedScene(db: Db, opts: { chatId: ChatId; gameId: RpgGameId; seq: number }): Promise<void> {
  const { variantId } = await seedMessage(db, opts.chatId, opts.seq, { role: "assistant" });
  await db.insert(rpgSnapshots).values({
    ...target({ gameId: opts.gameId, chatId: opts.chatId, seq: opts.seq, variantId, key: `scene${opts.seq}` }),
    ...emptyState(),
    location: "Village of Dunmoor",
    presentCharacters: ["npc:mari"],
    actorState: [
      {
        actorRef: { kind: "npc", npcKey: "mari" },
        identity: { name: "Mari", emoji: "", mood: "wary", relationship: { kind: "enemy", label: "" } },
        volatile: { trackerValues: {}, conditions: [], inventory: [], wallet: [], status: "" },
      },
    ],
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
  const out = await h.chatOps.gatherTurnContext({ chatId, pendingUserText: undefined, respondsToLatestUserTurn: false });
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
  const out = await h.chatOps.gatherTurnContext({ chatId, pendingUserText: undefined, respondsToLatestUserTurn: false });
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
  await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, extractionMode: "folded" });
  const out = await h.chatOps.gatherTurnContext({ chatId, pendingUserText: undefined, respondsToLatestUserTurn: false });

  expect(out?.tools).toEqual([]); // never the registry — a registry tool would execute + recurse
  expect(out?.terminalTools?.map((t) => t.name)).toEqual(["update_scene"]); // the harness fake's set
  // The tools are built against THIS turn's resolution-ladder head (the same base the flush will apply to).
  expect(h.fakes.foldedToolBuilds).toEqual([{ chatId, reconcile: false }]);
  // The reminder is unchanged — no tool-update guidance leaks into what the character narrates from.
  expect(out?.injections[0]?.content).not.toContain("update_party");
  expect(out?.injections[0]?.content).not.toContain("RECONCILE");
});

test("R1: the CHEAP opt-out contributes NO terminal tools (byte-identical to before the fold)", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db);
  // A FRESH game is BORN folded (owner ruling 2026-08-01), so the fold is what a new room gets with no config.
  expect((await h.chatOps.gatherTurnContext({ chatId, pendingUserText: undefined, respondsToLatestUserTurn: false }))?.terminalTools).toBeDefined();
  // …and the two-call opt-out mounts NOTHING — the mode, not the capability, decides the vehicle.
  await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, extractionMode: "cheap" });
  expect((await h.chatOps.gatherTurnContext({ chatId, pendingUserText: undefined, respondsToLatestUserTurn: false }))?.terminalTools).toBeUndefined();
  expect(h.fakes.foldedToolBuilds).toHaveLength(1); // consulted for the born-folded gather ONLY
});

test("R1 folded + readonly: NO terminal tools — a manual-steering game never mounts a write surface", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db, { trackersReadOnly: true });
  await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, extractionMode: "folded" });
  const out = await h.chatOps.gatherTurnContext({ chatId, pendingUserText: undefined, respondsToLatestUserTurn: false });
  expect(out?.terminalTools).toBeUndefined();
  expect(h.fakes.foldedToolBuilds).toHaveLength(0);
});

// ── D112 as amended: the FOLD GUARD on a prose-silencing wire (the local vLLM engine) ─────────────

test("R1 folded + foldGuarded: the mount is WITHHELD — the local engine's turn stays tool-less", async () => {
  const db = await freshDb();
  // The wire CAN carry tools (so this is not the readonly arm) but goes mute when they ride — measured
  // `content:null` on 36/36 turns. The fold's premise is false here, so the character turn must not mount.
  const { chatId, h } = await seedLiteGame(db, { foldGuarded: true });
  await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, extractionMode: "folded" });
  const out = await h.chatOps.gatherTurnContext({ chatId, pendingUserText: undefined, respondsToLatestUserTurn: false });

  expect(out?.terminalTools).toBeUndefined();
  // Withheld PRE-COMMIT: the mount's db reads never even ran (the guard is a decision, not a discarded build).
  expect(h.fakes.foldedToolBuilds).toHaveLength(0);
  // Everything else about the turn is unchanged — the game still steers off its one state reminder.
  expect(out?.tools).toEqual([]);
  expect(out?.injections).toHaveLength(1);
});

test("the fold guard governs ONLY folded — an explicit cheap game on the same wire is untouched", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedLiteGame(db, { foldGuarded: true });
  // The opt-out mounted no terminal tools before the guard existed and does not now; its post-commit round is
  // the host's deliberate lever and the guard never re-routes it.
  await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, extractionMode: "cheap" });
  expect((await h.chatOps.gatherTurnContext({ chatId, pendingUserText: undefined, respondsToLatestUserTurn: false }))?.terminalTools).toBeUndefined();
  expect(h.fakes.foldedToolBuilds).toHaveLength(0);
});

test("R1 folded: a RECONCILE beat appends the write-surface note to the reminder", async () => {
  const db = await freshDb();
  const { chatId, gameId, h } = await seedLiteGame(db);
  await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, extractionMode: "folded", patch: { reconcileEveryBeats: 2 } });
  // One prior beat ⇒ this beat's ordinal is 2 ⇒ 2 % 2 === 0 ⇒ RECONCILE.
  await seedBeat(db, { chatId, gameId, seq: 2, hp: 12 });
  const out = await h.chatOps.gatherTurnContext({ chatId, pendingUserText: undefined, respondsToLatestUserTurn: false });

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
  await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, extractionMode: "folded" });

  const out = await h.chatOps.gatherTurnContext({ chatId, pendingUserText: undefined, respondsToLatestUserTurn: false });

  // The gather still produced a complete, byte-identically tool-less contribution — the turn assembles + commits.
  expect(out).not.toBeNull();
  expect(out?.terminalTools).toBeUndefined();
  expect(out?.tools).toEqual([]);
  expect(out?.injections).toHaveLength(1);
  // …and the swallow is NOT silent: this recorder is the only evidence the fold stopped folding (and that the
  // game quietly started paying the second call again).
  expect(h.fakes.foldBuildFailures).toEqual([{ chatId, gameId: expect.any(String) }]);
});

// ── the TRACKER READ SURFACE (the live-turn drop) ────────────────────────────────────────────────
// A host-defined tracker is state the model MUST see. The live konbini game defined a pinned `party`
// Corruption meter that the panel showed on BOTH Status cards and the entire reminder mentioned NOWHERE:
// the per-carrier builder glossed off the READING (an unmoved tracker rendered nothing at all, hint
// included) and the party line only reached trackers through a volatile ROW (the user actor had none, so it
// lost every tracker it carried). These drive config → carrier resolution → reminder end-to-end, which is
// the only path that proves the def, the carrier predicate and the string builder agree.

/** A tracker def with the axes a case cares about; everything else takes its schema default. */
function trackerDef(over: Partial<RpgTrackerDef> & Pick<RpgTrackerDef, "key" | "label" | "shape" | "write" | "subject">): RpgTrackerDef {
  return rpgTrackerDefSchema.parse(over);
}

/** ONE stored tracker reading, TOTAL (no per-carrier ceiling override). */
function reading(value: number | string): RpgTrackerValue {
  return { value, items: null, max: null };
}

/** An actor row carrying ONLY tracker readings (the plane under test). A `npc` ref gets its identity half
 *  (R2 — an npc is a person, and the display name is what every reader prints). */
function withTrackers(
  actorRef: RpgActorEntry["actorRef"],
  trackerValues: Record<string, RpgTrackerValue>,
  identity: { name: string; mood?: string } | null = null,
): RpgActorEntry {
  const volatile = { trackerValues, conditions: [], inventory: [], wallet: [], status: "" };
  if (actorRef.kind !== "npc") {
    return { actorRef, volatile };
  }
  const named = identity ?? { name: actorRef.npcKey };
  return { actorRef, identity: { name: named.name, emoji: "", mood: named.mood ?? "", relationship: { kind: "neutral", label: "" } }, volatile };
}

const NIKO = "01kyw994c1ecrtvwbmx4avkqzz"; // a real 26-char TypeID suffix (the actorState schema validates it)
const CORRUPTION = trackerDef({
  key: "corruption",
  label: "Corruption",
  shape: "meter",
  write: "delta",
  subject: "actor",
  appliesTo: "everyone",
  max: 100,
  hint: "how corrupted someone is",
  sort: 0,
});
const ALARM = trackerDef({ key: "alarm", label: "Alarm", shape: "meter", write: "set", subject: "game", max: 5, hint: "how alerted the guards are", sort: 1 });

/** Seed the live-shaped game: an `everyone` actor tracker + a game tracker, a roster of a USER and a
 *  CHARACTER actor, and a committed beat carrying readings on the user, the character AND a scene-npc
 *  member (the three carrier homes) plus the game-subject value. */
async function seedTrackerGame(db: Db): Promise<{ chatId: ChatId; h: RpgHarness }> {
  const { chatId, gameId, h } = await seedLiteGame(db, { roster: [rosterUser(castId<Handle>("host"), "You"), rosterCharacter(NIKO, "Niko")] });
  await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, patch: { trackers: [CORRUPTION, ALARM] } });
  const { variantId } = await seedMessage(db, chatId, 2, { role: "assistant" });
  await db.insert(rpgSnapshots).values({
    ...target({ gameId, chatId, seq: 2, variantId, key: "trk" }),
    ...emptyState(),
    location: "Konbini",
    presentCharacters: ["npc:mari"],
    actorState: [
      // ZERO is state, not absence — a 0/100 meter must reach the model exactly like a 12/100 one.
      withTrackers({ kind: "user", userId: castId("user_host") }, { corruption: reading(0) }),
      withTrackers({ kind: "character", characterId: castId(`character_${NIKO}`) }, { corruption: reading(12) }),
      withTrackers({ kind: "npc", npcKey: "mari" }, { corruption: reading(5) }, { name: "Mari", mood: "wary" }),
    ],
    trackerValues: { alarm: reading(3) },
    fieldLocks: null,
    committed: 1,
  });
  return { chatId, h };
}

test("every FILLED tracker reaches the reminder — user + character + cast carriers, the game subject, and a ZERO reading", async () => {
  const db = await freshDb();
  const { chatId, h } = await seedTrackerGame(db);
  const text = await reminderText(h, chatId);

  // The VOCABULARY, taught once per tracker (the attribute-gloss pattern) — this is the only place the
  // host's steering hint ships, so an unmoved tracker is still a taught tracker.
  expect(text).toContain("Trackers: Corruption (how corrupted someone is) · Alarm (how alerted the guards are)");
  expect(text.match(/how corrupted someone is/g)).toHaveLength(1);
  // Every carrier's reading, under the same labels: the user actor (0 — present, not swallowed), the
  // character actor, and the scene-npc the `everyone` class reaches.
  expect(text).toContain("- You — Corruption 0/100");
  expect(text).toContain("- Niko — Corruption 12/100");
  expect(text).toContain("- Mari — wary — Corruption 5/100");
  // The game-subject block, under its own heading (the vocabulary line owns the bare word "Trackers").
  expect(text).toContain("Game trackers:\n- Alarm 3/5");
});

// "The reminder is the model's knowledge; the tools are its permissions" (D113 #4). A LOCKED tracker is
// host-owned STATE, not a secret: the read surface shows it in full (reading + hint) so the model narrates
// around it, and only the WRITE surface omits it. The lock filter therefore belongs at the schema/tool
// assembly (`buildTrackerWriteGroups`/`gameTrackerWriteKeys`) and NOWHERE in the view/reminder read path —
// a lock leaking into the projection would silently blind the model to state the panel still shows.
test("a LOCKED tracker still reads in the reminder (value + hint) while the write surface drops its key", async () => {
  const db = await freshDb();
  const sealed = trackerDef({ ...CORRUPTION, key: "sealed", label: "Sealed", hint: "the host owns this one", locked: true });
  const { chatId, gameId, h } = await seedLiteGame(db, { roster: [rosterCharacter(NIKO, "Niko")] });
  await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, patch: { trackers: [sealed, { ...ALARM, locked: true }] } });
  const { variantId } = await seedMessage(db, chatId, 2, { role: "assistant" });
  await db.insert(rpgSnapshots).values({
    ...target({ gameId, chatId, seq: 2, variantId, key: "lockd" }),
    ...emptyState(),
    actorState: [withTrackers({ kind: "character", characterId: castId(`character_${NIKO}`) }, { sealed: reading(40) })],
    trackerValues: { alarm: reading(2) },
    fieldLocks: null,
    committed: 1,
  });

  const text = await reminderText(h, chatId);
  expect(text).toContain("Sealed (the host owns this one)"); // taught — a locked tracker is knowledge
  expect(text).toContain("- Niko — Sealed 40/100"); // read in full, per carrier
  expect(text).toContain("Game trackers:\n- Alarm 2/5");
  // …and the SAME defs are unrepresentable on the write surface (the one place the lock is allowed to bite).
  const carrier = { actorKey: `character_${NIKO}`, name: "Niko", kind: "party", grants: [], revokes: [] } as const;
  expect(buildTrackerWriteGroups([sealed], [carrier])).toEqual([{ targetRefs: ["Niko"], deltaKeys: [], setKeys: [] }]);
  expect(gameTrackerWriteKeys([{ ...ALARM, locked: true }])).toEqual({ deltaKeys: [], setKeys: [] });
});

test("a CARRIED but unmoved tracker still reaches the reminder (the live drop: taught nowhere, on nobody)", async () => {
  const db = await freshDb();
  // The exact live shape: the tracker is defined + pinned, and NO snapshot has ever written a reading — the
  // panel drew `Corruption 0/100` on every Status card while the reminder said nothing at all.
  const { chatId, h } = await seedLiteGame(db, { roster: [rosterUser(castId<Handle>("host"), "You"), rosterCharacter(NIKO, "Niko")] });
  await h.service.updateConfig({ principal: principal(castId<Handle>("host")), chatId, patch: { trackers: [CORRUPTION] } });
  const text = await reminderText(h, chatId);

  expect(text).toContain("Trackers: Corruption (how corrupted someone is)");
  // Both carriers list it by bare label — carriage is the datum when there is no reading yet.
  expect(text).toContain("- You — Corruption");
  expect(text).toContain("- Niko — Corruption");
});
