// COMPOSED-REAL: the server graph loads in the untimed IMPORT phase, never inside the first test's timeout (#2386 — support/node/composed-real.ts).
import "@orb/testkit/node/composed-real.ts";
// entry/compose/rpg — the same malformed payload leaves identical state on all three delivery paths, the born-folded fallback, quest updates, the mounted terminal tools and the prompt-cache property.

// @orb-waive-file no-test-fabrication({ dropped?: { plane: string }[] }): baselined when the gate widened to value casts; burn-down item 906.
// @orb-waive-file no-test-fabrication({ dropped?: { plane: string; index: number | null }[] }): baselined when the gate widened to value casts; burn-down item 906.
// @orb-waive-file no-test-fabrication({ healedJournalTypes?: number[] }): baselined when the gate widened to value casts; burn-down item 906.
// @orb-waive-file no-test-fabrication({ properties?: Record<string, unknown> }): baselined when the gate widened to value casts; burn-down item 906.
// @orb-waive-file no-test-fabrication({ properties?: { key?: { enum?: string[] } } }): baselined when the gate widened to value casts; burn-down item 906.
// @orb-waive-file no-test-fabrication({ properties?: { trackerDeltas?: { items?: { properties?: { key?: { enum?: string[] } } } } } }): baselined when the gate widened to value casts; burn-down item 906.
// @orb-waive-file no-test-fabrication({ required?: string[] }): baselined when the gate widened to value casts; burn-down item 906.
import { RPG_TOOL_ROUND_TOOL_NAMES, rpgTrackerDefSchema } from "@orb/contracts/rpg";
import type { ChatId, ChatTurnId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { logger } from "@orb/server/foundation/observability";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { vi } from "vitest";
import { seedMessage } from "../../domain/chat/_support.ts";
import type { buildRpg } from "./_rpg-support.ts";
import { buildCannedRpg, buildCannedRpgWithText, emptySpy, foldedTurn, hostPrincipal, seedHostGameChat, TURN, tc } from "./_rpg-support.ts";

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// EXT-4a — EQUAL DROP SEMANTICS: one malformed payload, all THREE delivery paths, identical survivors.
// ══════════════════════════════════════════════════════════════════════════════════════════════════
// The defect: the structured arm validated the WHOLE extraction with one `safeParse`, so a single malformed field
// discarded all six planes — while cheap/folded, validating per call, lost only the bad call. This is the
// invariant that can never regress: change only the VEHICLE and the surviving state is byte-identical.

/** The turn's writes, as TOOL CALLS: four good planes + a content-less journal entry (MALFORMED — the whole
 *  entry is unsalvageable) + a type-less one (HEALED to `note`, the EXT-4b arm). */
const MIXED_CALLS = [
  { name: "update_party", args: { targetRef: "player", status: "wounded" } },
  { name: "update_scene", args: { location: "the ford", recentEvent: "forded the river" } },
  { name: "upsert_quest", args: { name: "Cross the river", action: "create", objectives: ["Find the ford"] } },
  { name: "add_journal_entry", args: { type: "note", title: "a title with no body" } },
  { name: "add_journal_entry", args: { content: "They forded the river." } },
];

/** The SAME writes as a structured-output payload (the shared-plane proof: an extraction is a batch of
 *  the tool calls the model would otherwise have made). Derived from `MIXED_CALLS` so the two can never drift. */
function mixedExtractionText(): string {
  const argsFor = (name: string): unknown[] => MIXED_CALLS.filter((c) => c.name === name).map((c) => c.args);
  return JSON.stringify({
    party: argsFor("update_party"),
    scene: argsFor("update_scene")[0],
    quests: argsFor("upsert_quest"),
    journal: argsFor("add_journal_entry"),
  });
}

/** The DURABLE survivors of a turn, read back through the real views — the thing the three paths must agree on
 *  (ids/timestamps excluded: they are per-run mints, not semantics). */
async function survivingState(compose: ReturnType<typeof buildRpg>, hostId: UserId, chatId: ChatId): Promise<unknown> {
  const principal = hostPrincipal(hostId);
  const view = await compose.service.getTrackerView({ principal, chatId });
  const journal = await compose.service.listJournal({ principal, chatId, limit: 50 });
  return {
    location: view.ambient?.location,
    beats: view.recentBeats,
    statuses: view.actors.map((a) => a.volatile?.status ?? null),
    quests: view.quests.map((q) => ({ name: q.name, status: q.status, objectives: q.objectives.map((o) => ({ text: o.text, completed: o.completed })) })),
    journal: journal.map((j) => ({ type: j.type, label: j.label, title: j.title, content: j.content })),
  };
}

test("EXT-4a: the SAME malformed payload leaves IDENTICAL state on all three delivery paths", async ({ app, db }) => {
  const warnSpy = vi.spyOn(logger, "warn");

  // (1) STRUCTURED — the schema emission (the agent-sdk degrade), salvaged per plane / per entry.
  const rel = await seedHostGameChat(db, "ext4-structured");
  const relCompose = buildCannedRpgWithText({ app, db, api: "agent-sdk", spy: emptySpy(), cannedText: mixedExtractionText() });
  await relCompose.service.createGame({ principal: hostPrincipal(rel.hostId), chatId: rel.chatId, mode: "lite" });
  await relCompose.service.updateConfig({ principal: hostPrincipal(rel.hostId), chatId: rel.chatId, extractionMode: "cheap" });
  const relSlot = await seedMessage(db, rel.chatId, 1, { role: "assistant", content: "They ford the river." });
  await relCompose.chatOps.onTurnCompleted(rel.chatId, relSlot.messageId, relSlot.variantId, TURN, tc("agent-sdk"));

  // (2) CHEAP — the dedicated tool round, answered with the same writes as parallel calls.
  const cheap = await seedHostGameChat(db, "ext4-cheap");
  const cheapCompose = buildCannedRpgWithText({
    app,
    db,
    api: "chat-completions",
    spy: emptySpy(),
    cannedText: "{}",
    cannedToolCalls: MIXED_CALLS.map((c) => ({ name: c.name, arguments: JSON.stringify(c.args) })),
  });
  await cheapCompose.service.createGame({ principal: hostPrincipal(cheap.hostId), chatId: cheap.chatId, mode: "lite" });
  await cheapCompose.service.updateConfig({ principal: hostPrincipal(cheap.hostId), chatId: cheap.chatId, extractionMode: "cheap" });
  const cheapSlot = await seedMessage(db, cheap.chatId, 1, { role: "assistant", content: "They ford the river." });
  await cheapCompose.chatOps.onTurnCompleted(cheap.chatId, cheapSlot.messageId, cheapSlot.variantId, TURN, tc("chat-completions"));

  // (3) FOLDED — the character turn's own co-emitted calls.
  const fold = await seedHostGameChat(db, "ext4-folded");
  const foldCompose = buildCannedRpg(app, db, "chat-completions", emptySpy());
  await foldCompose.service.createGame({ principal: hostPrincipal(fold.hostId), chatId: fold.chatId, mode: "lite" });
  const foldSlot = await seedMessage(db, fold.chatId, 1, { role: "assistant", content: "They ford the river." });
  await foldCompose.chatOps.onTurnCompleted(fold.chatId, foldSlot.messageId, foldSlot.variantId, TURN, foldedTurn(MIXED_CALLS));

  const survivors = await Promise.all([
    survivingState(relCompose, rel.hostId, rel.chatId),
    survivingState(cheapCompose, cheap.hostId, cheap.chatId),
    survivingState(foldCompose, fold.hostId, fold.chatId),
  ]);
  // THE INVARIANT: three vehicles, one outcome.
  expect(survivors[1]).toEqual(survivors[0]);
  expect(survivors[2]).toEqual(survivors[0]);
  // …and that outcome is the RIGHT one: the four good planes landed, the malformed journal entry alone died,
  // and the type-less beat was healed rather than dropped. (Pre-fix, the structured arm's survivors were EMPTY.)
  expect(survivors[0]).toEqual({
    location: "the ford",
    beats: ["forded the river"],
    statuses: ["wounded"],
    quests: [{ name: "Cross the river", status: "active", objectives: [{ text: "Find the ford", completed: false }] }],
    journal: [{ type: "note", label: "", title: "They forded the river.", content: "They forded the river." }],
  });
  // Every path NAMED its loss (D109-7 totality): the structured arm itemizes plane+entry, the tool arms name
  // the tool — and the heal has its own line, so a silently-degrading model is visible on all three.
  // @orb-waive no-test-fabrication({ event?: string }): baselined when the gate widened to value casts; burn-down item 906.
  const unparseable = warnSpy.mock.calls.filter((c) => (c[0] as { event?: string }).event === "rpg.extraction.unparseable");
  expect(unparseable.length).toBe(3);
  expect((unparseable[0]?.[0] as { dropped?: { plane: string; index: number | null }[] })?.dropped).toEqual([
    { plane: "journal", index: 0, issues: expect.arrayContaining([expect.stringContaining("content")]) },
  ]);
  // @orb-waive no-test-fabrication({ droppedTools?: string[] }): baselined when the gate widened to value casts; burn-down item 906.
  expect((unparseable[1]?.[0] as { droppedTools?: string[] })?.droppedTools).toEqual(["add_journal_entry"]);
  // @orb-waive no-test-fabrication({ droppedTools?: string[] }): baselined when the gate widened to value casts; burn-down item 906.
  expect((unparseable[2]?.[0] as { droppedTools?: string[] })?.droppedTools).toEqual(["add_journal_entry"]);
  // @orb-waive no-test-fabrication({ event?: string }): baselined when the gate widened to value casts; burn-down item 906.
  const healed = warnSpy.mock.calls.filter((c) => (c[0] as { event?: string }).event === "rpg.extraction.healed");
  expect(healed).toHaveLength(3);
  expect((healed[0]?.[0] as { healedJournalTypes?: number[] })?.healedJournalTypes).toEqual([0]);
});

test("EXT-4a: a totally unparseable structured payload is still one WARN + an empty delta (no partial garbage)", async ({ app, db }) => {
  const warnSpy = vi.spyOn(logger, "warn");
  const { chatId, hostId } = await seedHostGameChat(db, "ext4-garbage");
  const rpgCompose = buildCannedRpgWithText({ app, db, api: "agent-sdk", spy: emptySpy(), cannedText: "I'm sorry, I can't do that." });
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "Nothing lands." });
  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, tc("agent-sdk"));

  // @orb-waive no-test-fabrication({ event?: string }): baselined when the gate widened to value casts; burn-down item 906.
  const line = warnSpy.mock.calls.find((c) => (c[0] as { event?: string }).event === "rpg.extraction.unparseable");
  expect((line?.[0] as { dropped?: { plane: string }[] })?.dropped).toEqual([{ plane: "root", index: null, issues: ["expected a JSON object"] }]);
  const view = await rpgCompose.service.getTrackerView({ principal: hostPrincipal(hostId), chatId });
  expect(view.ambient).toBeNull(); // nothing salvageable ⇒ no snapshot at all (the non-writing turn)
});

