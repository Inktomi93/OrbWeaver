// COMPOSED-REAL: the server graph loads in the untimed IMPORT phase, never inside the first test's timeout (#2386 — support/node/composed-real.ts).
import "@orb/testkit/node/composed-real.ts";
// entry/compose/rpg — the folded turn (R1): its calls land state with no second model call, its trace and recorded tool calls, and the degrade matrix.

import type { RpgTraceEvent } from "@orb/contracts/rpg";
import { messageVariants } from "@orb/db";
import type { ChatId } from "@orb/kit/ids";
import { createRpgTraceRecorder } from "@orb/server/domain/rpg";
import { logger } from "@orb/server/foundation/observability";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { eq } from "drizzle-orm";
import { vi } from "vitest";
import { FROZEN_AT, seedMessage } from "../../domain/chat/_support.ts";
import {
  buildCannedRpg,
  buildCannedRpgWithText,
  CANNED_EXTRACTION,
  emptySpy,
  findSnapshotByVariant,
  findTurnToolCallsByVariant,
  foldedTurn,
  hostPrincipal,
  seedHostGameChat,
  TURN,
  tc,
} from "./_rpg-support.ts";

test("R1 composed-real: the character turn's own tool calls land state — and NO model call fires", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "r1-fold");
  const spy = emptySpy();
  const rpgCompose = buildCannedRpg(app, db, "chat-completions", spy);
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "folded" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "She fords the river as the rain starts." });

  await rpgCompose.chatOps.onTurnCompleted(
    chatId,
    messageId,
    variantId,
    TURN,
    foldedTurn([
      { name: "update_scene", args: { location: "the ford", weather: { type: "rain", label: "cold spitting rain" }, recentEvent: "forded the river" } },
      { name: "add_journal_entry", args: { type: "location", label: "", title: "The Ford", content: "They crossed at the ford in the rain." } },
    ]),
  );

  // THE R1 ASSERTION: zero requests on either executor arm. The state came from the narrative call.
  expect(spy.summarizeModels).toEqual([]);
  expect(spy.chatTurns).toEqual([]);
  // The state landed through the SAME fold + accumulator + flush the dedicated round uses.
  const view = await rpgCompose.service.getTrackerView({ principal: hostPrincipal(hostId), chatId });
  expect(view.ambient?.location).toBe("the ford");
  // The folded tool round wrote the closed type + the model's flavor label (the weather enum on the wire).
  expect(view.ambient?.weather).toEqual({ type: "rain", label: "cold spitting rain" });
  expect(view.recentBeats).toContain("forded the river");
  const journal = await rpgCompose.service.listJournal({ principal: hostPrincipal(hostId), chatId, limit: 50 });
  expect(journal.map((j) => j.title)).toContain("The Ford");
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// R-OBS — the rpg FLIGHT RECORDER, composed-real. `RPG_TRACE` was scaffolding only (dogfood-tracking
// RPG-TRACE-DEAD: env declared, route skipped, inspector never implemented). These drive a real folded turn
// through the real compose graph with a real recorder wired and assert the ring holds what a host would need:
// what the turn MOUNTED, what the model CALLED (args verbatim + the schema's verdict), which delivery PATH the
// flush took, and what it ANNOUNCED — all joinable on one `turnId`, which is the query key the route exposes.
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test("R-OBS composed-real: a folded turn records its mount, its calls, its flush path and its bus emits", async ({ app, db }) => {
  const recorder = createRpgTraceRecorder({ now: () => FROZEN_AT });
  const { chatId, hostId } = await seedHostGameChat(db, "robs-fold");
  const rpgCompose = buildCannedRpgWithText({
    app,
    db,
    api: "chat-completions",
    spy: emptySpy(),
    cannedText: JSON.stringify(CANNED_EXTRACTION),
    trace: recorder.sink,
  });
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "folded" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "She fords the river." });

  // The MOUNT half runs at GATHER — the same entry point the engine drives to attach the terminal tools.
  await rpgCompose.chatOps.gatherTurnContext({ chatId, pendingUserText: undefined, respondsToLatestUserTurn: false, funderUserId: hostId });
  await rpgCompose.chatOps.onTurnCompleted(
    chatId,
    messageId,
    variantId,
    TURN,
    foldedTurn([
      { name: "update_scene", args: { location: "the ford", recentEvent: "forded the river" } },
      // Valid JSON, INVALID against its own schema: the drop class this recorder was re-lit for
      // (SCENE-DROPPED cost a live session hours because the trail carried names without reasons).
      { name: "upsert_quest", args: { name: 42 } },
    ]),
  );

  const events = recorder.recent({ chatId }).map((record) => record.event);

  // 1. WHAT THE TURN COULD WRITE.
  const mount = events.find((event): event is Extract<RpgTraceEvent, { phase: "mount" }> => event.phase === "mount");
  expect(mount?.toolNames).toContain("update_scene");

  // 2. WHAT THE MODEL CALLED — args VERBATIM, and the per-call verdict beside them.
  const tool = events.find((event): event is Extract<RpgTraceEvent, { phase: "tool" }> => event.phase === "tool");
  expect(tool?.vehicle).toBe("folded extraction");
  expect(tool?.turnId).toBe(TURN);
  expect(tool?.calls.map((call) => [call.name, call.verdict])).toEqual([
    ["update_scene", "applied"],
    ["upsert_quest", "dropped"],
  ]);
  // The raw string the model sent survives — a parsed-only capture erases exactly the failing case.
  expect(tool?.calls[1]?.args).toBe(JSON.stringify({ name: 42 }));
  expect(tool?.calls[1]?.issues.join(" ")).toContain("name");

  // 3. WHICH VEHICLE ACTUALLY RAN (a `folded` game silently paying for a second call is the R1 failure).
  const flush = events.find((event): event is Extract<RpgTraceEvent, { phase: "flush" }> => event.phase === "flush");
  expect(flush).toMatchObject({ turnId: TURN, path: "folded", fallbackReason: null });

  // 3b. THAT THE WRITE BOUNDARY CLOSED (#1493). The `flush` event above is a DISPATCH receipt — it exists as
  // soon as the vehicle is chosen — so it is not the observable a reader (or an e2e barrier) may treat as
  // "the extraction is over". `flushed` is, and it must come AFTER the dispatch receipt in the ring.
  const flushed = events.find((event): event is Extract<RpgTraceEvent, { phase: "flushed" }> => event.phase === "flushed");
  expect(flushed).toMatchObject({ turnId: TURN, outcome: "wrote", droppedReason: null });
  const phases = events.map((event) => event.phase);
  expect(phases.indexOf("flushed")).toBeGreaterThan(phases.indexOf("flush"));

  // 4. WHAT REACHED THE PANEL.
  expect(events.filter((event) => event.phase === "bus").length).toBeGreaterThan(0);

  // …and the whole turn is joinable on ONE key — the route's `?turnId=` filter. The mount has none (it runs
  // before the turn resolves one), so it is correctly EXCLUDED rather than silently matched.
  const byTurn = recorder.recent({ turnId: TURN }).map((record) => record.event.phase);
  expect(byTurn).toContain("tool");
  expect(byTurn).toContain("flush");
  expect(byTurn).toContain("flushed");
  expect(byTurn).not.toContain("mount");
});

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// #1468 item 2 — A STATE ROUND THAT COULD NOT RUN IS NOT A QUIET BEAT. Both vehicles return the empty delta on
// a provider throw (errors-as-data: a broken round must never corrupt canon), and both used to return it BARE —
// byte-identical to the beat that legitimately changed nothing. The flush then settled `no-writes` and recorded
// no disclosure at all, so the committed narrative carried an invisible missing state update whose only trace
// was a transient warn line. These drive the REAL compose round with a provider that rejects and assert the
// settle the trace ring publishes (`flushed` — the event a barrier and the debug route both read).
// ══════════════════════════════════════════════════════════════════════════════════════════════════

