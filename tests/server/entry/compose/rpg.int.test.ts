// entry/compose/rpg — the lite-rpg vertical, COMPOSED-REAL (rpg-design/05 §6.2). The [compose-stub-goes-stale]/
// [ct-stub-lie] antidote: drive the domain end-to-end through the ACTUAL `buildRpg` wiring — the real
// `RpgService` over the real db, the real staging accumulator, the real `ChatRpgOps` flush, the REAL chat-side
// injected ops (setRpgPointer/resolveRpgRoster/getMembership) off `createServices`, and the REAL tool registry
// rpg registered its 7 state tools into. Two turns are proven:
//
//   • CHEAP tool turn — createGame (real, writes the game row + the opaque pointer through chat's real
//     setRpgPointer) → execute the REAL registered `update_scene` tool via the ONE tool-use registry (stages) →
//     `onTurnCompleted` flush (the real chatOps) → the snapshot lands on the committed variant + the pointer is
//     projected on ChatDetail + the bus emits fire through the REAL `publishRpgEvent` singleton.
//   • RELIABLE extraction turn — a `buildRpg` over the real graph's chat ops + db but a FAKE executor.summarize
//     returning a CANNED structured extraction (NEVER a live model — memory: never-run-engine-launcher-live):
//     the real `runExtraction` impl parses it, folds it to a delta, stages + flushes it. State lands through the
//     real fold + accumulator + flush path.