test("BORN FOLDED: a FRESH game on an agent-sdk wire still lands state — via the LOUD fallback round", async ({ app, db }) => {
  // Games are born `folded` (owner ruling 2026-08-01), and the stateful agent-sdk wire cannot carry terminal
  // tools — so the very first turn of a brand-new room on that backend takes the degrade arm. It must (a) still
  // write its state and (b) SAY it fell back: a delivery fork that resolves silently is BANNED (D112 (3)).
  const warnSpy = vi.spyOn(logger, "warn");
  const { chatId, hostId } = await seedHostGameChat(db, "born-folded-sdk");
  const spy = emptySpy();
  const rpgCompose = buildCannedRpg(app, db, "agent-sdk", spy);
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" }); // NO updateConfig — born folded
  expect((await rpgCompose.service.getGame({ principal: hostPrincipal(hostId), chatId })).extractionMode).toBe("folded");
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "They arrive at the tower." });

  // `terminalToolCalls: null` = the character turn could not mount the tools (the agent-sdk wire).
  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, tc("agent-sdk"));

  // The state landed anyway (cheap's round on agent-sdk rides the SAME structured extraction — shared plane).
  const view = await rpgCompose.service.getTrackerView({ principal: hostPrincipal(hostId), chatId });
  expect(view.ambient?.location).toBe("the obsidian tower");
  // …and the extra call the fold exists to delete is VISIBLE in the trail, named.
  // @orb-waive no-test-fabrication({ event?: string }): baselined when the gate widened to value casts; burn-down item 906.
  const path = warnSpy.mock.calls.find((c) => (c[0] as { event?: string }).event === "rpg.extraction.path");
  expect(path?.[0]).toMatchObject({ mode: "folded", path: "tool-round", fallbackReason: "no-terminal-channel" });
});