/** The `flushed` settle event this turn published, or `undefined`. */
function flushedEvent(recorder: ReturnType<typeof createRpgTraceRecorder>, chatId: ChatId): Extract<RpgTraceEvent, { phase: "flushed" }> | undefined {
  return recorder
    .recent({ chatId })
    .map((record) => record.event)
    .find((event): event is Extract<RpgTraceEvent, { phase: "flushed" }> => event.phase === "flushed");
}

test("#1468: a CHEAP TOOL ROUND the provider refused settles `failed` with the reason, never the quiet beat's `no-writes`", async ({ app, db }) => {
  const recorder = createRpgTraceRecorder({ now: () => FROZEN_AT });
  const { chatId, hostId } = await seedHostGameChat(db, "roundfail-cheap");
  const rpgCompose = buildCannedRpgWithText({
    app,
    db,
    api: "chat-completions",
    spy: emptySpy(),
    cannedText: "{}",
    // The live shape: the wire took the request and refused it (a 502, a context overflow, a dead engine).
    chatThrows: new Error("upstream 502 from the state-round wire"),
    trace: recorder.sink,
  });
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "They cross the ford." });

  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, tc("chat-completions"));

  const flushed = flushedEvent(recorder, chatId);
  expect(flushed?.outcome).toBe("failed");
  // The provider's OWN sentence rides out, so the failure is root-causable from the turn rather than from a
  // log line that has already rolled over.
  expect(flushed?.droppedReason).toContain("upstream 502 from the state-round wire");
  // ERRORS-AS-DATA IS UNCHANGED: canon stays untouched — the fix is about what the turn SAYS, never about
  // letting a broken round write.
  expect(await findSnapshotByVariant(db, variantId)).toBeUndefined();

  // AND IT IS DURABLE. The settle above is a log + an in-memory ring, both of which roll over; the record is
  // what the person who played the turn can still read tomorrow. An EMPTY call list beside the reason — never
  // a synthesized call, because the model made none.
  const [record] = await findTurnToolCallsByVariant(db, variantId);
  expect(record?.calls).toEqual([]);
  expect(record?.failure).toContain("upstream 502 from the state-round wire");
});

