// COMPOSED-REAL: the server graph loads in the untimed IMPORT phase, never inside the first test's timeout (#2386 — support/node/composed-real.ts).
import { FROZEN_AT_MS } from "@orb/testkit/iso/clock.ts";
import "@orb/testkit/node/composed-real.ts";
// entry/compose/rpg — per-call enums over the live scene and cast, usage logging, the empty and phantom extraction signals, host resolution and the unresolvable-connection degrade.

// @orb-waive-file no-test-fabrication(Record<string, unknown> | undefined): baselined when the gate widened to value casts; burn-down item 906.
import type { RpgSnapshotState } from "@orb/contracts/rpg";
import type { Db } from "@orb/db";
import type { ResolveOutcome } from "@orb/inference";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createResolveViewerVisibility } from "@orb/server/domain/chat";
import type { ServicesResult } from "@orb/server/entry/compose";
import { logger } from "@orb/server/foundation/observability";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { vi } from "vitest";
import { seedCharacter, seedChat, seedMessage, seedParticipant, seedUser } from "../../domain/chat/_support.ts";
import {
  buildCannedRpg,
  buildCannedRpgWithText,
  buildRpg,
  commitSnapshotForVariant,
  emptySpy,
  hostPrincipal,
  seedHostGameChat,
  TURN,
  tc,
  writeStagedSnapshot,
} from "./_rpg-support.ts";

// ── F4: the per-call enum includes existing scene-cast + cast-actor keys (removal + cast-actor reach) ────
/** A base snapshot state carrying two tracked cast actors — one ON stage, one tracked-only — which is the
 *  ONE namespace F4's enum walks since R2 (the scene cast and the tracked cast are the same rows now). The
 *  enum offers each actor's DISPLAY name, so `presentRemove` can name an NPC and party/inventory can reach a
 *  cast actor whether or not she is standing in the scene. */
function baseWithCast(): RpgSnapshotState {
  const castRow = (npcKey: string, name: string): RpgSnapshotState["actorState"][number] => ({
    actorRef: { kind: "npc", npcKey },
    identity: { name, emoji: "", mood: "", relationship: { kind: "neutral", label: "" } },
    volatile: { trackerValues: {}, conditions: [], inventory: [], wallet: [], status: "" },
  });
  return {
    clock: null,
    calendarDate: null,
    location: "the tavern",
    weather: null,
    presentCharacters: ["npc:bartender"],
    recentEvents: [],
    actorState: [castRow("bartender", "Bartender"), castRow("goblin", "Goblin")],
    trackerValues: {},
    quests: [],
    plot: null,
    fieldLocks: null,
  };
}

test("F4: presentRemove enum names an existing scene NPC + party.targetRef reaches an existing cast actor", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "f4-cast-enum");
  const spy = emptySpy();
  const rpgCompose = buildCannedRpg(app, db, "agent-sdk", spy);
  const { gameId } = await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" }); // born folded — this test drives the DEDICATED round (structured on the agent-sdk wire)

  // Seed a COMMITTED base snapshot carrying the scene NPC + cast actor, so the round's `baseState` (resolved via
  // the ladder) hands those keys to `resolveExtractionRefs`.
  const { messageId: baseMsg, variantId: baseVar } = await seedMessage(db, chatId, 1, { role: "assistant", content: "You reach the tavern." });
  const written = await writeStagedSnapshot(db, baseWithCast(), {
    id: castId("rpg_snapshot_f4base"),
    gameId,
    messageId: baseMsg,
    variantId: baseVar,
    now: FROZEN_AT_MS,
  });
  expect(written.ok).toBe(true);
  await commitSnapshotForVariant(db, baseVar);

  // The NEXT turn runs the round; its baseState is the committed snapshot above.
  const { messageId, variantId } = await seedMessage(db, chatId, 2, { role: "assistant", content: "The goblin snarls; the bartender ducks." });
  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, tc("agent-sdk"));

  const schema = spy.schemas[0] as {
    properties?: {
      party?: { items?: { properties?: { targetRef?: { enum?: string[] } } } };
      scene?: { properties?: { presentRemove?: { items?: { enum?: string[] } } } };
    };
  };
  // party.targetRef can reach the existing cast actor (F4 — cast-actor writes are representable).
  expect(schema.properties?.party?.items?.properties?.targetRef?.enum).toContain("Goblin");
  // scene.presentRemove can name the existing scene NPC (F4 — scene cast can shrink, not only grow).
  expect(schema.properties?.scene?.properties?.presentRemove?.items?.enum).toContain("Bartender");
});

