// Every member's client asks for the context fit after each turn, and each fit passes the whole history through the
// host's prompt regex. Concurrent fits of one room share one run, a repeated fit of an unchanged room reuses the
// room's last prompt-history output, and an edit or a script change runs the pass again. The pass is observed through
// production's own failure log: a history script that does not compile is reported once per pass it runs in.
// @subject packages/server/src/domain/chat/verbs/read.ts
// @subject packages/server/src/domain/chat/assembly/history-regex.ts
// @subject packages/server/src/domain/chat/substrate/single-flight.ts
// @subject packages/server/src/domain/chat/substrate/prompt-history-memo.ts
import type { ContextFitAnswer } from "@orb/contracts/chat";
import { createRegexScriptSchema } from "@orb/contracts/regex";
import { SubstituteFindRegex } from "@orb/kit/regex";
import { UTC_TIME_ZONE } from "@orb/kit/time";
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

// A find that never compiles: the leg reports it, then evicts it for the rest of that pass, so one report is one pass.
const BROKEN = "(unclosed";
// The same failure behind a macro: a set that renders a macro cannot be reused, so only the shared run bounds it.
const BROKEN_WITH_MACRO = "({{char}}";
// A script whose work the fit can see: it strips a long aside from every history row.
const ASIDE = ` [aside: ${"the lamps along the canal flickered one by one ".repeat(40)}]`;
const STRIPPER = { findRegex: "/ \\[aside: [^\\]]*\\]/g", replaceString: "" } as const;
const HISTORY_AXES = { targets: ["USER_INPUT", "AI_OUTPUT"], passes: ["prompt"] } as const;
const LOG_FIELDS = z.record(z.string(), z.unknown());
const CONCURRENT_FITS = 6;

interface Room extends AsyncDisposable {
  readonly h: ChatRoot;
  /** How many history passes have reported the broken script. */
  readonly passes: () => number;
  readonly fit: (signal?: AbortSignal) => Promise<ContextFitAnswer>;
}

async function openRoom(broken: { readonly findRegex: string; readonly substituteRegex: SubstituteFindRegex }): Promise<Room> {
  const wire = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "Noted.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using construction = new AsyncDisposableStack();
  const h = construction.use(
    await createChatRoot({
      providerFetch: wire.execute,
      memoryEnabled: false,
      transcript: Array.from({ length: 8 }, (_, i) => ({ role: "assistant" as const, content: `Reply ${String(i)}.${ASIDE}` })),
    }),
  );
  for (const [name, script] of [
    ["broken", { ...broken, replaceString: "" }],
    ["stripper", STRIPPER],
  ] as const) {
    const row = await h.caller.regex.createScript({ input: createRegexScriptSchema.parse({ name, ...script, ...HISTORY_AXES }) });
    await h.caller.regex.attachGlobal({ scriptId: row.id });
  }
  const warn = vi.spyOn(h.root.logger, "warn");
  construction.defer(() => warn.mockRestore());
  const passes = (): number =>
    warn.mock.calls.filter(([payload]) => {
      const fields = LOG_FIELDS.safeParse(payload).data ?? {};
      return fields["pass"] === "prompt" && fields["findRegex"] === broken.findRegex;
    }).length;
  const fit = async (signal = new AbortController().signal): Promise<ContextFitAnswer> =>
    await h.root.services.chat.previewContextFit({ principal: h.owner, chatId: h.chatId, signal });
  const lifetime = construction.move();
  return { h, passes, fit, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}

function usedTokens(answer: ContextFitAnswer): number {
  if ("unbound" in answer) {
    throw new Error("the room's host has no chat connection, so the fit has no numbers");
  }
  return answer.usedTokens;
}

test("two fits of an unchanged room run the history pass once, and an edit or a script change runs it again", async () => {
  await using room = await openRoom({ findRegex: BROKEN, substituteRegex: SubstituteFindRegex.none });

  const first = await room.fit();
  expect(room.passes()).toBe(1);
  const second = await room.fit();
  expect(room.passes()).toBe(1);
  // The reused output prices the same: the second fit is the first, number for number.
  expect(second).toEqual(first);

  const stripper = (await room.h.caller.regex.listScripts()).find((script) => script.name === "stripper");
  if (stripper === undefined) {
    throw new Error("the stripper script did not land");
  }
  await room.h.caller.regex.detachGlobal({ scriptId: stripper.id });
  const unstripped = await room.fit();
  expect(room.passes()).toBe(2);
  // Without the stripper every aside reaches the prompt, so the reused output would have priced the history low.
  expect(usedTokens(unstripped)).toBeGreaterThan(usedTokens(first));

  const [oldest] = (await room.h.root.services.chat.listMessages({ principal: room.h.owner, chatId: room.h.chatId })).messages;
  if (oldest === undefined) {
    throw new Error("the room's transcript is empty");
  }
  await room.h.root.services.chat.editMessage({
    principal: room.h.owner,
    chatId: room.h.chatId,
    messageId: oldest.id,
    content: "Edited.",
    timeZone: UTC_TIME_ZONE,
  });
  await room.fit();
  expect(room.passes()).toBe(3);
});

test("concurrent fits of one room share one run, even for a script set that renders a macro and is never reused", async () => {
  await using room = await openRoom({ findRegex: BROKEN_WITH_MACRO, substituteRegex: SubstituteFindRegex.raw });

  const fits = await Promise.all(Array.from({ length: CONCURRENT_FITS }, () => room.fit()));
  expect(room.passes()).toBe(1);
  expect(new Set(fits.map((answer) => JSON.stringify(answer))).size).toBe(1);

  // Positive control: a macro set is never reused, so the next fit, alone, runs the pass again.
  await room.fit();
  expect(room.passes()).toBe(2);
});

test("a fit whose caller leaves stops waiting, and the run it shared still answers the caller that stayed", async () => {
  await using room = await openRoom({ findRegex: BROKEN_WITH_MACRO, substituteRegex: SubstituteFindRegex.raw });
  const leaving = new AbortController();
  const reason = new Error("the member closed the room");

  const left = room.fit(leaving.signal);
  const stayed = room.fit();
  leaving.abort(reason);

  await expect(left).rejects.toBe(reason);
  expect(usedTokens(await stayed)).toBeGreaterThan(0);
  expect(room.passes()).toBe(1);
});