import type { ChatApi } from "@orb/contracts/connection";
import type { Principal } from "@orb/contracts/identity";
import type { SummarizeResult } from "@orb/contracts/providers";
import type { RpgBusEvent, RpgExtraction, RpgSnapshotState } from "@orb/contracts/rpg";
import type { Db } from "@orb/db";
import type { ChatId, ChatTurnId, ModelId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { AgentModelHealError, ConnectionRoutingError } from "@orb/server/domain/connection";
import type { ServicesResult } from "@orb/server/entry/compose";
import { logger } from "@orb/server/foundation/observability";
import type { ChatResult } from "@orb/server/infra/providers";
import { vi } from "vitest";
import type { RpgTurnConnection } from "../../../../packages/server/src/domain/chat/index.ts";
import { subscribeRpgEvents } from "../../../../packages/server/src/domain/rpg/index.ts";
import { commitSnapshotForVariant, writeStagedSnapshot } from "../../../../packages/server/src/domain/rpg/persistence/snapshots.ts";
import { buildRpg } from "../../../../packages/server/src/entry/compose/rpg.ts";
import { makeModelCapability, makeResolvedConnection, makeResolvedCredential } from "../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { FROZEN_AT, seedCharacter, seedChat, seedMessage, seedParticipant, seedUser } from "../../domain/chat/_support.ts";

const TURN: ChatTurnId = castId<ChatTurnId>("chat_turn_compose_1");

/** The character turn's resolved connection + consent verdict the flush threads into the state round (F1). The
 *  `api` selects the round's routed arm (agent-sdk → the structured CHAT path; else the `structured` dispatcher);
 *  the model is "fake-chat-model" so the spy's model assertions still match. Writer-capable (structured + tools)
 *  + consent ON so the flush's F2 gate passes and the round runs. `over` pins the F1 consent/source cases. */
function tc(api: ChatApi, over: Partial<RpgTurnConnection> = {}): RpgTurnConnection {
  return {
    connection: makeResolvedConnection({
      api,
      model: castId<ModelId>("fake-chat-model"),
      capability: makeModelCapability({ output: { maxTokens: { min: 1, max: 4096 }, structured: true }, tools: { parallel: true } }),
    }),
    ownerConsented: true,
    ...over,
  };
}

function hostPrincipal(userId: UserId): Principal {
  return { userId, role: "user", handle: castId("host"), externalId: null, via: "header" };
}

/** Seed a real chat with a host participant — the membership rpg's createGame gates on (through the REAL
 *  injected getMembership off createServices). Returns the chat + host ids. */
async function seedHostGameChat(db: Db, key: string): Promise<{ chatId: ChatId; hostId: UserId }> {
  const hostId = await seedUser(db, `rpghost_${key}`);
  const chatId = await seedChat(db, key);
  await seedParticipant(db, { chatId, key: `${key}_host`, userId: hostId, role: "host", joinSeq: 0 });
  return { chatId, hostId };
}

/** Collect rpg-bus events off the REAL singleton for a chat, until `signal` aborts. */
function collectBus(chatId: ChatId, signal: AbortSignal): RpgBusEvent[] {
  const seen: RpgBusEvent[] = [];
  void (async (): Promise<void> => {
    try {
      for await (const event of subscribeRpgEvents(chatId, signal)) {
        seen.push(event);
      }
    } catch {
      // abort tears the iterator down — expected at test end.
    }
  })();
  return seen;
}

// 20s: the composed-real graph (full createServices) + a real tool turn is heavy under parallel load.
test("CHEAP turn — createGame + a real tool turn flush lands state + the pointer + bus emits (composed-real)", { timeout: 20_000 }, async ({
  app,
  services,
  db,
}) => {
  const { chatId, hostId } = await seedHostGameChat(db, "cheap");
  const bus = new AbortController();
  const events = collectBus(chatId, bus.signal);

  // createGame through the REAL service — writes the game row AND the opaque pointer via chat's real setRpgPointer.
  const created = await services.rpg.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  await services.rpg.updateConfig({ principal: hostPrincipal(hostId), chatId, extractionMode: "cheap" });

  // The pointer is projected onto ChatDetail (the client's takeover gate reads it off data it already holds).
  const detail = await services.chat.getChat({ principal: hostPrincipal(hostId), chatId });
  expect(detail.rpg).toEqual({ gameId: created.gameId, engaged: true }); // born engaged (#40)

  // A committed assistant slot the flush keys the snapshot to.
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "They enter the cave." });

  // Execute the REAL registered `update_scene` tool through the ONE tool-use registry (stages into the real
  // accumulator) — proving the compose tool-registration is LIVE (not a stub of it).
  const set = app.toolUse.resolveTools(["update_scene"]);
  const records = await app.toolUse.executeToolCalls(
    set,
    [{ toolCallId: "call_1", name: "update_scene", arguments: JSON.stringify({ location: "the cave mouth", recentEvent: "entered the cave" }) }],
    { principal: hostPrincipal(hostId), triggeredBy: hostId, chatId, turnId: TURN, roster: null },
  );
  expect(records[0]?.isError).toBe(false); // the real handler staged the scene write (errors-as-data would set true)

  // Flush the turn through the REAL chatOps — the staged write becomes the committed variant's snapshot. The
  // turn connection is a cheap-WRITER (so the F2 readonly gate passes); the dedicated tool round then fires
  // against the real (credential-less, vllm-disabled) executor, throws, is caught (errors-as-data → empty
  // delta), and the pre-staged `update_scene` write is what flushes — proving the registry+flush seam is live.
  await app.rpgChatOps.onTurnCompleted(chatId, messageId, variantId, TURN, tc("chat-completions"));

  // State landed — read it back through the REAL tracker view (roster ∪ sheets, resolved-current snapshot).
  const view = await services.rpg.getTrackerView({ principal: hostPrincipal(hostId), chatId });
  expect(view.ambient?.location).toBe("the cave mouth");
  expect(view.recentBeats).toContain("entered the cave");

  // The §4.9 emits fired through the REAL bus singleton: gameChanged (create + config) then snapshotPatched.
  await Promise.resolve(); // let the microtask-queued bus fan-out settle
  bus.abort();
  expect(events.some((e) => e.type === "gameChanged")).toBe(true);
  expect(events.some((e) => e.type === "snapshotPatched")).toBe(true);
});

/** A canned reliable extraction (the model's structured output) — a location move + a journal beat. Emitted as
 *  JSON text the real `runExtraction` parses through `rpgExtractionSchema`. */