test("R5a: the LIVE active conditions bind party[].removeCondition to an enum (a comma-joined list is untypeable)", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "r5a-conditions");
  const spy = emptySpy();
  const rpgCompose = buildCannedRpg(app, db, "agent-sdk", spy);
  const { gameId } = await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" }); // born folded — this test drives the DEDICATED round (structured on the agent-sdk wire)

  // A committed base snapshot where the tracked cast actor CARRIES conditions — the only source of the enum.
  const afflicted = baseWithCast();
  const { messageId: baseMsg, variantId: baseVar } = await seedMessage(db, chatId, 1, { role: "assistant", content: "The goblin festers." });
  const written = await writeStagedSnapshot(
    db,
    {
      ...afflicted,
      actorState: afflicted.actorState.map((a) => ({
        ...a,
        volatile: {
          ...a.volatile,
          conditions: [
            { name: "Bleeding", stat: null, modifier: 0, turnsLeft: null },
            { name: "Poisoned", stat: null, modifier: 0, turnsLeft: null },
          ],
        },
      })),
    },
    { id: castId("rpg_snapshot_r5a"), gameId, messageId: baseMsg, variantId: baseVar, now: FROZEN_AT_MS },
  );
  expect(written.ok).toBe(true);
  await commitSnapshotForVariant(db, baseVar);

  const { messageId, variantId } = await seedMessage(db, chatId, 2, { role: "assistant", content: "The goblin's wounds close." });
  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, tc("agent-sdk"));

  const schema = spy.schemas[0] as { properties?: { party?: { items?: { properties?: { removeCondition?: { enum?: string[] } } } } } };
  const enumValues = schema.properties?.party?.items?.properties?.removeCondition?.enum;
  expect(enumValues).toEqual(["Bleeding", "Poisoned"]);
  // R5b(a) — the PROMPT half of the same fact (`refEnumerationLines`): a backend whose wire can't enforce the
  // enum still reads the live list in prose, so it can only retire a condition somebody actually carries.
  expect(spy.systemPrompts[0]).toContain("Currently-active conditions (removeCondition must name EXACTLY one of these): Bleeding, Poisoned.");
});

// ── F10: a roster character literally named "Player" owns the `player` ref; the token is withheld ───────
test("F10: a roster character named 'Player' is enum-able and the semantic 'player' token is withheld (no collision)", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "f10-player-collision");
  // A ROSTER character literally named "Player" — `buildActorRefIndex` gives it precedence over the self-alias,
  // so it OWNS the `player` ref. The enum must therefore offer "Player" (the char is targetable) and NOT the
  // bare `player` token (which would shadow the real roster entry — the F10 seam).
  const playerCharId = await seedCharacter(db, hostId, "Player");
  await seedParticipant(db, { chatId, key: "f10_playerchar", characterId: playerCharId, role: "member", joinSeq: 1 });

  const spy = emptySpy();
  const rpgCompose = buildCannedRpg(app, db, "agent-sdk", spy);
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" }); // born folded — this test drives the DEDICATED round (structured on the agent-sdk wire)
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "Player draws a blade." });
  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, tc("agent-sdk"));

  const schema = spy.schemas[0] as { properties?: { party?: { items?: { properties?: { targetRef?: { enum?: string[] } } } } } };
  const enumVals = schema.properties?.party?.items?.properties?.targetRef?.enum;
  expect(enumVals).toContain("Player"); // the roster char IS targetable (not dropped)
  expect(enumVals).not.toContain("player"); // the semantic token is withheld — the char owns the ref (F10)
  // The prompt does NOT emit the misleading `"player" = the human` explainer when the token isn't offered.
  expect(spy.systemPrompts[0]).not.toContain('"player" = the human');
});

