// One room on the stage: create its characters and chat, write the shared prefix once, run each case's steps
// through orb's real chat verbs, and read each provider call's usage off the assistant rows the verbs return.
// It registers every row it creates for removal.
import { errorMessage } from "@orb/kit/error-message";
import type { AppRouter } from "@orb/server/transport/trpc";
import { createTRPCClient, httpLink } from "@trpc/client";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { Measure, ProbeStep, RoomRun } from "../contract/plan.ts";
import type { CallUsage, CaseRun, OrbApi, RoomCaseResult, RoomResult } from "../contract/types.ts";
import { CASE_PLANS, REPLY_MAX_TOKENS, ROOMS } from "../lib/fixture.ts";

refuseDirectInvocation(import.meta.url, "pnpm cache:check");

const TRPC_PATH = "/api/trpc";
/** The newest page of a chat; every probe chat is far shorter. */
const MESSAGE_PAGE = 100;
/** Every probe row's name starts with this, so a leftover is recognisable in any stage DB. */
export const PROBE_PREFIX = "cache-check";

/** The typed client the check drives orb through: plain HTTP, the owner-fallback identity of a loopback call. */
export function connectOrb(baseUrl: string): OrbApi {
  return createTRPCClient<AppRouter>({ links: [httpLink({ url: `${baseUrl}${TRPC_PATH}` })] });
}

/** Undo steps for rows a run created, run newest first. A failed undo is collected, never dropped. */
export class ProbeRows {
  readonly #undo: (() => Promise<unknown>)[] = [];

  add(undo: () => Promise<unknown>): void {
    this.#undo.push(undo);
  }

  /** Run every undo; return the failures, each as a message. */
  async release(): Promise<readonly string[]> {
    const failures: string[] = [];
    for (const undo of this.#undo.splice(0).reverse()) {
      // @orb-waive caught-failure-ownership(error): every teardown failure is returned to the run, which prints it and exits as a tool error; one failure must not strand the rows after it.
      try {
        await undo();
      } catch (error) {
        failures.push(errorMessage(error));
      }
    }
    return failures;
  }
}

type TurnOutcome = Awaited<ReturnType<OrbApi["chat"]["send"]["mutate"]>>;
type MessageView = TurnOutcome["messages"][number];
type ChatId = MessageView["chatId"];

function usageOf(message: MessageView): CallUsage {
  return {
    id: message.generationId ?? message.id,
    promptTokens: message.tokensIn,
    readTokens: message.cacheReadTokens,
    writeTokens: message.cacheWriteTokens,
  };
}

function measuredCalls(replies: readonly MessageView[], measure: Measure): readonly CallUsage[] {
  const last = replies.at(-1);
  const byMeasure: Readonly<Record<Measure, readonly MessageView[]>> = { none: [], last: last === undefined ? [] : [last], all: replies };
  return byMeasure[measure].map(usageOf);
}

async function lastReplyId(api: OrbApi, chatId: ChatId): Promise<MessageView["id"]> {
  const page = await api.chat.listMessages.query({ chatId, limit: MESSAGE_PAGE });
  const last = page.messages.findLast((m) => m.role === "assistant");
  if (last === undefined) {
    throw new Error("continue found no assistant row to continue");
  }
  return last.id;
}

const NO_RUN: CaseRun = { calls: [], replyCosts: [] };

type TurnStep = Extract<ProbeStep, { kind: "send" | "continue" | "generate" }>;

async function runTurn(api: OrbApi, chatId: ChatId, step: TurnStep): Promise<TurnOutcome> {
  const intent = { maxOutputTokens: REPLY_MAX_TOKENS };
  if (step.kind === "send") {
    return await api.chat.send.mutate({ chatId, content: step.content, intent });
  }
  if (step.kind === "continue") {
    return await api.chat.continueTurn.mutate({ chatId, messageId: await lastReplyId(api, chatId), intent });
  }
  return await api.chat.generate.mutate({ chatId, intent });
}

