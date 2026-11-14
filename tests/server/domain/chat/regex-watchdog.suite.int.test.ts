// Every server leg that runs a host regex script runs it under the per-call node:vm watchdog: no pattern is refused for
// its shape, so the deadline is the only guard between a runaway pattern and the event loop (D53). Each case drives
// one leg through its production entry with a catastrophic pattern ahead of an ordinary one: the runaway is cut off
// and reported, the text keeps what it had, and the next script still runs. The edit re-apply leg is
// `tests/server/domain/chat/verbs/edit-regex-limits.int.test.ts`.
// @subject packages/server/src/primitives/regex/index.ts
// @subject packages/server/src/entry/compose/chat.ts
// @subject packages/server/src/domain/chat/assembly/context.ts
// @subject packages/server/src/domain/chat/assembly/history-regex.ts
// @subject packages/server/src/domain/chat/engine/pipeline.ts
// @subject packages/server/src/domain/chat/verbs/read.ts

import type { Principal } from "@orb/contracts/identity";
import type { PromptConfig } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG, THINK_PREFIX_DEFAULT, THINK_SUFFIX_DEFAULT } from "@orb/contracts/preset";
import { createRegexScriptSchema } from "@orb/contracts/regex";
import { createBookSchema, createEntrySchema } from "@orb/contracts/world-info";
import type { RegexPlacement } from "@orb/kit/regex";
import { deriveRegexHistoryDepth, deriveRegexTierFlags } from "@orb/kit/regex";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { appendedBy } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
} from "@orb/testkit/node/composed";
import { vi } from "vitest";
import { z } from "zod";
import { REGEX_PASS_BUDGET_SPENT } from "#server/primitives/regex/index.ts";

// Exponential on a near miss: unwatched, this subject takes seconds per call, far past the row deadline, and a longer
// run of `a` takes longer than any test budget.
const RUNAWAY = "(a+)+$";
const NEAR_MISS = `${"a".repeat(28)}!`;
// The ordinary script after the runaway: it proves the leg ran on and that the runaway changed nothing.
const FOLLOWER = { findRegex: "!", replaceString: "?" } as const;
const FOLLOWED = `${"a".repeat(28)}?`;
const WATCHDOG_TIMEOUT = "ERR_SCRIPT_EXECUTION_TIMEOUT";
const LOG_FIELDS = z.record(z.string(), z.unknown());
// Enough runaways that, each costing a row deadline, they spend any pass budget long before the last one runs, even
// on a host so loaded that a deadline's wall time buys a fraction of its CPU.
const RUNAWAY_LIBRARY = 20;

interface Room extends AsyncDisposable {
  readonly h: ChatRoot;
  readonly host: Principal;
  readonly bodies: string[];
  readonly timeouts: () => readonly { readonly placement: unknown; readonly message: unknown }[];
  /** Every script the watchdog stopped or the budget skipped, by the code it was reported with. */
  readonly stops: () => readonly unknown[];
}