// §10.1a — the DEDICATED tool round's economics record. That vehicle rides the CHAT role on a stateless
// backend, which emits neither `provider.structured-item` (the structured arms' per-item log) nor
// `provider.turn` (agent-sdk's): before this line the round's tokens and cost left NO record at all, so
// §10.1a's "recorded in the provider-observability plane" was false exactly here.
test("§10.1a: the cheap TOOL ROUND logs its usage (tokens + cost) — the vehicle no provider log covers", async ({ app, db }) => {
  const infoSpy = vi.spyOn(logger, "info");
  const { chatId, hostId } = await seedHostGameChat(db, "toolround-usage");
  const spy = emptySpy();
  const rpgCompose = buildCannedRpgWithText({
    app,
    db,
    api: "chat-completions",
    spy,
    cannedText: "{}",
    cannedToolCalls: [{ name: "update_scene", arguments: JSON.stringify({ location: "the obsidian tower" }) }],
  });

  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "They arrive at the tower." });
  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, tc("chat-completions"));

  // @orb-waive no-test-fabrication({ event?: string }): baselined when the gate widened to value casts; burn-down item 906.
  const line = infoSpy.mock.calls.find((c) => (c[0] as { event?: string }).event === "rpg.toolround.usage")?.[0] as Record<string, unknown> | undefined;
  expect(line).toBeDefined();
  expect(line).toMatchObject({
    chatId,
    api: "chat-completions",
    model: "fake-chat-model",
    tokensIn: 1200,
    tokensOut: 90,
    costUsd: 0.0042,
    finishReason: "stop",
  });
});

// ── R3: visibility — a zero-renderable extraction + a phantom cast mint both LOG ────────────────────────
test("R3: an extraction that writes NOTHING renderable logs rpg.extraction.empty (the silent-panel signal)", async ({ app, db }) => {
  const infoSpy = vi.spyOn(logger, "warn");
  const { chatId, hostId } = await seedHostGameChat(db, "r3-empty");
  const spy = emptySpy();
  // Override the canned text to an EMPTY extraction (parses, but folds to zero writes).
  const rpgCompose = buildCannedRpgWithText({ app, db, api: "agent-sdk", spy, cannedText: JSON.stringify({}) });
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" }); // born folded — this test drives the DEDICATED round (structured on the agent-sdk wire)
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "Nothing tracked changed." });
  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, tc("agent-sdk"));

  // @orb-waive no-test-fabrication({ event?: string }): baselined when the gate widened to value casts; burn-down item 906.
  const line = infoSpy.mock.calls.find((c) => (c[0] as { event?: string }).event === "rpg.extraction.empty");
  expect(line).toBeDefined();
});

test("R5: an extraction targeting a GHOST actor is DROPPED (no cast mint) + logs rpg.extraction.phantom", async ({ app, db }) => {
  const warnSpy = vi.spyOn(logger, "warn");
  const { chatId, hostId } = await seedHostGameChat(db, "r3-phantom");
  const spy = emptySpy();
  // A phantom target "player" that the roster doesn't literally contain — but resolveActor's self-alias maps
  // it to the user, so it is NOT phantom. Use a genuinely-unknown name to force the ghost-guard canary.
  const rpgCompose = buildCannedRpgWithText({
    app,
    db,
    api: "agent-sdk",
    spy,
    // A partial extraction JSON — the schema fills the other planes with defaults on parse (a real model
    // emits exactly this shape); only `party` carries the non-roster phantom target.
    cannedText: JSON.stringify({ party: [{ targetRef: "Zzyzx the Unknown", status: "cursed" }] }),
  });
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" }); // born folded — this test drives the DEDICATED round (structured on the agent-sdk wire)
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "A stranger appears." });
  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, tc("agent-sdk"));

  // @orb-waive no-test-fabrication({ event?: string }): baselined when the gate widened to value casts; burn-down item 906.
  const line = warnSpy.mock.calls.find((c) => (c[0] as { event?: string }).event === "rpg.extraction.phantom");
  expect(line).toBeDefined();
  // @orb-waive no-test-fabrication({ phantomTargets?: string[] }): baselined when the gate widened to value casts; burn-down item 906.
  expect((line?.[0] as { phantomTargets?: string[] }).phantomTargets).toContain("Zzyzx the Unknown");
  // R5: the ghost arg was DROPPED, so nothing was tracked — the panel never gains a hallucinated actor. The
  // empty-outcome line fires ALONGSIDE the ghost line (independent branches: the cause must not hide behind
  // the symptom now that a ghost-only extraction is by definition a write-nothing extraction).
  // @orb-waive no-test-fabrication({ event?: string }): baselined when the gate widened to value casts; burn-down item 906.
  expect(warnSpy.mock.calls.some((c) => (c[0] as { event?: string }).event === "rpg.extraction.empty")).toBe(true);
  const view = await rpgCompose.service.getTrackerView({ principal: hostPrincipal(hostId), chatId });
  expect(view.actors.some((a) => a.actorRef.kind === "npc")).toBe(false);
});

