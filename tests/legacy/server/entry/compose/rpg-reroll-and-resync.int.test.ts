// COMPOSED-REAL: the server graph loads in the untimed IMPORT phase, never inside the first test's timeout (#2386 — support/node/composed-real.ts).
// @subject packages/server/src/domain/rpg/tools/rounds/resync.ts
import { FROZEN_AT_MS } from "@orb/testkit/iso/clock.ts";
import "@orb/testkit/node/composed-real.ts";
// entry/compose/rpg — a reroll supersedes the rejected variant's extraction, a swipe surfaces the selected variant's consequences, and the host resync reconciles rather than appends.

import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { Db } from "@orb/db";
import { messages, presets } from "@orb/db";
import type { ChatId, ChatTurnId, MessageId, MessageVariantId, PresetId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { makeGenerationCapability } from "@orb/testkit/node/factories/resolved-connection.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { eq } from "drizzle-orm";
import { addVariant, seedMessage } from "../../domain/chat/_support.ts";
import type { buildRpg, RpgTurnContext } from "./_rpg-support.ts";
import {
  buildCannedRpg,
  buildCannedRpgWithText,
  commitSnapshotForVariant,
  defaultSnapshotState,
  emptySpy,
  foldedTurn,
  hostPrincipal,
  panelState,
  seedHostGameChat,
  TURN,
  tc,
  writeStagedSnapshot,
} from "./_rpg-support.ts";

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// VER-1a — A REROLL SUPERSEDES, IT DOES NOT ACCUMULATE (+ the resync reconciler's idempotence).
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// The live-confirmed defect: the state round resolved its base as the resolution HEAD, so a NEW variant on an
// already-flushed slot took its own REJECTED sibling's applied extraction as base and re-applied on top —
// every reroll paraphrased the same story beat into `recentEvents` again (the owner's dogfood chat carried
// three near-identical "Niko was touched you remembered her name" beats off ONE story moment). PRE-EXISTING on
// all three vehicles, so the pin drives all three: reroll ⇒ ONE beat set, never N.

/** The turn's writes as TOOL CALLS (the cheap/folded vehicles' shape) — a scene beat + a journal entry, i.e.
 *  exactly the two APPEND-shaped planes a duplicated base re-applies. */
const REROLL_CALLS = [
  { name: "update_scene", args: { location: "the obsidian tower", recentEvent: "arrived at the tower" } },
  { name: "add_journal_entry", args: { type: "location", title: "Arrival", content: "They reached the tower." } },
];

/** The SAME writes as a structured payload (derived from the calls, so the two can never drift). */
function rerollExtractionText(): string {
  const argsFor = (name: string): unknown[] => REROLL_CALLS.filter((c) => c.name === name).map((c) => c.args);
  return JSON.stringify({ party: [], inventory: [], scene: argsFor("update_scene")[0], trackers: [], quests: [], journal: argsFor("add_journal_entry") });
}

/** Flip a slot's selected variant — the D26 pointer move (zero content copy) a swipe/reroll performs. */
async function selectVariant(db: Db, messageId: MessageId, variantId: MessageVariantId): Promise<void> {
  await db.update(messages).set({ selectedVariantId: variantId }).where(eq(messages.id, messageId));
}

/** Generate a turn onto a fresh slot, then REROLL it: a second variant on the SAME slot, selected, flushed
 *  again with the same writes. Returns the panel state the two flushes left. */
async function driveReroll(args: {
  readonly compose: ReturnType<typeof buildRpg>;
  readonly db: Db;
  readonly hostId: UserId;
  readonly chatId: ChatId;
  readonly turn: (calls: readonly { name: string; args: unknown }[]) => RpgTurnContext;
}): Promise<{ location: string | undefined; beats: readonly string[]; journal: readonly string[] }> {
  const { compose, db, hostId, chatId, turn } = args;
  const slot = await seedMessage(db, chatId, 1, { role: "assistant", content: "They arrive at the tower." });
  await compose.chatOps.onTurnCompleted(chatId, slot.messageId, slot.variantId, TURN, turn(REROLL_CALLS));
  // THE REROLL: a new variant on the same slot, selected (the rejected one stays as a dead sibling).
  const rerolled = await addVariant(db, slot.messageId, 1, "They arrive at the tower, rain-soaked.");
  await selectVariant(db, slot.messageId, rerolled);
  await compose.chatOps.onTurnCompleted(chatId, slot.messageId, rerolled, TURN, turn(REROLL_CALLS));
  return panelState(compose, hostId, chatId);
}

test("VER-1a: a REROLL supersedes the rejected variant's extraction — ONE beat set, on all three vehicles", async ({ app, db }) => {
  // (1) STRUCTURED — the schema round (the agent-sdk degrade).
  const rel = await seedHostGameChat(db, "ver1a-structured");
  const relCompose = buildCannedRpgWithText({ app, db, api: "agent-sdk", spy: emptySpy(), cannedText: rerollExtractionText() });
  await relCompose.service.createGame({ principal: hostPrincipal(rel.hostId), chatId: rel.chatId, mode: "lite" });
  await relCompose.service.updateConfig({ principal: hostPrincipal(rel.hostId), chatId: rel.chatId, extractionMode: "cheap" });
  const relState = await driveReroll({ compose: relCompose, db, hostId: rel.hostId, chatId: rel.chatId, turn: () => tc("agent-sdk") });

  // (2) CHEAP — the dedicated tool round, answered with the same writes as parallel calls.
  const cheap = await seedHostGameChat(db, "ver1a-cheap");
  const cheapCompose = buildCannedRpgWithText({
    app,
    db,
    api: "chat-completions",
    spy: emptySpy(),
    cannedText: "{}",
    cannedToolCalls: REROLL_CALLS.map((c) => ({ name: c.name, arguments: JSON.stringify(c.args) })),
  });
  await cheapCompose.service.createGame({ principal: hostPrincipal(cheap.hostId), chatId: cheap.chatId, mode: "lite" });
  await cheapCompose.service.updateConfig({ principal: hostPrincipal(cheap.hostId), chatId: cheap.chatId, extractionMode: "cheap" });
  const cheapState = await driveReroll({ compose: cheapCompose, db, hostId: cheap.hostId, chatId: cheap.chatId, turn: () => tc("chat-completions") });

  // (3) FOLDED — the character turn's own co-emitted calls, on the first pass AND the reroll.
  const fold = await seedHostGameChat(db, "ver1a-folded");
  const foldCompose = buildCannedRpg(app, db, "chat-completions", emptySpy());
  await foldCompose.service.createGame({ principal: hostPrincipal(fold.hostId), chatId: fold.chatId, mode: "lite" }); // born folded
  const foldState = await driveReroll({ compose: foldCompose, db, hostId: fold.hostId, chatId: fold.chatId, turn: (calls) => foldedTurn(calls) });

  // THE REGRESSION: the rerolled variant REPLACED the rejected one's contribution. Pre-fix the beat window read
  // ["arrived at the tower", "arrived at the tower"] on every vehicle (the base carried the dead sibling's write).
  for (const state of [relState, cheapState, foldState]) {
    expect(state.beats).toEqual(["arrived at the tower"]);
    expect(state.location).toBe("the obsidian tower");
    // The journal plane was ALREADY supersede-correct (its read projects the selected variant, so the dead
    // sibling's entry stops rendering the moment the pointer moves) — pinned here so both planes are proven to
    // agree on the same semantics, and so a future "just write journal rows unstamped" regresses loudly.
    expect(state.journal).toEqual(["Arrival"]);
  }
});

test("VER-1a: SWIPING between variants surfaces the SELECTED variant's own consequences (no double-apply)", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "ver1a-swipe");
  // Two DIFFERENT extractions on ONE slot — a compose per canned reply, both over the SAME db/game.
  const towerCompose = buildCannedRpgWithText({ app, db, api: "agent-sdk", spy: emptySpy(), cannedText: rerollExtractionText() });
  const fordCompose = buildCannedRpgWithText({
    app,
    db,
    api: "agent-sdk",
    spy: emptySpy(),
    cannedText: JSON.stringify({
      party: [],
      inventory: [],
      scene: { location: "the ford", recentEvent: "waded the ford" },
      trackers: [],
      quests: [],
      journal: [{ type: "location", label: "", title: "The crossing", content: "They waded the ford." }],
    }),
  });
  await towerCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await towerCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" });

  const slot = await seedMessage(db, chatId, 1, { role: "assistant", content: "They arrive at the tower." });
  await towerCompose.chatOps.onTurnCompleted(chatId, slot.messageId, slot.variantId, TURN, tc("agent-sdk"));
  const rerolled = await addVariant(db, slot.messageId, 1, "They wade the ford instead.");
  await selectVariant(db, slot.messageId, rerolled);
  await fordCompose.chatOps.onTurnCompleted(chatId, slot.messageId, rerolled, TURN, tc("agent-sdk"));

  // The REROLLED variant is selected: its own consequences, and ONLY its own (pre-fix the ford's snapshot was
  // built on the tower's, so the panel read "the ford" with BOTH beats).
  expect(await panelState(fordCompose, hostId, chatId)).toEqual({ location: "the ford", beats: ["waded the ford"], journal: ["The crossing"] });

  // Swipe BACK — a pure pointer move, zero writes: the first variant's state + beat + journal entry return
  // whole, and nothing was re-applied (each variant's snapshot is absolute over the same pre-slot base).
  await selectVariant(db, slot.messageId, slot.variantId);
  expect(await panelState(towerCompose, hostId, chatId)).toEqual({ location: "the obsidian tower", beats: ["arrived at the tower"], journal: ["Arrival"] });
});