const CANNED_EXTRACTION = {
  party: [],
  inventory: [],
  scene: { location: "the obsidian tower", recentEvent: "arrived at the tower" },
  widgets: [],
  quests: [],
  journal: [{ type: "location", title: "Arrival", content: "They reached the tower." }],
} satisfies RpgExtraction;

/** The route the fake host connection resolves to, and which executor method actually fired. The reliable
 *  extraction routes BY api: `agent-sdk` → `executor.runChatTurn` (structured-output chat path, no
 *  summarize); every other api → `executor.summarize`. Both emit the CANNED extraction JSON, so both arms
 *  MUST land identical state — proving the branch, not two behaviors. */
interface ExtractionSpy {
  readonly summarizeModels: string[];
  readonly chatTurns: { model: string; hasResponseFormat: boolean; hasToolServer: boolean; ownerConsented: boolean }[];
  /** The response-format SCHEMA the impl put on the wire per call — so a test can assert the R1 ref enum
   *  (`constrainExtractionSchema`) reached the request, on either arm. */
  readonly schemas: Record<string, unknown>[];
  /** The system prompts the impl sent — so a test can assert the R1 ref enumeration (the fallback arm). */
  readonly systemPrompts: string[];
}

/** Build an rpg seam over the REAL chat wiring (off `app.chatRpgOps`) + real db, with a FAKE executor/connection
 *  (never a live model). This exercises the ACTUAL `buildRpg` + `runExtraction` impl, only faking the model.
 *  The resolved connection carries a structured-output capability so the honest-arms verdict isn't readonly.
 *  `api` selects the routed arm; the spy records which executor method fired. */
function buildReliableRpg(app: ServicesResult, db: Db, api: ChatApi, spy: ExtractionSpy): ReturnType<typeof buildRpg> {
  return buildReliableRpgWithText({ app, db, api, spy, cannedText: JSON.stringify(CANNED_EXTRACTION) });
}

// The same harness with a caller-supplied extraction reply text — the R3 pins drive an EMPTY / a
// phantom-target extraction through the real fold to prove the visibility logs fire.
function buildReliableRpgWithText(args: {
  readonly app: ServicesResult;
  readonly db: Db;
  readonly api: ChatApi;
  readonly spy: ExtractionSpy;
  readonly cannedText: string;
}): ReturnType<typeof buildRpg> {
  const { app, db, api, spy, cannedText } = args;
  return buildRpg({
    db,
    now: () => FROZEN_AT,
    rpgChatOps: app.chatRpgOps,
    connection: {
      // The READ-side `trackersReadOnly` pill resolves the ROOM connection via `resolveChat` (the F1 seam — the
      // per-chat-routing verb, not the host's global `resolveRole` default). The state ROUNDS re-resolve NOTHING;
      // they ride the `turnConnection` handed to `onTurnCompleted` below.
      resolveChat: () =>
        Promise.resolve(
          makeResolvedConnection({
            api,
            model: castId<ModelId>("fake-chat-model"),
            capability: makeModelCapability({ output: { maxTokens: { min: 1, max: 4096 }, structured: true } }),
          }),
        ),
      getOrSkinTierModels: () => Promise.resolve({ opus: "o", sonnet: "s", haiku: "h" }),
    },
    executor: {
      // The array/vLLM extraction arm now rides the `structured` role (owner ruling 2026-07-27 — split from
      // summarize). The spy records the model + the constrained schema + the prompt.
      structured: (req): Promise<SummarizeResult> => {
        spy.summarizeModels.push(req.model);
        spy.schemas.push(req.responseFormat.schema);
        spy.systemPrompts.push(req.inputs[0]?.systemPrompt ?? "");
        return Promise.resolve({
          items: [{ text: cannedText, usage: { tokensIn: null, tokensOut: null, costUsd: null } }],
          model: "fake-chat-model",
        } satisfies SummarizeResult);
      },
      // The structured chat arm: the reducer replies with the compact extraction JSON. The spy records that
      // the request carried a responseFormat and NO tool server (extraction is a read-only structured emission).
      runChatTurn: (req) => {
        spy.chatTurns.push({
          model: req.model,
          hasResponseFormat: req.responseFormat !== undefined,
          hasToolServer: "toolServer" in req && req.toolServer !== undefined,
          // The consent verdict the round threaded onto the request — F1: this is the character turn's ENFORCED
          // `ownerConsented`, inherited, NOT a force-stamped `true`.
          ownerConsented: req.ownerConsented === true,
        });
        if (req.responseFormat !== undefined) {
          spy.schemas.push(req.responseFormat.schema);
        }
        if (req.api === "agent-sdk") {
          spy.systemPrompts.push(req.systemPrompt.static);
        }
        // Only `reply` is read by the extraction (the impl parses the JSON out of it); the rest of the
        // ~18-field ChatResult is inert, so a full construction would be noise.
        // FABRICATION-OK: minimal ChatResult double — extraction reads only `reply`; the other fields never run.
        return Promise.resolve({ reply: cannedText } as unknown as ChatResult);
      },
    },
    resolveHostPrincipal: (userId) => Promise.resolve(hostPrincipal(userId)),
    // A throwaway registry — the real graph already registered rpg's tools into `app.toolUse`; re-registering
    // would collide (boot-fatal). The reliable path exercises `runExtraction`, not the tool handlers.
    toolUse: { register: () => undefined },
  });
}

