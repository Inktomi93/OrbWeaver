// Physical unwinding and native timer observation expose the real post-commit cancellation/barrier lifecycle.

import { createCharacterSchema } from "@orb/contracts/character";
import type { CharacterHandle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { CORPUS_PROVIDER_ENDPOINT } from "./corpus-provider.ts";
import type { createRpgFlightTimers, createRpgFlightWire } from "./corpus-rpg-flight-wire.ts";
import { RPG_AFTER_CANCEL_CUE, RPG_CANCEL_CUE, RPG_FOREIGN_STOP_CUE, RPG_ROUND_MODEL } from "./corpus-rpg-flight-wire.ts";
import { seedChatInvite, seedInvitedChatParticipant } from "./factories/chat.ts";
import { captureRpgRows, captureRpgTurnToolCalls, seedRpgGame } from "./factories/rpg.ts";
import type { ServerTestHarness } from "./server.ts";

type Caller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;
type NativeTurn = Awaited<ReturnType<ServerTestHarness["services"]["chat"]["send"]>>;
type FlightWire = ReturnType<typeof createRpgFlightWire>;
type FlightTimers = ReturnType<typeof createRpgFlightTimers>;
type Trace = ReturnType<NonNullable<ServerTestHarness["app"]["rpgTrace"]>["recent"]>;
interface NativeRoundRoom {
  readonly character: Awaited<ReturnType<Caller["character"]["create"]>>;
  readonly room: Awaited<ReturnType<Caller["chat"]["startChat"]>>;
  readonly game: Awaited<ReturnType<typeof seedRpgGame>>;
  readonly participant: Awaited<ReturnType<typeof seedInvitedChatParticipant>>;
}
interface CancelledRound extends NativeRoundRoom {
  readonly turn: NativeTurn;
  readonly nextTurn: NativeTurn;
  readonly signalAborted: boolean | undefined;
  readonly waitMs: number | null;
  readonly attemptsBeforeNext: number;
  readonly attemptsWhileWaiting: number;
  readonly before: Awaited<ReturnType<typeof captureRpgRows>>;
  readonly after: Awaited<ReturnType<typeof captureRpgRows>>;
  readonly cancelledCalls: Awaited<ReturnType<typeof captureRpgTurnToolCalls>>;
  readonly nextCalls: Awaited<ReturnType<typeof captureRpgTurnToolCalls>>;
  readonly trace: Trace;
}
interface ForeignStopRound extends NativeRoundRoom {
  readonly turn: NativeTurn;
  readonly signalAborted: boolean | undefined;
  readonly before: Awaited<ReturnType<typeof captureRpgRows>>;
  readonly after: Awaited<ReturnType<typeof captureRpgRows>>;
  readonly calls: Awaited<ReturnType<typeof captureRpgTurnToolCalls>>;
  readonly tracker: Awaited<ReturnType<Caller["rpg"]["getTrackerView"]>>;
  readonly trace: Trace;
}
interface CorpusRpgRounds {
  readonly connection: Awaited<ReturnType<ServerTestHarness["services"]["connection"]["create"]>>;
  readonly cancelled: CancelledRound;
  readonly foreignStop: ForeignStopRound;
}

async function roundRoom(root: ServerTestHarness, memberUserId: ServerTestHarness["ownerId"], handle: CharacterHandle): Promise<NativeRoundRoom> {
  const principal = await root.principalFor(root.ownerId);
  const caller = await root.internalCallerFor(root.ownerId);
  const member = await root.principalFor(memberUserId);
  const character = await caller.character.create({
    input: createCharacterSchema.parse({ handle, name: "Corpus round keeper", description: "A keeper records observatory rounds." }),
  });
  const room = await caller.chat.startChat({ characterIds: [character.id], opening: "none" });
  const chatId = room.chat.id;
  await caller.chat.setGroupConfig({ chatId, config: { output: "per-speaker", cardScope: "scoped", policy: "list" } });
  const game = await seedRpgGame(root.db, root.services.rpg.createGame, { principal, chatId, mode: "lite" });
  await caller.rpg.updateConfig({ chatId, extractionMode: "cheap" });
  const invite = await seedChatInvite(root.db, root.services.chat.createInvite, { principal, chatId, input: { invitedHandle: member.handle } });
  const participant = await seedInvitedChatParticipant(root.db, root.services.chat.acceptInvite, { principal: member, inviteId: invite.id });
  return { character, room, game, participant };
}

async function cancelRound(
  root: ServerTestHarness,
  wire: FlightWire,
  timers: FlightTimers,
  memberUserId: ServerTestHarness["ownerId"],
): Promise<CancelledRound> {
  const source = await roundRoom(root, memberUserId, castId<CharacterHandle>("corpus-rpg-cancelled"));
  const principal = await root.principalFor(root.ownerId);
  const chatId = source.room.chat.id;
  const trace = root.app.rpgTrace;
  if (trace === undefined) {
    throw new Error("native RPG rounds require the actual recorder");
  }
  const hold = wire.hold('"tool_choice":"required"', { deferAbortUntilRelease: true });
  const sending = root.services.chat.send({ principal, chatId, content: RPG_CANCEL_CUE, timeZone: UTC_TIME_ZONE });
  let next: Promise<NativeTurn> | undefined;
  try {
    await Promise.race([hold.entered, sending.then(() => undefined)]);
    const turn = await sending;
    await hold.entered;
    const before = await captureRpgRows(root.db, source.game.id);
    await root.services.chat.abort({ principal, chatId });
    await hold.aborted;
    const signalAborted = hold.requestSignal()?.aborted;
    const attemptsBeforeNext = wire.attempts.length;
    const waitEntered = timers.nextTimeout();
    const modelEntered = wire.nextRequest(RPG_AFTER_CANCEL_CUE);
    next = root.services.chat.send({ principal, chatId, content: RPG_AFTER_CANCEL_CUE, timeZone: UTC_TIME_ZONE });
    const waitMs = await Promise.race([waitEntered, modelEntered.then(() => null)]);
    const attemptsWhileWaiting = wire.attempts.length;
    hold.release();
    const nextTurn = await next;
    await root.settleBackground();
    const assistant = turn.messages.find((message) => message.role === "assistant");
    const nextAssistant = nextTurn.messages.find((message) => message.role === "assistant");
    if (assistant === undefined || nextAssistant === undefined) {
      throw new Error("native RPG cancel lifecycle lost a committed narrative anchor");
    }
    return {
      ...source,
      turn,
      nextTurn,
      signalAborted,
      waitMs,
      attemptsBeforeNext,
      attemptsWhileWaiting,
      before,
      after: await captureRpgRows(root.db, source.game.id),
      cancelledCalls: await captureRpgTurnToolCalls(root.db, source.game.id, [assistant.selectedVariantId]),
      nextCalls: await captureRpgTurnToolCalls(root.db, source.game.id, [nextAssistant.selectedVariantId]),
      trace: trace.recent({ chatId }),
    };
  } finally {
    hold.release();
    await Promise.allSettled([sending, ...(next === undefined ? [] : [next])]);
  }
}

async function foreignStopRound(root: ServerTestHarness, wire: FlightWire, memberUserId: ServerTestHarness["ownerId"]): Promise<ForeignStopRound> {
  const source = await roundRoom(root, memberUserId, castId<CharacterHandle>("corpus-rpg-foreign-stop"));
  const principal = await root.principalFor(root.ownerId);
  const member = await root.principalFor(memberUserId);
  const caller = await root.internalCallerFor(root.ownerId);
  const chatId = source.room.chat.id;
  const hold = wire.hold('"tool_choice":"required"');
  const sending = root.services.chat.send({ principal, chatId, content: RPG_FOREIGN_STOP_CUE, timeZone: UTC_TIME_ZONE });
  try {
    const turn = await sending;
    await hold.entered;
    const before = await captureRpgRows(root.db, source.game.id);
    await root.services.chat.abort({ principal: member, chatId });
    const signalAborted = hold.requestSignal()?.aborted;
    hold.release();
    await root.settleBackground();
    const assistant = turn.messages.find((message) => message.role === "assistant");
    if (assistant === undefined || root.app.rpgTrace === undefined) {
      throw new Error("native owner round has no narrative/trace identity");
    }
    return {
      ...source,
      turn,
      signalAborted,
      before,
      after: await captureRpgRows(root.db, source.game.id),
      calls: await captureRpgTurnToolCalls(root.db, source.game.id, [assistant.selectedVariantId]),
      tracker: await caller.rpg.getTrackerView({ chatId }),
      trace: root.app.rpgTrace.recent({ chatId }),
    };
  } finally {
    hold.release();
    await Promise.allSettled([sending]);
  }
}

/** Cheap rounds ride their actual character turn's connection and are stopped only through chat's owner door. */
export async function seedCorpusRpgRounds(
  root: ServerTestHarness,
  wire: FlightWire,
  timers: FlightTimers,
  memberUserId: ServerTestHarness["ownerId"],
): Promise<CorpusRpgRounds> {
  const principal = await root.principalFor(root.ownerId);
  const caller = await root.internalCallerFor(root.ownerId);
  const preset = await caller.preset.create({ name: "Post-commit RPG corpus", kind: "custom" });
  await caller.settings.updateUserSettingsSection({ section: "seeds", patch: { defaultPresetId: preset.id } });
  const connection = await root.services.connection.create({
    principal,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: RPG_ROUND_MODEL,
    allowBackground: true,
    declared: {
      kind: "generation",
      generation: { input: ["text"], context: { window: 32_000 }, tools: { parallel: true, silencesProse: false, requiredChoice: true } },
      features: { detectServer: false },
    },
  });
  await caller.connection.setBinding({ task: "chat", connectionId: connection.id });
  const cancelled = await cancelRound(root, wire, timers, memberUserId);
  const foreignStop = await foreignStopRound(root, wire, memberUserId);
  return { connection, cancelled, foreignStop };
}
