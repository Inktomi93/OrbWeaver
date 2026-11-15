// A host script cannot make a committed message, or a turn's compile, grow without bound (D53). Through a real send:
// a replacement that splices its capture many times, and a chain of scripts that each double the reply, stop at the
// pass's output bound; a raw-mode find that pulls a card's prose field into its pattern is refused before it compiles.
// Each refusal is named by its code through the server's failure sink, the text keeps what it had, and the next script
// still runs.
// @subject packages/kit/src/regex/index.ts
// @subject packages/server/src/primitives/regex/index.ts

import { createCharacterSchema } from "@orb/contracts/character";
import type { CreateRegexScriptInput } from "@orb/contracts/regex";
import { createRegexScriptSchema, MAX_REPLACE_LENGTH } from "@orb/contracts/regex";
import { deriveRegexTierFlags, REGEX_OUTPUT_TOO_LONG, REGEX_SUBSTITUTION_TOO_LONG, SubstituteFindRegex } from "@orb/kit/regex";
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

const PLACEMENT = ["AI_OUTPUT"] as const;
const PROSE = "The rain had not stopped since morning. She pulled her coat tighter. ";
const REPLY = PROSE.repeat(44);
const FOLLOWER = { name: "follower", findRegex: "/rain/g", replaceString: "snow" } as const;
const WHOLE_REPLY = "/([\\s\\S]+)/";
const LOG_FIELDS = z.record(z.string(), z.unknown());

interface Room extends AsyncDisposable {
  readonly h: ChatRoot;
  /** The code of every script the server reported as not applied, in order. */
  readonly notApplied: () => readonly unknown[];
}

async function openRoom(
  reply: string,
  scripts: readonly (Pick<CreateRegexScriptInput, "name" | "findRegex" | "replaceString"> & Partial<Pick<CreateRegexScriptInput, "substituteRegex">>)[],
  description = "",
): Promise<Room> {
  const wire = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: () => reply,
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using construction = new AsyncDisposableStack();
  const h = construction.use(
    await createChatRoot({
      providerFetch: wire.execute,
      memoryEnabled: false,
      characters: [createCharacterSchema.parse({ handle: "aria", name: "Aria", description })],
    }),
  );
  for (const script of scripts) {
    const row = await h.caller.regex.createScript({
      input: createRegexScriptSchema.parse({ ...script, placement: [...PLACEMENT], ...deriveRegexTierFlags(PLACEMENT) }),
    });
    await h.caller.regex.attachGlobal({ scriptId: row.id });
  }
  const warn = vi.spyOn(h.root.logger, "warn").mockImplementation(() => undefined);
  construction.defer(() => warn.mockRestore());
  const notApplied = (): unknown[] =>
    warn.mock.calls.flatMap(([payload]) => {
      const fields = LOG_FIELDS.safeParse(payload).data ?? {};
      const err = fields["err"];
      if (fields["findRegex"] === undefined) {
        return [];
      }
      return [typeof err === "object" && err !== null && "code" in err ? err.code : err];
    });
  const lifetime = construction.move();
  return { h, notApplied, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}

async function committedReply(room: Room): Promise<string> {
  const outcome = await room.h.caller.chat.send({ chatId: room.h.chatId, content: "Go on.", timeZone: UTC_TIME_ZONE });
  return outcome.messages.find((message) => message.role === "assistant")?.content ?? "";
}

test("a replacement that splices the reply into itself many times is refused, and the reply commits as written", { tags: ["slow"] }, async () => {
  // The longest template storage admits, every token a splice of the whole reply.
  const amplifier = { name: "amplifier", findRegex: WHOLE_REPLY, replaceString: "$1".repeat(MAX_REPLACE_LENGTH / 2) };
  await using room = await openRoom(REPLY, [amplifier, FOLLOWER]);

  const committed = await committedReply(room);

  expect(room.notApplied()).toEqual([REGEX_OUTPUT_TOO_LONG]);
  expect(committed).toBe(REPLY.replaceAll("rain", "snow"));
});

test("a chain of scripts that each double the reply stops at the bound the reply entered the pass with", { tags: ["slow"] }, async () => {
  const doublings = 12;
  const chain = Array.from({ length: doublings }, (_, k) => ({ name: `double ${String(k)}`, findRegex: WHOLE_REPLY, replaceString: "$1$1" }));
  await using room = await openRoom(REPLY, chain);

  const committed = await committedReply(room);

  // Every doubling the bound admits applied; each one past it was refused by name. Measured from the reply as it
  // entered the pass, so the bound does not grow with each script.
  const refused = room.notApplied();
  expect(refused.length).toBeGreaterThan(0);
  expect(refused).toEqual(Array.from({ length: refused.length }, () => REGEX_OUTPUT_TOO_LONG));
  expect(committed).toHaveLength(REPLY.length * 2 ** (doublings - refused.length));
});

test("a raw-mode find that pulls a card's prose field into its pattern is refused; one that pulls the name runs", { tags: ["slow"] }, async () => {
  const prose = { name: "prose field", findRegex: "/{{description}}/g", replaceString: "X", substituteRegex: SubstituteFindRegex.raw };
  const name = { name: "name", findRegex: "/{{char}}/g", replaceString: "she", substituteRegex: SubstituteFindRegex.raw };
  // Compile-heavy pattern text with no match in prose: unbounded, it compiles on the event loop every turn.
  await using room = await openRoom("Aria looked up at the rain.", [prose, name], "(a|b)".repeat(600));

  const committed = await committedReply(room);

  expect(room.notApplied()).toEqual([REGEX_SUBSTITUTION_TOO_LONG]);
  expect(committed).toBe("she looked up at the rain.");
});