const emptySpy = (): ExtractionSpy => ({ summarizeModels: [], chatTurns: [], schemas: [], systemPrompts: [] });

test("RELIABLE turn (summarize arm) — a NON-agent-sdk host connection routes through executor.summarize", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "reliable-summ");
  const spy = emptySpy();
  const rpgCompose = buildReliableRpg(app, db, "chat-completions", spy);

  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "They arrive at the tower." });
  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, tc("chat-completions"));

  // The summarize arm fired; the chat arm did NOT (the branch, proven).
  expect(spy.summarizeModels).toEqual(["fake-chat-model"]);
  expect(spy.chatTurns).toEqual([]);

  const view = await rpgCompose.service.getTrackerView({ principal: hostPrincipal(hostId), chatId });
  expect(view.ambient?.location).toBe("the obsidian tower");
  const journal = await rpgCompose.service.listJournal({ principal: hostPrincipal(hostId), chatId, limit: 50 });
  expect(journal.map((j) => j.title)).toContain("Arrival");
});

test("RELIABLE turn (agent-sdk arm) — a max-pro-sub-class host connection routes through the structured CHAT path, NOT summarize", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "reliable-agent");
  const spy = emptySpy();
  const rpgCompose = buildReliableRpg(app, db, "agent-sdk", spy);

  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "They arrive at the tower." });
  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, tc("agent-sdk"));

  // The chat arm fired with a responseFormat + NO tool server (read-only structured emission, firewall intact);
  // summarize did NOT (the branch, proven — the metered-sub firewall was never touched).
  expect(spy.summarizeModels).toEqual([]);
  expect(spy.chatTurns).toEqual([{ model: "fake-chat-model", hasResponseFormat: true, hasToolServer: false, ownerConsented: true }]);

  // IDENTICAL state lands via the chat arm (same canned delta, one fold path — the routing changed, not the result).
  const view = await rpgCompose.service.getTrackerView({ principal: hostPrincipal(hostId), chatId });
  expect(view.ambient?.location).toBe("the obsidian tower");
  const journal = await rpgCompose.service.listJournal({ principal: hostPrincipal(hostId), chatId, limit: 50 });
  expect(journal.map((j) => j.title)).toContain("Arrival");
});