/** A room whose host attached the runaway script and the follower, both global, on `placement`. */
async function openRoom(
  placement: RegexPlacement,
  reply: string,
  options: { readonly promptConfig?: PromptConfig; readonly transcript?: readonly string[]; readonly runaways?: number } = {},
): Promise<Room> {
  const bodies: string[] = [];
  const wire = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: (body) => {
      bodies.push(body);
      return reply;
    },
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using construction = new AsyncDisposableStack();
  const h = construction.use(
    await createChatRoot({
      providerFetch: wire.execute,
      memoryEnabled: false,
      ...(options.promptConfig === undefined ? {} : { promptConfig: options.promptConfig }),
      ...(options.transcript === undefined ? {} : { transcript: options.transcript.map((content) => ({ role: "assistant" as const, content })) }),
    }),
  );
  const placements = [placement];
  const historyDepth = deriveRegexHistoryDepth(placements, undefined);
  const runaways = Array.from({ length: options.runaways ?? 1 }, (_, k) => [`runaway ${String(k)}`, { findRegex: RUNAWAY, replaceString: "X" }] as const);
  for (const [name, script] of [...runaways, ["follower", FOLLOWER] as const]) {
    const row = await h.caller.regex.createScript({
      input: createRegexScriptSchema.parse({
        name,
        ...script,
        placement: placements,
        ...deriveRegexTierFlags(placements),
        ...(historyDepth === undefined ? {} : { historyDepth }),
      }),
    });
    await h.caller.regex.attachGlobal({ scriptId: row.id });
  }
  const warn = vi.spyOn(h.root.logger, "warn").mockImplementation(() => undefined);
  construction.defer(() => warn.mockRestore());
  const reported = (): { placement: unknown; message: unknown; code: unknown; findRegex: unknown }[] =>
    warn.mock.calls.map(([payload, message]) => {
      const fields = LOG_FIELDS.safeParse(payload).data ?? {};
      const err = fields["err"];
      return {
        placement: fields["placement"],
        message,
        code: typeof err === "object" && err !== null && "code" in err ? err.code : undefined,
        findRegex: fields["findRegex"],
      };
    });
  const timeouts = (): { placement: unknown; message: unknown }[] =>
    reported().flatMap((r) => (r.code === WATCHDOG_TIMEOUT && r.findRegex === RUNAWAY ? [{ placement: r.placement, message: r.message }] : []));
  const stops = (): unknown[] => reported().flatMap((r) => (r.code === WATCHDOG_TIMEOUT || r.code === REGEX_PASS_BUDGET_SPENT ? [r.code] : []));
  const lifetime = construction.move();
  return { h, host: h.owner, bodies, timeouts, stops, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}

async function send(room: Room, content: string): ReturnType<ChatRoot["caller"]["chat"]["send"]> {
  return await room.h.caller.chat.send({ chatId: room.h.chatId, content, timeZone: UTC_TIME_ZONE });
}

test("USER_INPUT: the composer draft keeps its text when the runaway is cut off, and the next script runs", async () => {
  await using room = await openRoom("USER_INPUT", "Noted.");

  const outcome = await send(room, NEAR_MISS);

  expect(outcome.messages.find((message) => message.role === "user")?.content).toBe(FOLLOWED);
  expect(room.timeouts().map((t) => t.placement)).toEqual(["USER_INPUT"]);
});

test("AI_OUTPUT: the committed reply keeps its text when the runaway is cut off, and the next script runs", async () => {
  await using room = await openRoom("AI_OUTPUT", NEAR_MISS);

  const outcome = await send(room, "Go on.");

  expect(outcome.messages.find((message) => message.role === "assistant")?.content).toBe(FOLLOWED);
  expect(room.timeouts().map((t) => t.placement)).toEqual(["AI_OUTPUT"]);
});

test("REASONING: the committed reasoning keeps its text when the runaway is cut off, and the next script runs", async () => {
  const promptConfig: PromptConfig = {
    ...DEFAULT_PROMPT_CONFIG,
    reasoningParse: { autoParse: true, prefix: THINK_PREFIX_DEFAULT, suffix: THINK_SUFFIX_DEFAULT },
  };
  await using room = await openRoom("REASONING", `${THINK_PREFIX_DEFAULT}${NEAR_MISS}${THINK_SUFFIX_DEFAULT}Done.`, { promptConfig });

  const outcome = await send(room, "Go on.");

  expect(outcome.messages.find((message) => message.role === "assistant")?.reasoning).toBe(FOLLOWED);
  expect(room.timeouts().map((t) => t.placement)).toEqual(["REASONING"]);
});

test("WORLD_INFO: a fired entry reaches the prompt with its text when the runaway is cut off, and the next script runs", async () => {
  await using room = await openRoom("WORLD_INFO", "Noted.");
  const book = await room.h.caller.worldInfo.createBook({ input: createBookSchema.parse({ name: "Lamps" }) });
  await room.h.caller.worldInfo.createEntry({ bookId: book.id, input: createEntrySchema.parse({ title: "Lamp", content: NEAR_MISS, keys: ["lamp"] }) });
  await room.h.caller.worldInfo.attachToChat({ chatId: room.h.chatId, bookId: book.id });

  const { newest } = await appendedBy(room.bodies, () => send(room, "Light the lamp."));

  expect(newest).toContain(FOLLOWED);
  expect(room.timeouts().map((t) => t.placement)).toEqual(["WORLD_INFO"]);
});

test("PROMPT_HISTORY: the runaway is cut off once and evicted for the build, however many rows it would have run on", async () => {
  await using room = await openRoom("PROMPT_HISTORY", "Noted.", { transcript: [NEAR_MISS, NEAR_MISS, NEAR_MISS] });

  const { newest } = await appendedBy(room.bodies, () => send(room, "Go on."));

  expect(newest.split(FOLLOWED)).toHaveLength(4);
  expect(room.timeouts().map((t) => t.placement)).toEqual(["PROMPT_HISTORY"]);
});

test("a preview build runs the history leg under the same watchdog the turn does", async () => {
  await using room = await openRoom("PROMPT_HISTORY", "Noted.", { transcript: [NEAR_MISS] });

  const fit = await room.h.caller.chat.previewContextFit({ chatId: room.h.chatId });

  expect(fit).toBeDefined();
  expect(room.timeouts()).toEqual([{ placement: "PROMPT_HISTORY", message: expect.stringContaining("preview build") }]);
});

// A library of runaways costs one pass budget, not scripts times the deadline: a few are stopped at the row deadline,
// then the budget is spent and every script after them, the follower included, is skipped and reported as such.
const BUDGET_LEGS = [
  { placement: "USER_INPUT", act: (room: Room): Promise<unknown> => send(room, NEAR_MISS), reply: "Noted." },
  { placement: "AI_OUTPUT", act: (room: Room): Promise<unknown> => send(room, "Go on."), reply: NEAR_MISS },
] as const satisfies readonly { readonly placement: RegexPlacement; readonly act: (room: Room) => Promise<unknown>; readonly reply: string }[];

test.for(BUDGET_LEGS)(
  "$placement: a library of runaways stops at the pass budget, each script named",
  { tags: ["slow"] },
  async ({ placement, act, reply }) => {
    await using room = await openRoom(placement, reply, { runaways: RUNAWAY_LIBRARY });

    await act(room);

    const stops = room.stops();
    expect(stops).toHaveLength(RUNAWAY_LIBRARY + 1);
    expect(stops).toContain(WATCHDOG_TIMEOUT);
    expect(stops.at(-1)).toBe(REGEX_PASS_BUDGET_SPENT);
  },
);

test("PROMPT_HISTORY: a library of runaways over many rows stops at the history budget, each script named once", { tags: ["slow"] }, async () => {
  await using room = await openRoom("PROMPT_HISTORY", "Noted.", { runaways: RUNAWAY_LIBRARY, transcript: [NEAR_MISS, NEAR_MISS, NEAR_MISS] });

  await send(room, "Go on.");

  const stops = room.stops();
  expect(stops).toHaveLength(RUNAWAY_LIBRARY + 1);
  expect(stops).toContain(WATCHDOG_TIMEOUT);
  expect(stops).toContain(REGEX_PASS_BUDGET_SPENT);
});