async function runStep(api: OrbApi, chatId: ChatId, step: ProbeStep): Promise<CaseRun> {
  if (step.kind === "note") {
    await api.chat.setChatInjection.mutate({ chatId, position: "in_chat", depth: step.depth, role: "system", content: step.content });
    return NO_RUN;
  }
  if (step.kind === "commit") {
    await api.chat.commitMessage.mutate({ chatId, content: step.content });
    return NO_RUN;
  }
  const outcome = await runTurn(api, chatId, step);
  if (outcome.aborted) {
    throw new Error(`the ${step.kind} turn aborted (${outcome.abortReason ?? "no reason"})`);
  }
  const replies = outcome.messages.filter((m) => m.role === "assistant");
  // A generate only answers the prefix, so any reply count serves; a send or continue must match the plan.
  const expected = step.kind === "send" ? (step.speakers ?? 1) : 1;
  if (step.kind === "generate" ? replies.length === 0 : replies.length !== expected) {
    throw new Error(`the ${step.kind} turn produced ${replies.length} replies; the plan needs ${step.kind === "generate" ? "one or more" : expected}`);
  }
  return { calls: measuredCalls(replies, step.measure), replyCosts: replies.map((m) => m.costUsd) };
}

async function runSteps(api: OrbApi, chatId: ChatId, steps: readonly ProbeStep[]): Promise<CaseRun> {
  const calls: CallUsage[] = [];
  const replyCosts: (number | null)[] = [];
  for (const step of steps) {
    const ran = await runStep(api, chatId, step);
    calls.push(...ran.calls);
    replyCosts.push(...ran.replyCosts);
  }
  return { calls, replyCosts };
}

type CharacterId = Awaited<ReturnType<OrbApi["character"]["create"]["mutate"]>>["id"];

async function openRoom(api: OrbApi, roomRun: RoomRun, probe: { readonly tag: string; readonly rows: ProbeRows }): Promise<ChatId> {
  const { tag, rows } = probe;
  const room = ROOMS[roomRun.room];
  const characterIds: CharacterId[] = [];
  for (const card of room.cards) {
    const created = await api.character.create.mutate({
      input: {
        handle: `${PROBE_PREFIX}-${tag}-${card.key}`,
        name: card.name,
        description: card.description,
        greetings: [{ text: card.greeting }],
        systemPrompt: card.systemPrompt,
      },
    });
    rows.add(() => api.character.remove.mutate({ characterId: created.id }));
    characterIds.push(created.id);
  }
  // Temporary: hidden from the chat list, so a run on a copy of the dev DB never shows up in its sidebar.
  const started = await api.chat.startChat.mutate({ characterIds, opening: room.opening, title: `${PROBE_PREFIX} ${tag}`, temporary: true });
  const chatId = started.chat.id;
  rows.add(() => api.chat.delete.mutate({ chatId }));
  if (room.group !== null) {
    await api.chat.setGroupConfig.mutate({ chatId, config: room.group });
  }
  return chatId;
}

/** Run a room's cases in one chat on the currently bound chat connection, after writing its prefix once. Every
 *  row it creates is registered on `rows`; the caller releases them. `tag` keeps its handles unique. A failed
 *  step fails its own case and the room goes on to the next; a failed prefix fails every case in the room. */
export async function runRoom(api: OrbApi, roomRun: RoomRun, probe: { readonly tag: string; readonly rows: ProbeRows }): Promise<RoomResult> {
  let chatId: ChatId;
  let prefix: CaseRun;
  // @orb-waive caught-failure-ownership(error): a failed room opening becomes an ERROR line for every case in the room, and those lines make the run exit as a tool error.
  try {
    chatId = await openRoom(api, roomRun, probe);
    prefix = await runSteps(api, chatId, ROOMS[roomRun.room].prefixSteps);
  } catch (error) {
    return { prefixCosts: [], cases: roomRun.cases.map((c) => ({ case: c, error: `the room's prefix failed: ${errorMessage(error)}` })) };
  }
  const cases: RoomCaseResult[] = [];
  let opening = prefix.calls;
  for (const c of roomRun.cases) {
    // @orb-waive caught-failure-ownership(error): a failed step becomes this case's ERROR line with its message, and the ERROR line makes the run exit as a tool error.
    try {
      const run = await runSteps(api, chatId, CASE_PLANS[c].steps);
      cases.push({ case: c, run: { calls: [...opening, ...run.calls], replyCosts: run.replyCosts } });
      opening = [];
    } catch (error) {
      cases.push({ case: c, error: errorMessage(error) });
    }
  }
  return { prefixCosts: prefix.replyCosts, cases };
}