test("#1468: the AGENT-SDK degrade (structured extraction) carries the same failure arm — it is not the tool round's optional half", async ({ app, db }) => {
  const recorder = createRpgTraceRecorder({ now: () => FROZEN_AT });
  const { chatId, hostId } = await seedHostGameChat(db, "roundfail-sdk");
  // An agent-sdk wire carries no `tools[]`, so `runToolRound` degrades INSIDE itself to one structured call —
  // a whole class of connection whose failure arm lives in the OTHER catch.
  const rpgCompose = buildCannedRpgWithText({
    app,
    db,
    api: "agent-sdk",
    spy: emptySpy(),
    cannedText: "{}",
    structuredThrows: new Error("agent-sdk transport closed"),
    trace: recorder.sink,
  });
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "They cross the ford." });

  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, tc("agent-sdk"));

  const flushed = flushedEvent(recorder, chatId);
  expect(flushed?.outcome).toBe("failed");
  expect(flushed?.droppedReason).toContain("agent-sdk transport closed");
  expect(await findSnapshotByVariant(db, variantId)).toBeUndefined();
});

test("TOOLCALLS arm A: a folded turn RECORDS what it called, keyed to the producing variant", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "toolcalls-record");
  const rpgCompose = buildCannedRpg(app, db, "chat-completions", emptySpy());
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "folded" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "She fords the river." });

  await rpgCompose.chatOps.onTurnCompleted(
    chatId,
    messageId,
    variantId,
    TURN,
    foldedTurn([
      { name: "update_scene", args: { location: "the ford", recentEvent: "forded the river" } },
      // Valid JSON, INVALID against its own schema — the SCENE-DROPPED class. This is the call the user most
      // needs to see, and the reason a record gated on a successful write would be useless.
      { name: "upsert_quest", args: { name: 42 } },
    ]),
  );

  const recorded = await rpgCompose.service.listTurnToolCalls({ principal: hostPrincipal(hostId), chatId });
  expect(recorded).toHaveLength(1);
  expect(recorded[0]?.variantId).toBe(variantId);
  expect(recorded[0]?.messageId).toBe(messageId);
  expect(recorded[0]?.calls.map((c) => [c.name, c.verdict])).toEqual([
    ["update_scene", "applied"],
    ["upsert_quest", "dropped"],
  ]);
  // The args ride VERBATIM — the failing payload is the evidence, and a parsed-only record would erase it.
  expect(recorded[0]?.calls[1]?.args).toBe(JSON.stringify({ name: 42 }));
  expect(recorded[0]?.calls[1]?.issues.join(" ")).toContain("name");
});

