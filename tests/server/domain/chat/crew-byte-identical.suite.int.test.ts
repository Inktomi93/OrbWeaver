// chat-crew-design/04 §1 (Enforcers) + 08 §3 test-plan item 7 — the CHAT-SIDE byte-identity contract.
// The crew touches the turn in exactly ONE place: `verbs/turn.ts`'s `buildTurnContext` calls the injected
// `ctx.crew.gatherTurnContext` and merges its `injections` into chat's single Injection[] list (`crewInjections`).
// The invariant: a chat with NO crew row (or the director off / no pass) assembles a BYTE-identical wire prompt
// whether the crew op is WIRED (returns null) or ABSENT (`ctx.crew === null`). This pins the one seam so a
// regression — crew injections leaking into a crew-less chat, or the null-arm diverging from the op-absent build
// — ships RED, not green. Driven through the REAL `send` turn path (not `driveRound`, which takes a pre-built
// assemble ctx and never reaches the gather), so the crew merge genuinely runs.
//
// Faithful, not vacuous: posture B wires the REAL `createGatherTurnContext` over the same (crew-less) db, so it
// runs `readConfig`/`readGuidance` and returns null; the second test seeds a director row WITH guidance and
// proves the SAME wired op DOES change the prompt (the injection rides) — the wiring is real, the no-op is the
// crew-less case, not a dead op.