test("EXT-4c: a quest UPDATE restating its objectives keeps the completed ones (composed-real, folded)", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "ext4-quest");
  const rpgCompose = buildCannedRpg(app, db, "chat-completions", emptySpy());
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });

  // Beat 1: the quest is created with two objectives.
  const slot1 = await seedMessage(db, chatId, 1, { role: "assistant", content: "The task opens." });
  await rpgCompose.chatOps.onTurnCompleted(
    chatId,
    slot1.messageId,
    slot1.variantId,
    castId<ChatTurnId>("chat_turn_quest_1"),
    foldedTurn([{ name: "upsert_quest", args: { name: "Reach the Vault", action: "create", objectives: ["Find the road", "Enter the vault"] } }]),
  );

  // Beat 2: the model marks ONE objective done AND restates the list (the shape that used to wipe the flag).
  const slot2 = await seedMessage(db, chatId, 2, { role: "assistant", content: "The road is found." });
  await rpgCompose.chatOps.onTurnCompleted(
    chatId,
    slot2.messageId,
    slot2.variantId,
    castId<ChatTurnId>("chat_turn_quest_2"),
    foldedTurn([
      {
        name: "upsert_quest",
        args: { name: "Reach the Vault", action: "update", objectives: ["Find the road", "Enter the vault"], completeObjectives: ["Find the road"] },
      },
    ]),
  );

  const view = await rpgCompose.service.getTrackerView({ principal: hostPrincipal(hostId), chatId });
  expect(view.quests[0]?.objectives.map((o) => ({ text: o.text, completed: o.completed }))).toEqual([
    { text: "Find the road", completed: true },
    { text: "Enter the vault", completed: false },
  ]);
  // The ids survived the restatement too — the objective is the SAME line, not a re-mint.
  const ids = view.quests[0]?.objectives.map((o) => o.id) ?? [];
  expect(new Set(ids).size).toBe(2);
});