// ── R1: the per-call ref constraint reaches the wire on BOTH arms (schema enum + prompt enumeration) ────
test("R1: the extraction schema carries the roster-ref enum + the system prompt enumerates the refs (summarize arm)", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "r1-enum-summ");
  const spy = emptySpy();
  const rpgCompose = buildReliableRpg(app, db, "chat-completions", spy);
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "The host acts." });
  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, tc("chat-completions"));

  // The wire schema constrained party[].targetRef to an ENUM (R1) — the actual per-call refs. The host is a
  // user participant, so the SEMANTIC `player` token leads the enum (stable across persona changes — the
  // ref-vocabulary ruling 2026-07-27), NOT just the display-name-keyed "You".
  const schema = spy.schemas[0] as { properties?: { party?: { items?: { properties?: { targetRef?: { enum?: string[] } } } } } };
  const enumVals = schema.properties?.party?.items?.properties?.targetRef?.enum;
  expect(Array.isArray(enumVals)).toBe(true);
  expect(enumVals).toContain("player"); // the semantic self-ref is enum-able
  // The system prompt enumerates the valid refs (the fallback arm), explains `player`, + the location→scene rule.
  expect(spy.systemPrompts[0]).toContain("Valid targetRef values");
  expect(spy.systemPrompts[0]).toContain('"player" = the human');
  expect(spy.systemPrompts[0]).toContain("Location goes in scene.location");
});

test("R1: the ref enum reaches the agent-sdk chat arm too (portable — same shape, provider-agnostic)", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "r1-enum-agent");
  const spy = emptySpy();
  const rpgCompose = buildReliableRpg(app, db, "agent-sdk", spy);
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "The host acts." });
  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, tc("agent-sdk"));

  const schema = spy.schemas[0] as { properties?: { party?: { items?: { properties?: { targetRef?: { enum?: string[] } } } } } };
  expect(Array.isArray(schema.properties?.party?.items?.properties?.targetRef?.enum)).toBe(true);
  expect(spy.systemPrompts[0]).toContain("Valid targetRef values");
});

// ── F1: the state round rides the NARRATION turn's connection + consent verdict, never a re-resolve ──────
test("F1 (consent inherited): a state round threads the turn's ownerConsented verdict, NOT a force-stamped true", async ({ app, db }) => {
  // The blocker: the round used to hard-code `ownerConsented:true`, so a member-triggered turn on a metered sub
  // could fire a billed round the belt never approved. Now the round inherits the NARRATION turn's enforced
  // verdict. Drive a turn connection = max-pro-sub + ownerConsented:FALSE (the D17 by-proxy refusal shape) and
  // assert the round threaded FALSE onto the executor request — the firewall then denies (fail-closed).
  const { chatId, hostId } = await seedHostGameChat(db, "f1-consent");
  const spy = emptySpy();
  const rpgCompose = buildReliableRpg(app, db, "agent-sdk", spy);
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "A member acts." });

  const subNoConsent = tc("agent-sdk", {
    connection: makeResolvedConnection({
      api: "agent-sdk",
      model: castId<ModelId>("fake-chat-model"),
      credential: makeResolvedCredential("max-pro-sub"),
      capability: makeModelCapability({ output: { maxTokens: { min: 1, max: 4096 }, structured: true }, tools: { parallel: true } }),
    }),
    ownerConsented: false,
  });
  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, subNoConsent);

  // The round threaded the INHERITED (false) verdict — not a force-stamped true. (The fake executor records it;
  // the REAL firewall would `deny` on max-pro-sub + ownerConsented!==true — pinned separately in firewall.test.)
  expect(spy.chatTurns).toEqual([{ model: "fake-chat-model", hasResponseFormat: true, hasToolServer: false, ownerConsented: false }]);
});

test("F1 (room connection): the round runs on the TURN's connection (vllm), never a re-resolved global default", async ({ app, db }) => {
  // The wrong-connection half: the round used to `resolveRole({role:'chat'})` (the host's GLOBAL default), so a
  // room on vllm could run its round on the sub. Now the round rides `turnConnection.connection`. Prove it by
  // giving the turn connection a DISTINCT model the pill's `resolveChat` never returns ("fake-chat-model"): the
  // round must record the THREADED model, not the pill's — i.e. it did not re-resolve.
  const { chatId, hostId } = await seedHostGameChat(db, "f1-room-conn");
  const spy = emptySpy();
  const rpgCompose = buildReliableRpg(app, db, "chat-completions", spy);
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "They cross the bridge." });

  const vllmTurn = tc("chat-completions", {
    connection: makeResolvedConnection({
      api: "chat-completions",
      model: castId<ModelId>("threaded-vllm-model"), // NOT the pill's "fake-chat-model"
      credential: makeResolvedCredential("vllm"),
      capability: makeModelCapability({ output: { maxTokens: { min: 1, max: 4096 }, structured: true }, tools: { parallel: true } }),
    }),
  });
  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, vllmTurn);

  // The structured round fired on the THREADED connection's model — proving no re-resolve of a global default.
  expect(spy.summarizeModels).toEqual(["threaded-vllm-model"]);
});