// ── PROSE-1 S4: a host's EXTRACTION template edit reaches the write surface ───────────────────────────
// The census rows 11-26/29-36 became slot rows in `contracts/rpg/prose.ts`, homed on the GM PRESET's
// `promptConfig.prose` and authored in the preset Templates tab. This is the END-TO-END proof for the HOST
// DOOR arm of the threading: the verb has no turn to inherit a frozen prose view from, so it resolves its own
// through chat's `resolveChatPresetProse` — which runs the SAME ladder a turn runs (the GM-voice preset
// REDIRECT first, then the owner-scoped preset read), so a table's authored copy reaches its rebuild exactly
// as it reaches its turns. Asserted through the rendered SYSTEM PROMPT the wire actually carried: the only
// place where "the host edited it" and "the model was told it" are the same fact.
test("PROSE-1: a GM-preset extraction override rides the RESYNC's system prompt, replacing the shipped default", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "prose-extract-resync");
  const principal = hostPrincipal(hostId);
  const spy = emptySpy();
  // The AGENT-SDK wire carries no `tools[]`, so the resync takes its STRUCTURED degrade — the arm whose
  // request has a system prompt the harness records. Same composition either way (the shared-plane proof);
  // this is the vehicle that lets the assertion read the rendered bytes rather than a tool description.
  const compose = buildCannedRpgWithText({ app, db, api: "agent-sdk", spy, cannedText: rerollExtractionText() });
  // The host authors the edit where the ruling put it: the preset's own `promptConfig.prose`, keyed by slot id.
  const presetId = castId<PresetId>("preset_prose_extract");
  await db.insert(presets).values({
    id: presetId,
    ownerId: hostId,
    name: "table voice",
    kind: "user",
    config: {
      ...DEFAULT_PROMPT_CONFIG,
      prose: {
        "rpg.extract.plane.inventory": { text: "INVENTORY — only coin and what a hand can carry. Nothing else is tracked at this table.", baseVersion: 1 },
      },
    },
    createdAt: FROZEN_AT_MS,
    updatedAt: FROZEN_AT_MS,
  });
  await compose.service.createGame({ principal, chatId, mode: "lite" });
  await compose.service.updateConfig({ principal, chatId, extractionMode: "cheap", gmPresetId: presetId });
  const slot = await seedMessage(db, chatId, 1, { role: "assistant", content: "They arrive at the tower." });
  await compose.chatOps.onTurnCompleted(chatId, slot.messageId, slot.variantId, TURN, tc("agent-sdk"));
  spy.systemPrompts.length = 0; // the turn's own round is not what this asserts — the HOST DOOR is

  await compose.service.resyncFromStory({ principal, chatId });

  const prompt = spy.systemPrompts[0] ?? "";
  expect(prompt).toContain("INVENTORY — only coin and what a hand can carry.");
  // …and the shipped default is GONE, not merely joined by the override (a slot resolves two rungs deep,
  // never a cascade — the override IS the plane's teaching now).
  expect(prompt).not.toContain("recording an item the story established");
  // Every OTHER plane still ships its default in the same composition, so an edit is surgical rather than a
  // fork of the whole prompt.
  expect(prompt).toContain("PARTY — party: ONLY mechanical changes.");
});