test("TOOLCALLS arm A: a turn whose calls ALL dropped still records — that is the turn worth seeing", async ({ app, db }) => {
  // The record is written BEFORE the staged-nothing return: this turn writes NO snapshot (nothing parsed),
  // and a record gated on a successful flush would show the user nothing at all on precisely the turn where
  // they are asking "why did nothing happen?".
  const { chatId, hostId } = await seedHostGameChat(db, "toolcalls-all-dropped");
  const rpgCompose = buildCannedRpg(app, db, "chat-completions", emptySpy());
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "folded" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "The prose is fine." });

  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, {
    ...tc("chat-completions"),
    terminalToolCalls: [{ toolCallId: "c1", name: "upsert_quest", arguments: JSON.stringify({ name: 42 }) }],
  });

  const recorded = await rpgCompose.service.listTurnToolCalls({ principal: hostPrincipal(hostId), chatId });
  expect(recorded[0]?.calls.map((c) => c.verdict)).toEqual(["dropped"]);
});

test("TOOLCALLS arm A: a QUIET beat records nothing (no empty disclosure on every silent turn)", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "toolcalls-quiet");
  const rpgCompose = buildCannedRpg(app, db, "chat-completions", emptySpy());
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "folded" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "They walk on." });

  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, foldedTurn([]));

  expect(await rpgCompose.service.listTurnToolCalls({ principal: hostPrincipal(hostId), chatId })).toEqual([]);
});

test("TOOLCALLS arm A: a NON-folded (cheap) turn records the round that changed its state", async ({ app, db }) => {
  // A dedicated post-commit round makes its OWN model call, but its calls are still the only durable answer to
  // what changed this visible turn's RPG state after the trace ring rolls over.
  const { chatId, hostId } = await seedHostGameChat(db, "toolcalls-cheap");
  const rpgCompose = buildCannedRpgWithText({
    app,
    db,
    api: "chat-completions",
    spy: emptySpy(),
    cannedText: "{}",
    cannedToolCalls: [{ name: "update_scene", arguments: JSON.stringify({ location: "the tower" }) }],
  });
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "They arrive." });

  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, tc("chat-completions"));

  // The state and its producing call land on the same visible variant.
  const view = await rpgCompose.service.getTrackerView({ principal: hostPrincipal(hostId), chatId });
  expect(view.ambient?.location).toBe("the tower");
  const recorded = await rpgCompose.service.listTurnToolCalls({ principal: hostPrincipal(hostId), chatId });
  expect(recorded).toHaveLength(1);
  expect(recorded[0]).toMatchObject({ messageId, variantId });
  expect(recorded[0]?.calls.map((call) => [call.name, call.verdict])).toEqual([["update_scene", "applied"]]);
});

test("R-OBS: an UNTRACED game is byte-identical — the same turn lands the same state with no sink wired", async ({ app, db }) => {
  // The zero-cost claim, asserted rather than asserted-in-a-comment: the emit sites are `deps.trace?.(…)`, so
  // with no recorder the event objects are never even constructed and the turn behaves exactly as before.
  const { chatId, hostId } = await seedHostGameChat(db, "robs-untraced");
  const spy = emptySpy();
  const rpgCompose = buildCannedRpg(app, db, "chat-completions", spy);
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "folded" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "She fords the river." });

  await rpgCompose.chatOps.onTurnCompleted(
    chatId,
    messageId,
    variantId,
    TURN,
    foldedTurn([{ name: "update_scene", args: { location: "the ford", recentEvent: "forded the river" } }]),
  );

  expect(spy.chatTurns).toEqual([]);
  const view = await rpgCompose.service.getTrackerView({ principal: hostPrincipal(hostId), chatId });
  expect(view.ambient?.location).toBe("the ford");
});