// ── F2: a readonly (no-writer-capability) turn connection runs NO round (no per-turn failing model call) ────
test("F2 (readonly gate): a turn connection with no writer capability fires NO state round and writes nothing", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "f2-readonly");
  const spy = emptySpy();
  const rpgCompose = buildReliableRpg(app, db, "chat-completions", spy);
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" }); // reliable → needs structured
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "Nothing writable here." });

  // A connection that CANNOT do structured output → reliable mode is readonly (manual-steering). The flush must
  // skip the round entirely (no `structured`/`runChatTurn` call, no failing per-turn spend) and write no snapshot.
  const readonlyTurn = tc("chat-completions", {
    connection: makeResolvedConnection({
      api: "chat-completions",
      model: castId<ModelId>("no-structured-model"),
      capability: makeModelCapability({ output: { maxTokens: { min: 1, max: 4096 } } }), // structured ABSENT
    }),
  });
  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, readonlyTurn);

  // NO round fired (neither arm) — the readonly gate short-circuited before any model call.
  expect(spy.summarizeModels).toEqual([]);
  expect(spy.chatTurns).toEqual([]);
});

// ── F4: the per-call enum includes existing scene-cast + cast-actor keys (removal + cast-actor reach) ────
/** A base snapshot state carrying an existing scene NPC (`presentCharacters[].key`) + an existing cast actor
 *  (`actorState` cast entry) — the two key namespaces F4 says the enum must offer so `presentRemove` can name an
 *  NPC and party/inventory can reach a cast actor. */
function baseWithCast(): RpgSnapshotState {
  return {
    clock: null,
    calendarDate: null,
    location: "the tavern",
    weather: null,
    presentCharacters: [{ key: "Bartender", name: "Bartender", emoji: "", mood: "", customFields: {}, relationship: { kind: "neutral", label: "" } }],
    recentEvents: [],
    actorState: [{ actorRef: { kind: "cast", castKey: "Goblin" }, hp: null, pools: [], conditions: [], inventory: [], wallet: [], status: "" }],
    widgetValues: {},
    quests: [],
    plot: null,
    fieldLocks: null,
  };
}

test("F4: presentRemove enum names an existing scene NPC + party.targetRef reaches an existing cast actor", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "f4-cast-enum");
  const spy = emptySpy();
  const rpgCompose = buildReliableRpg(app, db, "chat-completions", spy);
  const { gameId } = await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });

  // Seed a COMMITTED base snapshot carrying the scene NPC + cast actor, so the round's `baseState` (resolved via
  // the ladder) hands those keys to `resolveExtractionRefs`.
  const { messageId: baseMsg, variantId: baseVar } = await seedMessage(db, chatId, 1, { role: "assistant", content: "You reach the tavern." });
  const written = await writeStagedSnapshot(db, baseWithCast(), {
    id: castId("rpg_snapshot_f4base"),
    gameId,
    messageId: baseMsg,
    variantId: baseVar,
    now: FROZEN_AT,
  });
  expect(written.ok).toBe(true);
  await commitSnapshotForVariant(db, baseVar);

  // The NEXT turn runs the round; its baseState is the committed snapshot above.
  const { messageId, variantId } = await seedMessage(db, chatId, 2, { role: "assistant", content: "The goblin snarls; the bartender ducks." });
  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, tc("chat-completions"));

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