// ── resyncFromStory: the RECONCILER lands the re-derived truth, it never appends onto it ──────────────
// The owner clicked "Resync from story" four times on an unchanged story and the panel GREW: four paraphrases
// of one beat in `recentEvents` + three near-identical journal rows (each resync minted its own anchor slot,
// so the lineage projection could not hide any of them). The reconciler now REBUILDS the beat window and
// writes NO journal, so N clicks == 1 click.

test("VER-1a: resyncFromStory is IDEMPOTENT — two consecutive resyncs leave byte-identical state", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "ver1a-resync");
  const principal = hostPrincipal(hostId);
  const spy = emptySpy();
  const compose = buildCannedRpgWithText({
    app,
    db,
    api: "chat-completions",
    spy,
    cannedText: rerollExtractionText(),
    cannedToolCalls: REROLL_CALLS.map((c) => ({ name: c.name, arguments: JSON.stringify(c.args) })),
  });
  await compose.service.createGame({ principal, chatId, mode: "lite" });
  await compose.service.updateConfig({ principal, chatId, extractionMode: "cheap" });
  // A real story beat first, so the resync reconciles against a populated panel (not a born-empty game).
  const slot = await seedMessage(db, chatId, 1, { role: "assistant", content: "They arrive at the tower." });
  await compose.chatOps.onTurnCompleted(chatId, slot.messageId, slot.variantId, TURN, tc("chat-completions"));

  await compose.service.resyncFromStory({ principal, chatId });
  // THE CATCH-UP ROUND IS A TOOL ROUND (owner ruling 2026-08-03): on a wire that carries `tools[]` the resync
  // asks for several SMALL per-plane calls instead of one 46-optional structured monolith — the shape both
  // hosted grammar walls are made of. The `structured` dispatcher is untouched on this wire.
  expect(spy.summarizeModels).toEqual([]);
  const first = await panelState(compose, hostId, chatId);
  await compose.service.resyncFromStory({ principal, chatId });
  const second = await panelState(compose, hostId, chatId);

  // IDEMPOTENT: the second pass landed the same truth, it did not append onto the first's.
  expect(second).toEqual(first);
  // …and the truth is the REBUILT window (one beat, not the turn's beat plus a paraphrase of it), with the
  // archive untouched by the rebuild (the turn's own entry, exactly once).
  expect(first).toEqual({ location: "the obsidian tower", beats: ["arrived at the tower"], journal: ["Arrival"] });
});