test("R1 composed-real: the same calls, folded vs a tool ROUND, produce the SAME state", async ({ app, db }) => {
  // The shared-plane proof for the new vehicle: change only the DELIVERY and the durable outcome is identical.
  const calls = [{ name: "update_scene", args: { location: "the obsidian tower", recentEvent: "arrived at the tower" } }];

  const folded = await seedHostGameChat(db, "r1-parity-fold");
  const foldCompose = buildCannedRpg(app, db, "chat-completions", emptySpy());
  await foldCompose.service.createGame({ principal: hostPrincipal(folded.hostId), chatId: folded.chatId, mode: "lite" });
  await foldCompose.service.updateConfig({ principal: hostPrincipal(folded.hostId), chatId: folded.chatId, extractionMode: "folded" });
  const foldSlot = await seedMessage(db, folded.chatId, 1, { role: "assistant", content: "They arrive." });
  await foldCompose.chatOps.onTurnCompleted(folded.chatId, foldSlot.messageId, foldSlot.variantId, TURN, foldedTurn(calls));

  // The DEDICATED round over the same planes (answered with the identical calls, one beat later).
  const round = await seedHostGameChat(db, "r1-parity-round");
  const roundCompose = buildCannedRpgWithText({
    app,
    db,
    api: "chat-completions",
    spy: emptySpy(),
    cannedText: "{}",
    cannedToolCalls: calls.map((c) => ({ name: c.name, arguments: JSON.stringify(c.args) })),
  });
  await roundCompose.service.createGame({ principal: hostPrincipal(round.hostId), chatId: round.chatId, mode: "lite" });
  await roundCompose.service.updateConfig({ principal: hostPrincipal(round.hostId), chatId: round.chatId, extractionMode: "cheap" });
  const roundSlot = await seedMessage(db, round.chatId, 1, { role: "assistant", content: "They arrive." });
  await roundCompose.chatOps.onTurnCompleted(round.chatId, roundSlot.messageId, roundSlot.variantId, TURN, tc("chat-completions"));

  const foldView = await foldCompose.service.getTrackerView({ principal: hostPrincipal(folded.hostId), chatId: folded.chatId });
  const roundView = await roundCompose.service.getTrackerView({ principal: hostPrincipal(round.hostId), chatId: round.chatId });
  expect(foldView.ambient?.location).toBe(roundView.ambient?.location);
  expect(foldView.recentBeats).toEqual(roundView.recentBeats);
});

test("R1 degrade: a MALFORMED tool arg is dropped + logged; the rest of the turn's state still lands", async ({ app, db }) => {
  const warnSpy = vi.spyOn(logger, "warn");
  const { chatId, hostId } = await seedHostGameChat(db, "r1-malformed");
  const spy = emptySpy();
  const rpgCompose = buildCannedRpg(app, db, "chat-completions", spy);
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "folded" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "The prose is fine." });

  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, {
    ...tc("chat-completions"),
    terminalToolCalls: [
      // Not JSON at all — the class that would throw if the fold parsed naively.
      { toolCallId: "c1", name: "update_party", arguments: "{oops" },
      // Valid JSON, invalid against its own arg schema.
      { toolCallId: "c2", name: "upsert_quest", arguments: JSON.stringify({ name: 42 }) },
      { toolCallId: "c3", name: "update_scene", arguments: JSON.stringify({ location: "the ford" }) },
    ],
  });

  // The turn did not fail (we are here), no model call was made to recover, and the GOOD call still applied.
  expect(spy.summarizeModels).toEqual([]);
  const view = await rpgCompose.service.getTrackerView({ principal: hostPrincipal(hostId), chatId });
  expect(view.ambient?.location).toBe("the ford");
  // The narrative is untouched — the flush never edits the committed variant, only the snapshot beside it.
  const rows = await db.select({ content: messageVariants.content }).from(messageVariants).where(eq(messageVariants.id, variantId));
  expect(rows[0]?.content).toBe("The prose is fine.");
  // The loss is NAMED (D109-7 totality) — both bad calls, by tool name.
  // @orb-waive no-test-fabrication({ event?: string }): baselined when the gate widened to value casts; burn-down item 906.
  const line = warnSpy.mock.calls.find((c) => (c[0] as { event?: string }).event === "rpg.extraction.unparseable");
  // @orb-waive no-test-fabrication({ droppedTools?: string[] }): baselined when the gate widened to value casts; burn-down item 906.
  expect((line?.[0] as { droppedTools?: string[] }).droppedTools).toEqual(["update_party", "upsert_quest"]);
});