// ── F10: a roster character literally named "Player" owns the `player` ref; the token is withheld ───────
test("F10: a roster character named 'Player' is enum-able and the semantic 'player' token is withheld (no collision)", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "f10-player-collision");
  // A ROSTER character literally named "Player" — `buildRosterRefIndex` gives it precedence over the self-alias,
  // so it OWNS the `player` ref. The enum must therefore offer "Player" (the char is targetable) and NOT the
  // bare `player` token (which would shadow the real roster entry — the F10 seam).
  const playerCharId = await seedCharacter(db, hostId, "Player");
  await seedParticipant(db, { chatId, key: "f10_playerchar", characterId: playerCharId, role: "member", joinSeq: 1 });

  const spy = emptySpy();
  const rpgCompose = buildReliableRpg(app, db, "chat-completions", spy);
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "Player draws a blade." });
  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, tc("chat-completions"));

  const schema = spy.schemas[0] as { properties?: { party?: { items?: { properties?: { targetRef?: { enum?: string[] } } } } } };
  const enumVals = schema.properties?.party?.items?.properties?.targetRef?.enum;
  expect(enumVals).toContain("Player"); // the roster char IS targetable (not dropped)
  expect(enumVals).not.toContain("player"); // the semantic token is withheld — the char owns the ref (F10)
  // The prompt does NOT emit the misleading `"player" = the human` explainer when the token isn't offered.
  expect(spy.systemPrompts[0]).not.toContain('"player" = the human');
});

// ── R3: visibility — a zero-renderable extraction + a phantom cast mint both LOG ────────────────────────
test("R3: an extraction that writes NOTHING renderable logs rpg.extraction.empty (the silent-panel signal)", async ({ app, db }) => {
  const infoSpy = vi.spyOn(logger, "warn");
  const { chatId, hostId } = await seedHostGameChat(db, "r3-empty");
  const spy = emptySpy();
  // Override the canned text to an EMPTY extraction (parses, but folds to zero writes).
  const rpgCompose = buildReliableRpgWithText({ app, db, api: "chat-completions", spy, cannedText: JSON.stringify({}) });
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "Nothing tracked changed." });
  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, tc("chat-completions"));

  const line = infoSpy.mock.calls.find((c) => (c[0] as { event?: string }).event === "rpg.extraction.empty");
  expect(line).toBeDefined();
});

test("R3: an extraction targeting a NON-roster ref mints a cast actor + logs rpg.extraction.phantom", async ({ app, db }) => {
  const warnSpy = vi.spyOn(logger, "warn");
  const { chatId, hostId } = await seedHostGameChat(db, "r3-phantom");
  const spy = emptySpy();
  // A phantom target "player" that the roster doesn't literally contain — but resolveActor's self-alias maps
  // it to the user, so it is NOT phantom. Use a genuinely-unknown name to force the phantom-mint canary.
  const rpgCompose = buildReliableRpgWithText({
    app,
    db,
    api: "chat-completions",
    spy,
    // A partial extraction JSON — the schema fills the other planes with defaults on parse (a real model
    // emits exactly this shape); only `party` carries the non-roster phantom target.
    cannedText: JSON.stringify({ party: [{ targetRef: "Zzyzx the Unknown", status: "cursed" }] }),
  });
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "A stranger appears." });
  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN, tc("chat-completions"));

  const line = warnSpy.mock.calls.find((c) => (c[0] as { event?: string }).event === "rpg.extraction.phantom");
  expect(line).toBeDefined();
  expect((line?.[0] as { phantomTargets?: string[] }).phantomTargets).toContain("Zzyzx the Unknown");
});