// RESYNC-OR — the END-TO-END loudness proof, through the REAL compose op. The provider refusing the structured
// call is exactly what the host hit live (OpenRouter 400'd every `response_format: json_schema` extraction on
// the default hosted model); the op swallowed it into an empty delta and the verb reported "nothing to resync".
test("RESYNC-OR: a provider refusal reaches the HOST as a reason — never a silent 'nothing changed'", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "resync-or-loud");
  const principal = hostPrincipal(hostId);
  const compose = buildCannedRpgWithText({
    app,
    db,
    api: "chat-completions",
    spy: emptySpy(),
    cannedText: "{}",
    // The catch-up round rides the CHAT role now; a provider refusal lands there.
    chatThrows: new Error("openrouter item 0 failed: Provider returned error"),
  });
  await compose.service.createGame({ principal, chatId, mode: "lite" });

  const verdict = await compose.service.resyncFromStory({ principal, chatId });

  expect(verdict.ok).toBe(false);
  // The provider's own sentence rides out — the host learns the MODEL CALL died, not that their story was clean.
  expect(verdict).toMatchObject({ ok: false, reason: expect.stringContaining("openrouter item 0 failed") });
  // …and the failed round still writes nothing (the no-op tail is unchanged; only the silence is gone).
  expect(await panelState(compose, hostId, chatId)).toMatchObject({ beats: [], journal: [] });
});