// D112 (3) — THE SILENT FORK, closed. `z.object` is STRIP mode, so a call carrying a key the arg schema never
// declared PARSED CLEAN with that key (and its write) silently deleted: not a `malformedToolCalls` drop (the
// call succeeded), not a salvage drop (the entry conformed), not `rpg.extraction.empty` (the other writes
// landed). The measured shape is a model reaching for the tool-arg vocabulary of a DIFFERENT plane —
// `update_party {targetRef, mana:-3}` where a `trackerDeltas` entry belonged. Before this test, that beat's
// resource spend vanished into a SUCCESS record with nothing anywhere saying so.
test("D112 (3): an INVENTED key on an otherwise-valid folded call is NAMED, never silently stripped", async ({ app, db }) => {
  const warnSpy = vi.spyOn(logger, "warn");
  const { chatId, hostId } = await seedHostGameChat(db, "r1-stripped");
  const spy = emptySpy();
  const rpgCompose = buildCannedRpg(app, db, "chat-completions", spy);
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "folded" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "He spends himself holding the line." });

  await rpgCompose.chatOps.onTurnCompleted(
    chatId,
    messageId,
    variantId,
    TURN,
    foldedTurn([
      // Top-level invented key (the wrong plane's vocabulary) beside a field that IS declared.
      { name: "update_party", args: { targetRef: "player", status: "wounded", mana: -3 } },
      // NESTED invented key, inside an array item — the depth the projection pin also covers.
      { name: "update_scene", args: { location: "the ford", presentUpsert: [{ name: "Kael", vibe: "grim" }] } },
    ]),
  );

  // The declared writes still applied — strictness would have cost the whole call (EXT-4a: drop as little as
  // possible), so detection is the closing arm, not rejection.
  const view = await rpgCompose.service.getTrackerView({ principal: hostPrincipal(hostId), chatId });
  expect(view.ambient?.location).toBe("the ford");
  expect(view.actors.map((a) => a.volatile?.status ?? null)).toContain("wounded");
  // …and the vanished writes are NAMED, with the path that says which key on which tool.
  // @orb-waive no-test-fabrication({ event?: string }): baselined when the gate widened to value casts; burn-down item 906.
  const line = warnSpy.mock.calls.find((c) => (c[0] as { event?: string }).event === "rpg.extraction.stripped");
  expect(line).toBeDefined();
  // @orb-waive no-test-fabrication({ strippedKeys?: string[] }): baselined when the gate widened to value casts; burn-down item 906.
  expect((line?.[0] as { strippedKeys?: string[] }).strippedKeys).toEqual(["update_party.mana", "update_scene.presentUpsert.0.vibe"]);
  // A strip is NOT a drop: nothing was thrown away whole, so the drop channel must stay silent about it.
  // @orb-waive no-test-fabrication({ event?: string }): baselined when the gate widened to value casts; burn-down item 906.
  expect(warnSpy.mock.calls.some((c) => (c[0] as { event?: string }).event === "rpg.extraction.unparseable")).toBe(false);
});