test("F3: the host is resolved by ROLE, not join order (post-handoff: first-joined human is a member)", async ({ app, db }) => {
  // Simulate a post-`acceptHostHandoff` state (D64): the first-joined human (joinSeq 0) is now a plain MEMBER,
  // and the current host joined later (joinSeq 1) — roles swapped in place, join order unchanged. The old
  // `find(kind==="user")` picked the first human (the member); the fix resolves by role='host'.
  const member = await seedUser(db, "f3_member");
  const host = await seedUser(db, "f3_host");
  const chatId = await seedChat(db, "f3");
  await seedParticipant(db, { chatId, key: "f3_member", userId: member, role: "member", joinSeq: 0 });
  await seedParticipant(db, { chatId, key: "f3_host", userId: host, role: "host", joinSeq: 1 });

  // The DIVERGENCE the bug exploited: the roster projection (join order) puts the MEMBER first — the old
  // `find(kind==="user")` would have picked it. Prove the two answers differ here.
  const rosterFirstHuman = (await app.chatRpgOps.resolveRpgRoster(chatId)).find((a) => a.actorRef.kind === "user");
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
    now: () => FROZEN_AT,
    rpgChatOps: app.chatRpgOps,
    connection: {
      resolveChat: () => Promise.reject(err),
      getOrSkinTierModels: () => Promise.resolve({ opus: "o", sonnet: "s", haiku: "h" }),
    },
    executor: {
      structured: () => Promise.reject(new Error("unreached — the round never fires on a readonly READ")),
      runChatTurn: () => Promise.reject(new Error("unreached")),
    },
    resolveHostPrincipal: (userId) => Promise.resolve(hostPrincipal(userId)),
    toolUse: { register: () => undefined },
  });
}

test("FIX 1: getGame on a game whose chat connection resolves INCOHERENTLY returns trackersReadOnly:true (READ succeeds, no 500)", async ({ app, db }) => {
  // The exact live repro: a stale dev-stack setting resolves api=agent-sdk × source=vllm — `resolveChat` throws
  // ConnectionRoutingError. The pill's honest-degrade contract ("an unresolvable connection is readonly by
  // construction") must hold: the READ returns a readable game marked read-only, never a thrown 500.
  const { chatId, hostId } = await seedHostGameChat(db, "fix1-incoherent");
  const rpgCompose = buildRpgWithThrowingResolveChat(app, db, new ConnectionRoutingError("agent-sdk", "vllm"));
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });

  const game = await rpgCompose.service.getGame({ principal: hostPrincipal(hostId), chatId });
  expect(game.trackersReadOnly).toBe(true);

  // The tracker view READ likewise degrades (both reads share the pill) — no throw escapes.
  const view = await rpgCompose.service.getTrackerView({ principal: hostPrincipal(hostId), chatId });
  expect(view.trackersReadOnly).toBe(true);
});

test("FIX 1: the agent-sdk model-heal failure class ALSO degrades to trackersReadOnly:true (unresolvable by construction)", async ({ app, db }) => {
  // The sibling connection-resolution failure: an agent-sdk source that reaches the fail-loud model heal.
  // Same contract — an unresolvable connection is readonly, not a 500.
  const { chatId, hostId } = await seedHostGameChat(db, "fix1-heal");
  const rpgCompose = buildRpgWithThrowingResolveChat(app, db, new AgentModelHealError("vllm"));
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });

  const game = await rpgCompose.service.getGame({ principal: hostPrincipal(hostId), chatId });
  expect(game.trackersReadOnly).toBe(true);
});

test("FIX 1: an UNEXPECTED resolveChat failure still PROPAGATES — the catch never swallows a real bug", async ({ app, db }) => {
  // The boundary the verifier checks: the catch is SPECIFIC to the connection-resolution error classes. A
  // genuinely unexpected failure (a DB fault, a transient catalog gap, a programming bug) must escape so it is
  // surfaced/root-caused, NOT silently masked as "read-only". Drive a plain Error and assert the READ throws it.
  const { chatId, hostId } = await seedHostGameChat(db, "fix1-unexpected");
  const boom = new Error("unexpected infra fault");
  // Create the game through a NON-throwing build first (createGame also reads the pill — the unexpected error is
  // scoped to the READ under test, not birth), then READ it through a build whose resolveChat throws `boom`.
  await buildReliableRpg(app, db, "chat-completions", emptySpy()).service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  const rpgCompose = buildRpgWithThrowingResolveChat(app, db, boom);

  await expect(rpgCompose.service.getGame({ principal: hostPrincipal(hostId), chatId })).rejects.toBe(boom);
});