// The STRUCTURED degrade survives whole — a wire with no `tools[]` (the agent-sdk host, or a structured-only
// endpoint) still rebuilds through the projected schema, and its refusal is equally loud. Both arms of the
// resync's write-path gate are proven: this one, and the tool round above.
test("RESYNC-OR: the STRUCTURED degrade still runs (and still reports its refusal) on a tools-less wire", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "resync-structured-degrade");
  const principal = hostPrincipal(hostId);
  const structuredOnly = makeGenerationCapability({ output: { maxTokens: { min: 1, max: 4096 }, structured: true, modalities: ["text"] } });
  const compose = buildCannedRpgWithText({
    app,
    db,
    api: "chat-completions",
    spy: emptySpy(),
    cannedText: "{}",
    capability: structuredOnly,
    structuredThrows: new Error("openrouter structured item 0 failed: Provider returned error"),
  });
  await compose.service.createGame({ principal, chatId, mode: "lite" });

  const verdict = await compose.service.resyncFromStory({ principal, chatId });
  expect(verdict).toMatchObject({ ok: false, reason: expect.stringContaining("openrouter structured item 0 failed") });
});

// A wire with NEITHER write path refuses BEFORE spending anything — the capability gate, widened to cover both
// vehicles (it used to key on the structured writer alone, which would now hide the tool round from a
// tools-only connection).
test("RESYNC: a connection with no write path at all refuses legibly and calls no model", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "resync-no-writer");
  const principal = hostPrincipal(hostId);
  const spy = emptySpy();
  const compose = buildCannedRpgWithText({
    app,
    db,
    api: "chat-completions",
    spy,
    cannedText: "{}",
    capability: makeGenerationCapability({ output: { maxTokens: { min: 1, max: 4096 }, modalities: ["text"] } }),
  });
  await compose.service.createGame({ principal, chatId, mode: "lite" });

  const verdict = await compose.service.resyncFromStory({ principal, chatId });
  expect(verdict).toMatchObject({ ok: false, reason: expect.stringContaining("can't write game state") });
  expect(spy.chatTurns).toEqual([]);
  expect(spy.summarizeModels).toEqual([]);
});