import type { AssemblePersona, ChatBusEvent } from "@orb/contracts/chat";
import { crewConfigSchema } from "@orb/contracts/crew";
import type { Principal } from "@orb/contracts/identity";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { Db } from "@orb/db";
import type { ChatId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { createActiveTurns } from "../../../../packages/server/src/domain/chat/active-turns";
import type { ChatContext } from "../../../../packages/server/src/domain/chat/context";
import type { TurnRequest } from "../../../../packages/server/src/domain/chat/contract/results";
import { createTurnEngine } from "../../../../packages/server/src/domain/chat/engine/engine";
import { loadWitnessHorizons } from "../../../../packages/server/src/domain/chat/memory/persistence/queries";
import { recallMemory } from "../../../../packages/server/src/domain/chat/memory/recall/recall";
import { createTurn } from "../../../../packages/server/src/domain/chat/verbs/turn";
import { writeConfig } from "../../../../packages/server/src/domain/crew/persistence/config";
import { writePlot } from "../../../../packages/server/src/domain/crew/persistence/plots";
import { createGatherTurnContext } from "../../../../packages/server/src/domain/crew/verbs/gather-turn-context";
import { FROZEN_AT_MS } from "../../../support/clock";
import { freshDb } from "../../../support/db";
import { principal as makePrincipal } from "../../../support/factories/principal.ts";
import { expect, test } from "../../../support/fixtures";
import { makeHarness as makeCrewHarness } from "../crew/_support";
import { makeChatContext, scriptedRoleTurn, seedCharacter, seedChat, seedMessage, seedParticipant, seedUser, testConnection } from "./_support";

const PERSONAS: { anchor: AssemblePersona | null; active: AssemblePersona | null } = {
  anchor: { name: "Nate", description: "the user" },
  active: { name: "Nate", description: "the user" },
};

function principal(userId: UserId): Principal {
  return makePrincipal(userId, { handle: castId<Handle>("h") });
}

function seededPrng(seed = 1): () => number {
  let s = seed;
  return (): number => {
    s = (s * 16_807) % 2_147_483_647;
    return s / 2_147_483_647;
  };
}

/** The chat-side crew op, wired to the REAL gather verb over `db` (the compose delegate shape: chatId → {chatId}). */
function crewOp(db: Db): NonNullable<ChatContext["crew"]> {
  const gather = createGatherTurnContext(makeCrewHarness(db).ctx);
  return { gatherTurnContext: (chatId: ChatId) => gather({ chatId }) };
}

/** Drive ONE `send` on a solo (host + Aria) chat with the given crew op; return the captured wire request. */
async function runSend(database: Db, host: UserId, chatId: ChatId, crew: ChatContext["crew"]): Promise<TurnRequest> {
  const requests: TurnRequest[] = [];
  const ctx = makeChatContext(database, {
    runChatTurn: scriptedRoleTurn(requests),
    applyStatsDelta: (): void => undefined,
    crew,
  });
  const emit = (_e: ChatBusEvent): Promise<void> => Promise.resolve();
  const engine = createTurnEngine(ctx, {
    emit,
    debitBudget: () => Promise.resolve(),
    resolveTurnPolicy: () => Promise.resolve({ budget: null, allowNonOwnerMaxProSub: false }),
    holder: "tester",
    lockTtlMs: 60_000,
    generateSegments: async () => ({ written: 0, skipped: 0 }),
    generateDigests: async () => ({ written: 0, skipped: 0 }),
    loadWitnessHorizons,
    recallMemory,
  });
  const turn = createTurn(ctx, {
    engine,
    activeTurns: createActiveTurns(),
    emit,
    prng: seededPrng(),
    delay: () => Promise.resolve(),
    resolveConnection: () => Promise.resolve(testConnection()),
    resolveForeignInputs: () =>
      Promise.resolve({ promptConfig: DEFAULT_PROMPT_CONFIG, personas: PERSONAS, globalRegexScripts: [], scanDepth: 6, injectionTokenBudget: 0 }),
  });

  const outcome = await turn.send({ principal: principal(host), chatId, content: "tell me more" });
  expect(outcome.aborted).toBe(false);
  const req = requests[0];
  if (req === undefined) {
    throw new Error("send produced no wire request");
  }
  return req;
}

/** A fresh solo room (host + Aria + one prior exchange) with identical ids across postures. */
async function seedRoom(database: Db): Promise<{ host: UserId; chatId: ChatId }> {
  const host = await seedUser(database, "host");
  const aria = await seedCharacter(database, host, "aria");
  const chatId = await seedChat(database, "c");
  await seedParticipant(database, { chatId, key: "h", userId: host, role: "host" });
  await seedParticipant(database, { chatId, key: "aria", characterId: aria, joinSeq: 0 });
  await seedMessage(database, chatId, 1, { role: "user", authorUserId: host, content: "hello there" });
  await seedMessage(database, chatId, 2, { characterId: aria, content: "well met, traveler" });
  return { host, chatId };
}

/** The wire-comparable projection (connection/signal excluded — identical/absent in both). */
function wireBytes(req: TurnRequest): string {
  return JSON.stringify({ prompt: req.prompt, history: req.history, intent: req.intent, kind: req.kind, cacheBreakpointFromEnd: req.cacheBreakpointFromEnd });
}

describe("chat-crew byte-identity (04 §1 / 08 §3 item 7)", () => {
  test("a crew-less chat: the crew op WIRED (returns null) ≡ the op ABSENT — byte-identical wire prompt", async () => {
    const absentDb = await freshDb();
    const { host: aHost, chatId: aChat } = await seedRoom(absentDb);
    const absent = await runSend(absentDb, aHost, aChat, null);

    const wiredDb = await freshDb();
    const { host: wHost, chatId: wChat } = await seedRoom(wiredDb);
    const wired = await runSend(wiredDb, wHost, wChat, crewOp(wiredDb));

    expect(wireBytes(wired)).toBe(wireBytes(absent));
    // Non-vacuous: the seeded canon actually assembled into the wire history.
    expect(JSON.stringify(absent.history)).toContain("well met, traveler");
  });

  test("the wired op is REAL: a director row with guidance DOES inject (proves the no-op is the crew-less case)", async () => {
    const database = await freshDb();
    const { host, chatId } = await seedRoom(database);
    // Director enabled + a stored guidance line ⇒ the real gather op returns ONE host-ring injection.
    await writeConfig(database, chatId, crewConfigSchema.parse({ version: 1, director: { enabled: true } }), FROZEN_AT_MS);
    await writePlot(database, chatId, { arc: "the arc", twists: [], retiredTwists: [], guidance: "STEER-THE-NARRATOR-HERE", lastPassSeq: 2 }, FROZEN_AT_MS);

    const req = await runSend(database, host, chatId, crewOp(database));
    expect(JSON.stringify({ prompt: req.prompt, history: req.history })).toContain("STEER-THE-NARRATOR-HERE");
  });
});