test("R1: the mounted terminal tools ARE the round's set, ref-constrained (the fold changes delivery, not schema)", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "r1-tools");
  const rpgCompose = buildCannedRpg(app, db, "chat-completions", emptySpy());
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });

  // The host's opt-out (cheap) mounts NONE — the two-call arm never touches the character turn's wire.
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" });
  const built = await rpgCompose.chatOps.gatherTurnContext({ chatId, pendingUserText: undefined, respondsToLatestUserTurn: false, funderUserId: hostId });
  expect(built?.terminalTools).toBeUndefined();

  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "folded" });
  const folded = await rpgCompose.chatOps.gatherTurnContext({ chatId, pendingUserText: undefined, respondsToLatestUserTurn: false, funderUserId: hostId });
  // The SAME tools the dedicated round sends, in the same order, incl. the `no_changes` escape. R6: this game
  // defines NO game-subject tracker, so `set_tracker` is OMITTED ENTIRELY (a disabled feature's tool is absent,
  // never an empty husk) — the rest of the round's set is byte-identical.
  expect(folded?.terminalTools?.map((t) => t.name)).toEqual([...RPG_TOOL_ROUND_TOOL_NAMES].filter((n) => n !== "set_tracker"));
  // …carrying the CACHE-STABLE ref projection (F4): the party plane is fully writable, but its scene-derived
  // enums are gone — this payload opens the character turn's cached prefix (the byte-stability pin is below).
  // @orb-waive no-test-fabrication({): baselined when the gate widened to value casts; burn-down item 906.
  const party = folded?.terminalTools?.find((t) => t.name === "update_party")?.parameters as {
    properties?: { targetRef?: { enum?: string[]; type?: string }; hpDelta?: unknown; addCondition?: unknown };
  };
  expect(party.properties?.targetRef?.enum).toBeUndefined();
  expect(party.properties?.targetRef?.type).toBe("string");
  // The party plane's non-tracker arms survive; `hpDelta` does not (R3 — health rides `trackerDeltas`).
  expect(party.properties?.hpDelta).toBeUndefined();
  expect(party.properties?.addCondition).toBeDefined();
  // RV-9: `update_scene`'s description carries the WHEN — the panel's Waystone only reads as a clock if the
  // model actually advances time/weather/day, and a bare field list measurably doesn't get that written.
  const scene = folded?.terminalTools?.find((t) => t.name === "update_scene");
  expect(scene?.description).toContain("timeOfDay");
  expect(scene?.description).toContain("spends time");
  expect(scene?.description).toContain("sky turns");
  // …and that weather is the WORLD'S weather, omitted indoors. Every enum member is an outdoor condition, so
  // an interior scene has no legal value; the old copy still pushed for one, and the resulting
  // `weather.type: "indoors"` used to discard the entire `update_scene` call (location + cast + recentEvent
  // with it). The tool DESCRIPTION carries this because a schema-enforcing backend reads it, not the prose.
  expect(scene?.description).toContain("WORLD'S weather");
  expect(scene?.description).toContain("indoors or out");
  expect(scene?.description).toContain("when the story says nothing about the sky");
  // EXT-4b/4c — the new arms reach the WIRE tools too (the fold + the cheap round share this assembly, and the
  // structured schema is the same projection): the quest completion gesture is offered, and `journal[].type` is
  // marked required in the grammar even though the zod made it optional for the heal.
  const quest = folded?.terminalTools?.find((t) => t.name === "upsert_quest")?.parameters as { properties?: Record<string, unknown> };
  expect(quest.properties?.["completeObjectives"]).toBeDefined();
  const journal = folded?.terminalTools?.find((t) => t.name === "add_journal_entry")?.parameters as { required?: string[] };
  expect(journal.required).toEqual(expect.arrayContaining(["type", "content"]));
  // The registry channel stays empty — nothing here is executed or recursed on.
  expect(folded?.tools).toEqual([]);

  // R6/R2 — define a game tracker + a party tracker: the tool APPEARS, its key enum binds, and the party
  // description names the host's tracker by label AND gloss (the write surface is a per-game assembly).
  await rpgCompose.service.updateConfig({
    principal: hostPrincipal(hostId),
    chatId,
    patch: {
      trackers: [
        rpgTrackerDefSchema.parse({ key: "alarm", label: "Town alarm", shape: "meter", write: "set", subject: "game", max: 100 }),
        rpgTrackerDefSchema.parse({
          key: "grit",
          label: "Grit",
          shape: "meter",
          write: "delta",
          subject: "actor",
          appliesTo: "everyone",
          max: 10,
          hint: "resolve you spend to push through danger",
        }),
      ],
    },
  });
  const withTrackers = await rpgCompose.chatOps.gatherTurnContext({
    chatId,
    pendingUserText: undefined,
    respondsToLatestUserTurn: false,
    funderUserId: hostId,
  });
  const setTracker = withTrackers?.terminalTools?.find((t) => t.name === "set_tracker");
  expect((setTracker?.parameters as { properties?: { key?: { enum?: string[] } } })?.properties?.key?.enum).toEqual(["alarm"]);
  const partyTool = withTrackers?.terminalTools?.find((t) => t.name === "update_party");
  expect(partyTool?.description).toContain("Grit");
  expect(partyTool?.description).toContain("resolve you spend to push through danger");
  const partyArms = partyTool?.parameters as { properties?: { trackerDeltas?: { items?: { properties?: { key?: { enum?: string[] } } } } } };
  expect(partyArms.properties?.trackerDeltas?.items?.properties?.key?.enum).toEqual(["grit"]);
});