// THE CATCH-UP ROUND'S VEHICLE, pinned at the request: the per-plane tool SET (the same definitions the in-turn
// vehicles mount) + `tool_choice:"required"` + NO response_format, and the host's own consent.
test("RESYNC: the catch-up round sends the per-plane TOOLS (not a monolithic schema) and folds their calls", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "resync-tool-round");
  const principal = hostPrincipal(hostId);
  const spy = emptySpy();
  const compose = buildCannedRpgWithText({
    app,
    db,
    api: "chat-completions",
    spy,
    cannedText: "{}",
    cannedToolCalls: [
      { name: "update_scene", arguments: JSON.stringify({ location: "the obsidian tower", recentEvent: "arrived at the tower" }) },
      { name: "add_journal_entry", arguments: JSON.stringify({ type: "location", title: "Arrival", content: "They reached the tower." }) },
    ],
  });
  await compose.service.createGame({ principal, chatId, mode: "lite" });

  const verdict = await compose.service.resyncFromStory({ principal, chatId });
  expect(verdict.ok).toBe(true);

  // ONE chat turn, carrying wire tools and NO responseFormat — the monolithic structured payload is gone from
  // this path (that payload is what 400'd on the default hosted model).
  expect(spy.chatTurns).toEqual([{ model: "fake-chat-model", hasResponseFormat: false, hasToolServer: false }]);
  expect(spy.schemas).toEqual([]);
  const roundTools = spy.wireTools.at(0) ?? [];
  expect(roundTools.map((t) => t.name)).toEqual(
    expect.arrayContaining(["update_party", "update_inventory", "update_scene", "upsert_quest", "add_journal_entry"]),
  );
  // Every per-plane schema is SMALL — that is the whole point of the round (the 46-optional monolith is what
  // Anthropic's grammar compiler refused). None of them is the whole extraction object.
  for (const tool of roundTools) {
    expect(Object.keys((tool.parameters["properties"] ?? {}) as Record<string, unknown>)).not.toContain("journal");
  }
  // …and the calls folded through the SAME tail the in-turn vehicles use: the state plane landed. (The
  // JOURNAL stays empty by design — a rebuild re-derives the state window and never appends archive rows,
  // VER-1a; that is unchanged by the vehicle swap.)
  expect(await panelState(compose, hostId, chatId)).toEqual({
    location: "the obsidian tower",
    beats: ["arrived at the tower"],
    journal: [],
  });
});

test("VER-1a: resyncFromStory COLLAPSES an already-accumulated beat window (the owner's one-click cleanup)", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "ver1a-resync-cleanup");
  const principal = hostPrincipal(hostId);
  const compose = buildCannedRpgWithText({
    app,
    db,
    api: "chat-completions",
    spy: emptySpy(),
    cannedText: rerollExtractionText(),
    // The resync's catch-up round rides the TOOL vehicle on this wire — same writes, the calls shape.
    cannedToolCalls: REROLL_CALLS.map((c) => ({ name: c.name, arguments: JSON.stringify(c.args) })),
  });
  const { gameId } = await compose.service.createGame({ principal, chatId, mode: "lite" });
  await compose.service.updateConfig({ principal, chatId, extractionMode: "cheap" });

  // The dev-db shape the bug left behind: ONE story moment, paraphrased into the window once per reroll/resync.
  const dup = "Niko was touched you remembered her name";
  const slot = await seedMessage(db, chatId, 1, { role: "assistant", content: "Niko blinks at you." });
  const written = await writeStagedSnapshot(
    db,
    { ...defaultSnapshotState(), location: "the konbini", recentEvents: [`${dup}, then asked about drinks.`, `${dup} and dropped the cat-bit.`, `${dup}.`] },
    { id: castId("rpg_snapshot_ver1a_dup"), gameId, messageId: slot.messageId, variantId: slot.variantId, now: FROZEN_AT_MS },
  );
  expect(written.ok).toBe(true);
  await commitSnapshotForVariant(db, slot.variantId);

  await compose.service.resyncFromStory({ principal, chatId });

  // ONE click re-derives the window from the story — the three duplicates are gone (no migration code needed;
  // the reconciler IS the cleanup). The journal rows the same bug left are NOT the resync's to remove: they are
  // durable archive rows on live anchor slots, and the host clears those with `deleteJournalEntry`.
  expect(await panelState(compose, hostId, chatId)).toEqual({ location: "the obsidian tower", beats: ["arrived at the tower"], journal: [] });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// VER-1b — A REGEN IS GENERATED AGAINST THE STATE AS OF BEFORE ITS SLOT (the READ twin of VER-1a).
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// VER-1a fixed the WRITE base; the turn's READ still resolved the head, which on a swipe/reroll IS the
// abandoned variant's snapshot (still selected while the replacement generates). So the reminder taught the
// model the beats + state of the very prose it was being asked to write DIFFERENTLY — owner-observed live in
// the model's own reasoning ("a system note describing a moment that hasn't been written yet"), and every
// reroll got railroaded into paraphrasing the rejected variant. The gather now cuts its state at the slot,
// exactly where the canon context is already cut, and exactly where the flush will apply the new variant.

