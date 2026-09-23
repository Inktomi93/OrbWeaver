// One case on the stage: create its characters and chat, run its steps through orb's real chat verbs, and
// read each provider call's usage off the assistant rows the verbs return. It registers every row it creates for removal.
import { errorMessage } from "@orb/kit/error-message";
import type { AppRouter } from "@orb/server/transport/trpc";
import { createTRPCClient, httpLink } from "@trpc/client";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { CasePlan, Measure, ProbeStep } from "../contract/plan.ts";
import type { CallUsage, CaseRun, OrbApi } from "../contract/types.ts";
import { REPLY_MAX_TOKENS, ROOMS } from "../lib/fixture.ts";

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

async function runStep(api: OrbApi, chatId: ChatId, step: ProbeStep): Promise<CaseRun> {
  const intent = { maxOutputTokens: REPLY_MAX_TOKENS };
  if (step.kind === "note") {
    await api.chat.setChatInjection.mutate({ chatId, position: "in_chat", depth: step.depth, role: "system", content: step.content });
    return { calls: [], replyCosts: [] };
  }
  const outcome =
    step.kind === "send"
      ? await api.chat.send.mutate({ chatId, content: step.content, intent })
      : await api.chat.continueTurn.mutate({ chatId, messageId: await lastReplyId(api, chatId), intent });
  if (outcome.aborted) {
    throw new Error(`the ${step.kind} turn aborted (${outcome.abortReason ?? "no reason"})`);
  }
  const replies = outcome.messages.filter((m) => m.role === "assistant");
  const expected = step.kind === "send" ? (step.speakers ?? 1) : 1;
  if (replies.length !== expected) {
    throw new Error(`the ${step.kind} turn produced ${replies.length} replies; the plan needs ${expected}`);
  }
  return { calls: measuredCalls(replies, step.measure), replyCosts: replies.map((m) => m.costUsd) };
}

type CharacterId = Awaited<ReturnType<OrbApi["character"]["create"]["mutate"]>>["id"];

/** Run one case plan in a fresh chat on the currently bound chat connection. Every row it creates is
 *  registered on `rows`; the caller releases them. `tag` keeps its handles unique. */
export async function runCasePlan(api: OrbApi, plan: CasePlan, probe: { readonly tag: string; readonly rows: ProbeRows }): Promise<CaseRun> {
  const { tag, rows } = probe;
  const room = ROOMS[plan.room];
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
  const calls: CallUsage[] = [];
  const replyCosts: (number | null)[] = [];
  for (const step of plan.steps) {
    const ran = await runStep(api, chatId, step);
    calls.push(...ran.calls);
    replyCosts.push(...ran.replyCosts);
  }
  return { calls, replyCosts };
}
