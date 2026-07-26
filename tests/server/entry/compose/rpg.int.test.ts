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

import type { Principal } from "@orb/contracts/identity";
import type { SummarizeResult } from "@orb/contracts/providers";
import type { RpgBusEvent, RpgExtraction } from "@orb/contracts/rpg";
import type { Db } from "@orb/db";
import type { ChatId, ChatTurnId, ModelId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ServicesResult } from "@orb/server/entry/compose";
import { subscribeRpgEvents } from "../../../../packages/server/src/domain/rpg/index.ts";
import { buildRpg } from "../../../../packages/server/src/entry/compose/rpg.ts";
import { makeModelCapability, makeResolvedConnection } from "../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../support/fixtures.ts";
import { FROZEN_AT, seedChat, seedMessage, seedParticipant, seedUser } from "../../domain/chat/_support.ts";

const TURN: ChatTurnId = castId<ChatTurnId>("chat_turn_compose_1");

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
  expect(detail.rpg).toEqual({ gameId: created.gameId });

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

  // Flush the turn through the REAL chatOps — the staged write becomes the committed variant's snapshot.
  await app.rpgChatOps.onTurnCompleted(chatId, messageId, variantId, TURN);

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

/** Build an rpg seam over the REAL chat wiring (off `app.chatRpgOps`) + real db, with a FAKE executor/connection
 *  (never a live model). This exercises the ACTUAL `buildRpg` + `runExtraction` impl, only faking the model.
 *  The resolved connection carries a structured-output capability so the honest-arms verdict isn't readonly. */
function buildReliableRpg(app: ServicesResult, db: Db, onSummarize: (model: string) => void): ReturnType<typeof buildRpg> {
  return buildRpg({
    db,
    now: () => FROZEN_AT,
    rpgChatOps: app.chatRpgOps,
    connection: {
      resolveRole: () =>
        Promise.resolve(
          makeResolvedConnection({
            model: castId<ModelId>("fake-chat-model"),
            capability: makeModelCapability({ output: { maxTokens: { min: 1, max: 4096 }, structured: true } }),
          }),
        ),
    },
    executor: {
      summarize: (req): Promise<SummarizeResult> => {
        onSummarize(req.model);
        const result = {
          items: [{ text: JSON.stringify(CANNED_EXTRACTION), usage: { tokensIn: null, tokensOut: null, costUsd: null } }],
          model: "fake-chat-model",
        } satisfies SummarizeResult;
        return Promise.resolve(result);
      },
    },
    resolveHostPrincipal: (userId) => Promise.resolve(hostPrincipal(userId)),
    // A throwaway registry — the real graph already registered rpg's tools into `app.toolUse`; re-registering
    // would collide (boot-fatal). The reliable path exercises `runExtraction`, not the tool handlers.
    toolUse: { register: () => undefined },
  });
}

test("RELIABLE turn — the real runExtraction parses a canned structured delta, folds + flushes it (fake model)", async ({ app, db }) => {
  const { chatId, hostId } = await seedHostGameChat(db, "reliable");
  const summarizeModels: string[] = [];
  const rpgCompose = buildReliableRpg(app, db, (m) => summarizeModels.push(m));

  // createGame (reliable is the born default) through the fake-wired service.
  await rpgCompose.service.createGame({ principal: hostPrincipal(hostId), chatId, mode: "lite" });
  const { messageId, variantId } = await seedMessage(db, chatId, 1, { role: "assistant", content: "They arrive at the tower." });

  // The reliable flush: runExtraction (real impl over the fake model) → fold → stage → write.
  await rpgCompose.chatOps.onTurnCompleted(chatId, messageId, variantId, TURN);

  // The fake model was called with the resolved chat model (the impl drove the real connection resolve).
  expect(summarizeModels).toEqual(["fake-chat-model"]);

  // The extracted state landed on the committed variant's snapshot (the real fold + accumulator + flush).
  const view = await rpgCompose.service.getTrackerView({ principal: hostPrincipal(hostId), chatId });
  expect(view.ambient?.location).toBe("the obsidian tower");
  const journal = await rpgCompose.service.listJournal({ principal: hostPrincipal(hostId), chatId, limit: 50 });
  expect(journal.map((j) => j.title)).toContain("Arrival");
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