test("D112 (3): the STRUCTURED arm names the same strips — incl. a whole plane sent under an undeclared root key", async ({ app, db }) => {
  const warnSpy = vi.spyOn(logger, "warn");
  const { chatId, hostId } = await seedHostGameChat(db, "structured-stripped");
  const rpgCompose = buildCannedRpgWithText({
    app,
    db,
    api: "agent-sdk",
    spy: emptySpy(),
    cannedText: JSON.stringify({
      party: [{ targetRef: "player", status: "wounded", mana: -3 }],
      scene: { location: "the ford" },
      // A whole plane emitted under a key that names nothing — the most invisible shape, since the per-plane
      // walk never looks at it. It must still be reported, or the turn reads as a quiet beat.
      trackerDeltas: [{ key: "hp", delta: -2 }],
    }),
  });
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "He holds the line." });
  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, tc("agent-sdk"));

  const view = await rpgCompose.service.getTrackerView({ principal: hostPrincipal(hostId), chatId });
  expect(view.ambient?.location).toBe("the ford"); // the conforming writes landed
  // @orb-waive no-test-fabrication({ event?: string }): baselined when the gate widened to value casts; burn-down item 906.
  const line = warnSpy.mock.calls.find((c) => (c[0] as { event?: string }).event === "rpg.extraction.stripped");
  expect(line).toBeDefined();
  // @orb-waive no-test-fabrication({ strippedKeys?: string[] }): baselined when the gate widened to value casts; burn-down item 906.
  expect((line?.[0] as { strippedKeys?: string[] }).strippedKeys).toEqual(["trackerDeltas", "party.0.mana"]);
});

test("R1 degrade: ZERO terminal tool calls trigger the required fallback round instead of silently losing state", async ({ app, db }) => {
  const warnSpy = vi.spyOn(logger, "warn");
  const { chatId, hostId } = await seedHostGameChat(db, "r1-quiet");
  const spy = emptySpy();
  const rpgCompose = buildCannedRpg(app, db, "chat-completions", spy);
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "folded" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "They talk about the weather." });

  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, foldedTurn([]));

  expect(spy.summarizeModels).toEqual([]);
  expect(spy.chatTurns).toHaveLength(1); // no terminal call is ambiguous, so the required round gets one chance
  // @orb-waive no-test-fabrication({ event?: string }): baselined when the gate widened to value casts; burn-down item 906.
  const path = warnSpy.mock.calls.find((c) => (c[0] as { event?: string }).event === "rpg.extraction.path");
  expect(path?.[0]).toMatchObject({ mode: "folded", path: "tool-round", fallbackReason: "no-terminal-calls" });
  // The fallback produced nothing: name the empty extraction, but never misreport it as a parse failure.
  // @orb-waive no-test-fabrication({ event?: string }): baselined when the gate widened to value casts; burn-down item 906.
  expect(warnSpy.mock.calls.some((c) => (c[0] as { event?: string }).event === "rpg.extraction.unparseable")).toBe(false);
  // @orb-waive no-test-fabrication({ event?: string }): baselined when the gate widened to value casts; burn-down item 906.
  expect(warnSpy.mock.calls.some((c) => (c[0] as { event?: string }).event === "rpg.extraction.empty")).toBe(true);
});

test("R1 degrade: a GHOST actor in a folded call is dropped (no cast mint) + logged, like the round's", async ({ app, db }) => {
  const warnSpy = vi.spyOn(logger, "warn");
  const { chatId, hostId } = await seedHostGameChat(db, "r1-ghost");
  const rpgCompose = buildCannedRpg(app, db, "chat-completions", emptySpy());
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await rpgCompose.service.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "folded" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "A stranger appears." });

  await rpgCompose.chatOps.onTurnCompleted(
    chatId,
    messageId,
    variantId,
    TURN,
    foldedTurn([{ name: "update_party", args: { targetRef: "Zzyzx the Unknown", status: "cursed" } }]),
  );

  // @orb-waive no-test-fabrication({ event?: string }): baselined when the gate widened to value casts; burn-down item 906.
  const line = warnSpy.mock.calls.find((c) => (c[0] as { event?: string }).event === "rpg.extraction.phantom");
  // @orb-waive no-test-fabrication({ phantomTargets?: string[] }): baselined when the gate widened to value casts; burn-down item 906.
  expect((line?.[0] as { phantomTargets?: string[] }).phantomTargets).toContain("Zzyzx the Unknown");
  const view = await rpgCompose.service.getTrackerView({ principal: hostPrincipal(hostId), chatId });
  expect(view.actors.some((a) => a.actorRef.kind === "npc")).toBe(false);
});