test("F3: the host is resolved by ROLE, not join order (post-handoff: first-joined human is a member)", async ({ app, db }) => {
  // Simulate a post-`acceptHostHandoff` state (D64): the first-joined human (joinSeq 0) is now a plain MEMBER,
  // and the current host joined later (joinSeq 1) — roles swapped in place, join order unchanged. The old
  // `find(kind==="user")` picked the first human (the member); the fix resolves by role='host'.
  const member = await seedUser(db, castId<Handle>("f3_member"));
  const host = await seedUser(db, castId<Handle>("f3_host"));
  const chatId = await seedChat(db, "f3");
  await seedParticipant(db, { chatId, key: "f3_member", userId: member, role: "member", joinSeq: 0 });
  await seedParticipant(db, { chatId, key: "f3_host", userId: host, role: "host", joinSeq: 1 });

  // The DIVERGENCE the bug exploited: the roster projection (join order) puts the MEMBER first — the old
  // `find(kind==="user")` would have picked it. Prove the two answers differ here.
  const rosterFirstHuman = (await app.chatRpgOps.resolveRpgParticipants(chatId)).find((a) => a.actorRef.kind === "user");
  expect(rosterFirstHuman?.actorRef.kind === "user" && rosterFirstHuman.actorRef.userId).toBe(member);

  // The composed chat-side host resolver (what the rpg extraction + capability verdict read) resolves the
  // role='host' participant — NOT the first-joined human. This is the repro-gone assertion.
  expect(await app.chatRpgOps.resolveHostUserId(chatId)).toBe(host);
});

// ── FIX 1: a game READ degrades to trackersReadOnly:true when the chat connection is unresolvable, never 500s ──
/** Build an rpg over the REAL chat wiring + real db, but with a `resolveChat` that THROWS `err` — the
 *  misconfigured-backend repro (a stale routing setting whose (api,source) pair maps to no coherent backend).
 *  The READ-side `trackersReadOnly` pill must catch the connection-resolution error and degrade to read-only,
 *  never let it escape as a 500. */
function buildRpgWithThrowingResolveChat(app: ServicesResult, db: Db, err: unknown): ReturnType<typeof buildRpg> {
  return buildRpg({
    db,
    now: () => FROZEN_AT_MS,
    rpgChatOps: app.chatRpgOps,
    // #1528 - the member-facing reads' projection verdict, built off the same db (chat's ONE clamp home).
    resolveViewerVisibility: createResolveViewerVisibility({ db }),
    connection: {
      resolve: (): Promise<ResolveOutcome> => Promise.reject(err),
    },
    executor: {
      runChatTurn: () => Promise.reject(new Error("unreached — the round never fires on a readonly READ")),
    },
    resolveHostPrincipal: (userId) => Promise.resolve(hostPrincipal(userId)),
    resolvePresetOwned: () => Promise.resolve(false),
    copyPresetToUser: () => Promise.resolve(null),
    toolUse: { register: () => undefined },
    // R4 promotion deps — these tests exercise state rounds, never the mint; loud if ever reached.
    character: {
      create: () => Promise.reject(new Error("unused: promotion not exercised")),
      findByHandle: () => Promise.resolve(null),
      findByImportHash: () => Promise.resolve(null),
    },
    chat: { addCharacterToChat: () => Promise.reject(new Error("unused: promotion not exercised")) },
    // D126 — the admin-tier structured-output shape, on its shipped floor (the real root reads it per call off
    // `getEffectiveConfig()`); the strict-arm pin below overrides it.
  });
}

test("FIX 1: an UNEXPECTED resolveChat failure still PROPAGATES — the catch never swallows a real bug", async ({ app, db }) => {
  // The boundary the verifier checks: the catch is SPECIFIC to the connection-resolution error classes. A
  // genuinely unexpected failure (a DB fault, a transient catalog gap, a programming bug) must escape so it is
  // surfaced/root-caused, NOT silently masked as "read-only". Drive a plain Error and assert the READ throws it.
  const { chatId, hostId } = await seedHostGameChat(db, "fix1-unexpected");
  const boom = new Error("unexpected infra fault");
  // Create the game through a NON-throwing build first (createGame also reads the pill — the unexpected error is
  // scoped to the READ under test, not birth), then READ it through a build whose resolveChat throws `boom`.
  await buildCannedRpg(app, db, "chat-completions", emptySpy()).service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  const rpgCompose = buildRpgWithThrowingResolveChat(app, db, boom);

  await expect(rpgCompose.service.getGame({ principal: hostPrincipal(hostId), chatId })).rejects.toBe(boom);
});