/** Flush ONE beat onto a fresh assistant slot through the real folded vehicle: a scene write (location +
 *  a recorded beat) that the next gather's reminder + delta must reflect. */
async function driveBeat(args: {
  readonly compose: ReturnType<typeof buildRpg>;
  readonly db: Db;
  readonly chatId: ChatId;
  readonly seq: number;
  readonly location: string;
  readonly beat: string;
}): Promise<{ messageId: MessageId; variantId: MessageVariantId }> {
  const { compose, db, chatId, seq } = args;
  const slot = await seedMessage(db, chatId, seq, { role: "assistant", content: `Beat ${seq}.` });
  await compose.chatOps.onTurnCompleted(
    chatId,
    slot.messageId,
    slot.variantId,
    castId<ChatTurnId>(`chat_turn_ver1b_${seq}`),
    foldedTurn([{ name: "update_scene", args: { location: args.location, recentEvent: args.beat } }]),
  );
  return slot;
}

/** The depth-0 state reminder the gather contributes — the exact text the model is handed. */
function reminderText(gathered: { readonly injections: readonly { readonly content: string }[] } | null): string {
  return gathered?.injections[0]?.content ?? "";
}

test("VER-1b: a REGEN's reminder + delta read the state BEFORE the slot, never the abandoned variant's", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "ver1b-regen");
  const compose = buildCannedRpg(app, db, "chat-completions", emptySpy());
  await compose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" }); // born folded

  // Three beats. The third is the slot a swipe will re-generate; its variant A is the one being abandoned.
  await driveBeat({ compose, db, chatId, seq: 1, location: "the crossroads", beat: "met the peddler at the crossroads" });
  await driveBeat({ compose, db, chatId, seq: 2, location: "the rope bridge", beat: "crossed the rope bridge" });
  const slotC = await driveBeat({ compose, db, chatId, seq: 3, location: "the obsidian tower", beat: "confessed to Niko at the tower" });

  // The FRESH-turn arm is UNTOUCHED: the head is correct there — the next beat is written knowing beat 3 happened.
  const fresh = reminderText(
    await compose.chatOps.gatherTurnContext({ chatId, pendingUserText: undefined, respondsToLatestUserTurn: false, funderUserId: hostId }),
  );
  expect(fresh).toContain("confessed to Niko at the tower");
  expect(fresh).toContain("the obsidian tower");
  expect(fresh).toContain("CHANGES SINCE LAST BEAT: location → the obsidian tower");

  // THE REGEN of slot C: the same gather, told which slot it is re-generating.
  const regen = reminderText(
    await compose.chatOps.gatherTurnContext({
      chatId,
      pendingUserText: undefined,
      respondsToLatestUserTurn: false,
      regenSlotMessageId: slotC.messageId,
      funderUserId: hostId,
    }),
  );
  // THE DEFECT: variant A's beat + the state it wrote are GONE from what the model is told (pre-fix both were
  // present — the model was handed the confession beat while being asked to write that same moment afresh).
  expect(regen).not.toContain("confessed to Niko at the tower");
  expect(regen).not.toContain("the obsidian tower");
  // …and what IS there is the state as of the slot's start — beat 2's world, the same one variant A was written against.
  expect(regen).toContain("crossed the rope bridge");
  expect(regen).toContain("the rope bridge");
  // THE DELTA PAIR is pre-slot-consistent too (prev→cur = beat 1→beat 2), so "CHANGES SINCE LAST BEAT" never
  // describes the abandoned variant's own changes — it is byte-identically the block variant A was generated with.
  expect(regen).toContain("CHANGES SINCE LAST BEAT: location → the rope bridge");
});