// F4 (`scripts/probes/openrouter/RESULTS.md`) — the folded turn's tools are the FIRST bytes of the character
// turn's cached prompt prefix, and the probe measured that ANY change to that payload drops `cached_tokens` to
// zero and re-bills the whole prefix (~10× that turn). So the fold's payload must not move when the SCENE
// moves; the DEDICATED round — the enforcing vehicle, whose own prefix re-renders the same refs every turn
// regardless — must keep the live enums. Both halves, on one game, driven through the real graph.
test("PROMPT-CACHE (probe F4): a gained actor + condition leave the FOLDED tools byte-identical; the ROUND keeps live enums", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "f4-cache-stability");
  const principal = hostPrincipal(hostId);
  const foldCompose = buildCannedRpg(app, db, "chat-completions", emptySpy());
  await foldCompose.service.createGame({ principal, chatId, mode: "lite" });
  await foldCompose.service.updateConfig({ principal, chatId, extractionMode: "folded" });

  // An opening beat ESTABLISHES the scene first: `establishScene` is deliberately still state-dependent (it is
  // the lever that makes a fresh game populate at all, and it settles once instead of churning per beat), so the
  // pin below is about the ONGOING-PLAY churn F4 named — a cast/condition change on an established scene.
  const open = await seedMessage(db, chatId, 1, { role: "assistant", content: "The rafters creak in the dark." });
  await foldCompose.chatOps.onTurnCompleted(
    chatId,
    open.messageId,
    open.variantId,
    TURN,
    foldedTurn([{ name: "update_scene", args: { location: "the rafters", timeOfDay: "night", presentUpsert: [{ name: "Kael" }], recentEvent: "they wait" } }]),
  );
  const before = await foldCompose.chatOps.gatherTurnContext({ chatId, pendingUserText: undefined, respondsToLatestUserTurn: false, funderUserId: hostId });

  // One beat of real play: an NPC walks on stage and someone takes a condition. This is EXACTLY the churn that
  // was re-billing the prefix — `actorRefs` gains Mira and `conditionNames` gains Bleeding.
  const slot = await seedMessage(db, chatId, 2, { role: "assistant", content: "Mira drops from the rafters; you take a cut." });
  await foldCompose.chatOps.onTurnCompleted(
    chatId,
    slot.messageId,
    slot.variantId,
    TURN,
    foldedTurn([
      { name: "update_scene", args: { presentUpsert: [{ name: "Mira", mood: "wary" }], recentEvent: "Mira dropped in" } },
      { name: "update_party", args: { targetRef: "player", addCondition: { name: "Bleeding" }, status: "bleeding" } },
    ]),
  );

  // The state genuinely moved (without this the byte-comparison below would be vacuous).
  const view = await foldCompose.service.getTrackerView({ principal, chatId });
  expect(view.actors.filter((a) => a.presence).map((a) => a.name)).toContain("Mira");

  const after = await foldCompose.chatOps.gatherTurnContext({ chatId, pendingUserText: undefined, respondsToLatestUserTurn: false, funderUserId: hostId });
  // The enumeration the enums used to carry is STILL delivered — in the depth-0 state block, BELOW the cache
  // breakpoint, where it costs nothing to change. That placement is what makes the schema drop honest.
  const stateBlock = after?.injections[0]?.content ?? "";
  expect(stateBlock).toContain("Mira");
  expect(stateBlock).toContain("Bleeding");
  // THE CACHE-KEY PROPERTY: the mounted payload is byte-identical across the two turns.
  expect(JSON.stringify(after?.terminalTools)).toEqual(JSON.stringify(before?.terminalTools));

  // THE ENFORCEMENT PROPERTY: the dedicated round, on this SAME state, still binds the live enums — the
  // vehicle whose backend actually grammar-enforces them loses nothing.
  const spy = emptySpy();
  const roundCompose = buildCannedRpgWithText({ app, db, api: "chat-completions", spy, cannedText: "{}", cannedToolCalls: [] });
  await roundCompose.service.updateConfig({ principal, chatId, extractionMode: "cheap" });
  const roundSlot = await seedMessage(db, chatId, 3, { role: "assistant", content: "She presses a hand to the wound." });
  await roundCompose.chatOps.onTurnCompleted(chatId, roundSlot.messageId, roundSlot.variantId, TURN, tc("chat-completions"));
  // @orb-waive no-test-fabrication({): baselined when the gate widened to value casts; burn-down item 906.
  const roundParty = spy.wireTools[0]?.find((t) => t.name === "update_party")?.parameters as {
    properties?: { targetRef?: { enum?: string[] }; removeCondition?: { enum?: string[] } };
  };
  expect(roundParty.properties?.targetRef?.enum).toContain("Mira");
  expect(roundParty.properties?.removeCondition?.enum).toEqual(["Bleeding"]);
});