test("VER-1b: the regen read is the SAME state the flush applies onto (read base == write base)", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "ver1b-base-parity");
  const compose = buildCannedRpg(app, db, "chat-completions", emptySpy());
  await compose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });

  await driveBeat({ compose, db, chatId, seq: 1, location: "the rope bridge", beat: "crossed the rope bridge" });
  const slot = await driveBeat({ compose, db, chatId, seq: 2, location: "the obsidian tower", beat: "confessed to Niko at the tower" });

  // The reroll: a second variant on slot 2, selected, flushed with ITS OWN beat — the gather that generated it
  // read pre-slot state, and VER-1a's write base applied its writes onto that same pre-slot state.
  const regen = reminderText(
    await compose.chatOps.gatherTurnContext({
      chatId,
      pendingUserText: undefined,
      respondsToLatestUserTurn: false,
      regenSlotMessageId: slot.messageId,
      funderUserId: hostId,
    }),
  );
  expect(regen).toContain("crossed the rope bridge");
  expect(regen).not.toContain("confessed to Niko at the tower");
  const rerolled = await addVariant(db, slot.messageId, 2, "She says nothing at all.");
  await selectVariant(db, slot.messageId, rerolled);
  await compose.chatOps.onTurnCompleted(
    chatId,
    slot.messageId,
    rerolled,
    castId<ChatTurnId>("chat_turn_ver1b_reroll"),
    foldedTurn([{ name: "update_scene", args: { location: "the tower stair", recentEvent: "turned away on the stair" } }]),
  );

  // The rerolled variant SUPERSEDES: one beat per moment, and the abandoned variant's beat/location are gone
  // from the panel — the read the model got and the state its writes landed on describe the same world.
  expect(await panelState(compose, hostId, chatId)).toEqual({
    location: "the tower stair",
    beats: ["crossed the rope bridge", "turned away on the stair"],
    journal: [],
  });
});

test("VER-1b: the regen read is mode-INDEPENDENT — one gather, identical reminder on both vehicles", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "ver1b-modes");
  const compose = buildCannedRpg(app, db, "chat-completions", emptySpy());
  await compose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" }); // born folded
  // ONE game, ONE state history (landed through the fold), then the host flips the delivery mode under it.
  await driveBeat({ compose, db, chatId, seq: 1, location: "the rope bridge", beat: "crossed the rope bridge" });
  const slot = await driveBeat({ compose, db, chatId, seq: 2, location: "the obsidian tower", beat: "confessed to Niko at the tower" });

  const reminders: string[] = [];
  for (const mode of ["folded", "cheap"] as const) {
    await compose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: mode });
    reminders.push(
      reminderText(
        await compose.chatOps.gatherTurnContext({
          chatId,
          pendingUserText: undefined,
          respondsToLatestUserTurn: false,
          regenSlotMessageId: slot.messageId,
          funderUserId: hostId,
        }),
      ),
    );
  }
  // The delivery mode picks the WRITE vehicle; it never changes what the turn READS. The pre-slot cut therefore
  // rides both without a per-mode arm (the reminder is one gather — this pins that it stays one).
  expect(new Set(reminders).size).toBe(1);
  expect(reminders[0]).toContain("crossed the rope bridge");
  expect(reminders[0]).not.toContain("confessed to Niko at the tower");
});
