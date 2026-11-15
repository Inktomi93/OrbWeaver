// An honest preset is never cut short by the regex guards (D53). A synthetic script set shaped like the server side of
// a public HUD preset (21 scripts with its find lengths, capture groups and block strips; never the file itself) runs
// whole on every server leg through that leg's production entry, on a 40,000-character text or a 300-row history, on
// the first run in the process (each leg's patterns are its own, so V8 has compiled none of them) and again warm. The
// two derivation cases pin each pass budget at ten times what this set costs.
// @subject packages/server/src/primitives/regex/index.ts
// @subject packages/server/src/entry/compose/chat.ts
// @subject packages/server/src/domain/chat/assembly/context.ts
// @subject packages/server/src/domain/chat/assembly/history-regex.ts
// @subject packages/server/src/domain/chat/engine/pipeline.ts
// @subject packages/server/src/domain/chat/verbs/edit.ts

import process from "node:process";
import type { PromptConfig } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG, THINK_PREFIX_DEFAULT, THINK_SUFFIX_DEFAULT } from "@orb/contracts/preset";
import { createRegexScriptSchema } from "@orb/contracts/regex";
import { createBookSchema, createEntrySchema, updateEntrySchema } from "@orb/contracts/world-info";
import type { RegexPlacement, RegexScriptInput } from "@orb/kit/regex";
import { deriveRegexHistoryDepth, deriveRegexTierFlags } from "@orb/kit/regex";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { appendedBy } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_PROVIDER_ENDPOINT,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
  readRoomCanon,
} from "@orb/testkit/node/composed";
import { vi } from "vitest";
import { z } from "zod";
import { openRegexPass, REGEX_TEXT_PASS_BUDGET_MS, regexHistoryPassBudgetMs } from "#server/primitives/regex/index.ts";

// The real file's 21 server-side scripts: find length, capture groups, and whether it strips a tagged block lazily
// (`<tag>[\s\S]*?</tag>`) or matches a bracketed alternation.
const REAL_SHAPE = [
  [655, 0, false],
  [31, 0, true],
  [172, 3, true],
  [41, 1, true],
  [45, 1, true],
  [25, 0, true],
  [25, 0, true],
  [70, 0, false],
  [39, 0, false],
  [49, 0, false],
  [28, 0, true],
  [155, 0, false],
  [64, 0, false],
  [68, 0, false],
  [279, 2, false],
  [32, 0, true],
  [31, 0, true],
  [165, 3, false],
  [263, 3, false],
  [33, 0, true],
  [39, 0, true],
] as const satisfies readonly (readonly [findLength: number, groups: number, lazyBlock: boolean])[];

const SLASH_AND_FLAGS = "//g".length;

// Optional pads of two and three characters, so any remaining length of two or more is reachable.
function pad(room: number): string {
  const threes = room % 2;
  return `${"\\n?".repeat(threes)}${" ?".repeat((room - 3 * threes) / 2)}`;
}

/** Script `k`'s find pattern. `salt` is two letters, so every leg (and every cold measurement) compiles its own. */
function realShapedFind(salt: string, k: number): string {
  const [length, groups, lazy] = REAL_SHAPE[k] ?? REAL_SHAPE[0];
  const tag = `${salt}${String(k)}`;
  const captures = "(\\n?)".repeat(groups);
  const source = length - SLASH_AND_FLAGS;
  let built: string;
  if (lazy) {
    const dotAll = `<${tag}>[\\s\\S]*?<\\/${tag}>${captures}`;
    // One character short of a pad: the shorter spelling of the same any-character run makes room for one.
    const head = source - dotAll.length === 1 ? `<${tag}>[^]*?<\\/${tag}>${captures}` : dotAll;
    built = `/${head}${pad(source - head.length)}/g`;
  } else {
    const head = `\\[${tag}(?:x`;
    const close = `)\\]${captures}`;
    let words = "";
    for (let w = 0; head.length + words.length + close.length + `|${salt}w${String(w)}`.length <= source; w += 1) {
      words += `|${salt}w${String(w)}`;
    }
    built = `/${head}${"x".repeat(source - head.length - words.length - close.length)}${words}${close}/g`;
  }
  if (built.length !== length) {
    throw new Error(`script ${String(k)} built at ${String(built.length)} characters, not ${String(length)}`);
  }
  return built;
}

/** One block per script, each matched by exactly its own script. */
function realShapedBlocks(salt: string): string {
  return REAL_SHAPE.map(([, , lazy], k) =>
    lazy ? `<${salt}${String(k)}>Mood: calm\nPlace: canal</${salt}${String(k)}>\n` : `[${salt}${String(k)}${salt}w0]\n`,
  ).join("");
}

const PROSE = "The rain had not stopped since morning. She pulled her coat tighter and walked past the closed stalls. ";
const LONG_TEXT_CHARS = 40_000;
const HISTORY_ROWS = 300;
const WIDE_WINDOW_TOKENS = 1_000_000;
const longText = (salt: string): string => `${PROSE.repeat(Math.ceil(LONG_TEXT_CHARS / PROSE.length)).slice(0, LONG_TEXT_CHARS)}${realShapedBlocks(salt)}`;
const historyRow = (salt: string, r: number): string => `Row ${String(r)}. ${PROSE.repeat(4)}${realShapedBlocks(salt)}`;
const LOG_FIELDS = z.record(z.string(), z.unknown());

interface Room extends AsyncDisposable {
  readonly h: ChatRoot;
  readonly bodies: string[];
  /** Every script the server reported as not applied: stopped, skipped, or failed to compile. */
  readonly notApplied: () => readonly unknown[];
}

async function openRoom(
  salt: string,
  placement: Exclude<RegexPlacement, "DISPLAY">,
  options: { readonly reply: string; readonly promptConfig?: PromptConfig; readonly transcript?: readonly string[]; readonly runOnEdit?: boolean },
): Promise<Room> {
  const bodies: string[] = [];
  const wire = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: (body) => {
      bodies.push(body);
      return options.reply;
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
  // A window that holds the whole 300-row history and the 40,000-character entry, so every row and the entry reach
  // their leg instead of being fitted out of the prompt.
  const wide = await h.root.services.connection.create({
    principal: h.owner,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: CORPUS_TEXT_MODEL,
    allowBackground: true,
    declared: { kind: "generation", generation: { input: ["text"], context: { window: WIDE_WINDOW_TOKENS } }, features: { detectServer: false } },
  });
  await h.root.services.connection.setBinding({ principal: h.owner, task: "chat", connectionId: wide.id });
  const placements = [placement];
  const historyDepth = deriveRegexHistoryDepth(placements, undefined);
  for (const k of REAL_SHAPE.keys()) {
    const row = await h.caller.regex.createScript({
      input: createRegexScriptSchema.parse({
        name: `real-shaped ${String(k)}`,
        findRegex: realShapedFind(salt, k),
        replaceString: "",
        placement: placements,
        ...deriveRegexTierFlags(placements),
        ...(historyDepth === undefined ? {} : { historyDepth }),
        ...(options.runOnEdit === true ? { runOnEdit: true } : {}),
      }),
    });
    await h.caller.regex.attachGlobal({ scriptId: row.id });
  }
  const warn = vi.spyOn(h.root.logger, "warn").mockImplementation(() => undefined);
  construction.defer(() => warn.mockRestore());
  const notApplied = (): unknown[] =>
    warn.mock.calls.flatMap(([payload]) => {
      const fields = LOG_FIELDS.safeParse(payload).data ?? {};
      return fields["findRegex"] === undefined ? [] : [fields["err"]];
    });
  const lifetime = construction.move();
  return { h, bodies, notApplied, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}

async function send(room: Room, content: string): ReturnType<ChatRoot["caller"]["chat"]["send"]> {
  return await room.h.caller.chat.send({ chatId: room.h.chatId, content, timeZone: UTC_TIME_ZONE });
}

async function newestPrompt(room: Room, content: string): Promise<string> {
  return (await appendedBy(room.bodies, () => send(room, content))).newest;
}

type ServerLeg = Exclude<RegexPlacement, "DISPLAY">;

interface LegCase {
  readonly placement: ServerLeg;
  readonly salt: string;
  readonly open: (salt: string) => Promise<Room>;
  /** One run of the leg; answers the text the leg produced. */
  readonly run: (room: Room, salt: string) => Promise<string>;
}

const REASONING_CONFIG: PromptConfig = {
  ...DEFAULT_PROMPT_CONFIG,
  reasoningParse: { autoParse: true, prefix: THINK_PREFIX_DEFAULT, suffix: THINK_SUFFIX_DEFAULT },
};

/** Answers its argument; a table that leaves a server leg without a case does not compile. */
function everyServerLeg<const T extends readonly LegCase[]>(legs: T & ([Exclude<ServerLeg, T[number]["placement"]>] extends [never] ? unknown : never)): T {
  return legs;
}

const HISTORY_LEG = {
  placement: "PROMPT_HISTORY",
  salt: "ph",
  open: (salt) => openRoom(salt, "PROMPT_HISTORY", { reply: "Noted.", transcript: Array.from({ length: HISTORY_ROWS }, (_, r) => historyRow(salt, r)) }),
  run: (room) => newestPrompt(room, "Go on."),
} as const satisfies LegCase;

const LEGS = everyServerLeg([
  {
    placement: "USER_INPUT",
    salt: "ui",
    open: (salt) => openRoom(salt, "USER_INPUT", { reply: "Noted." }),
    run: async (room, salt) => (await send(room, longText(salt))).messages.find((message) => message.role === "user")?.content ?? "",
  },
  {
    placement: "AI_OUTPUT",
    salt: "ao",
    open: (salt) => openRoom(salt, "AI_OUTPUT", { reply: longText(salt) }),
    run: async (room) => (await send(room, "Go on.")).messages.find((message) => message.role === "assistant")?.content ?? "",
  },
  {
    placement: "REASONING",
    salt: "re",
    open: (salt) =>
      openRoom(salt, "REASONING", { reply: `${THINK_PREFIX_DEFAULT}${longText(salt)}${THINK_SUFFIX_DEFAULT}Done.`, promptConfig: REASONING_CONFIG }),
    run: async (room) => (await send(room, "Go on.")).messages.find((message) => message.role === "assistant")?.reasoning ?? "",
  },
  {
    placement: "WORLD_INFO",
    salt: "wi",
    open: async (salt) => {
      const room = await openRoom(salt, "WORLD_INFO", { reply: "Noted." });
      const book = await room.h.caller.worldInfo.createBook({ input: createBookSchema.parse({ name: "Lamps" }) });
      const entry = await room.h.caller.worldInfo.createEntry({
        bookId: book.id,
        input: createEntrySchema.parse({ title: "Lamp", content: longText(salt), keys: ["lamp"] }),
      });
      // The leg runs before the WI token budget; past the budget, so the entry reaches the prompt and shows what ran.
      await room.h.caller.worldInfo.updateEntry({ entryId: entry.id, input: updateEntrySchema.parse({ ignoreBudget: true }) });
      await room.h.caller.worldInfo.attachToChat({ chatId: room.h.chatId, bookId: book.id });
      return room;
    },
    run: (room) => newestPrompt(room, "Light the lamp."),
  },
  HISTORY_LEG,
]);

interface Outcome {
  readonly keptProse: boolean;
  readonly blockLeft: boolean;
  readonly notApplied: readonly unknown[];
}

// Every script ran: the prose is there, each script's block is gone, and none was reported as stopped or skipped.
const WHOLE: Outcome = { keptProse: true, blockLeft: false, notApplied: [] };

function outcomeOf(room: Room, out: string, salt: string): Outcome {
  return { keptProse: out.includes(PROSE), blockLeft: out.includes(`<${salt}`) || out.includes(`[${salt}`), notApplied: room.notApplied() };
}

test.for(LEGS)("$placement: the real-shaped set runs whole, cold and warm", { tags: ["slow"] }, async (leg) => {
  await using room = await leg.open(leg.salt);

  const cold = outcomeOf(room, await leg.run(room, leg.salt), leg.salt);
  const warm = outcomeOf(room, await leg.run(room, leg.salt), leg.salt);

  expect([cold, warm]).toEqual([WHOLE, WHOLE]);
});

test("PROMPT_HISTORY: every one of the rows reaches the leg", { tags: ["slow"] }, async () => {
  await using room = await HISTORY_LEG.open("pr");

  const prompt = await HISTORY_LEG.run(room);

  expect(prompt).toContain("Row 0. ");
  expect(prompt).toContain(`Row ${String(HISTORY_ROWS - 1)}. `);
  expect(outcomeOf(room, prompt, "pr")).toEqual(WHOLE);
});

test("the edit re-apply: the real-shaped set runs whole, cold and warm", { tags: ["slow"] }, async () => {
  const salt = "ed";
  await using room = await openRoom(salt, "AI_OUTPUT", { reply: "Noted.", transcript: ["seed"], runOnEdit: true });
  const [slot] = await readRoomCanon(room.h.root, room.h.owner, room.h.chatId);
  if (slot === undefined) {
    throw new Error("the transcript import wrote no assistant slot");
  }

  const edit = async (): Promise<Outcome> =>
    outcomeOf(
      room,
      (await room.h.root.services.chat.editMessage({ principal: room.h.owner, chatId: room.h.chatId, messageId: slot.id, content: longText(salt) })).content,
      salt,
    );
  const cold = await edit();
  const warm = await edit();

  expect([cold, warm]).toEqual([WHOLE, WHOLE]);
});

// Thread CPU, not wall time: a loaded host stretches wall time but not the work this thread did. Contention still adds
// some (shared caches, a sibling hyperthread), never removes it, so each derivation takes the cheapest of several
// passes, each over patterns no earlier pass compiled: every pass is a cold first run.
const COLD_PASSES = ["c0", "c1", "c2", "c3", "c4"] as const;
const CTX = { char: "Aria", user: "Bob", persona: "", scenario: "", env: {} };

function realShapedSet(salt: string, placement: RegexPlacement): RegexScriptInput[] {
  return REAL_SHAPE.map((_, k) => ({ enabled: true, placement: [placement], findRegex: realShapedFind(salt, k), replaceString: "" }));
}

interface ColdPass {
  readonly cpuMs: number;
  /** Every output the pass produced still holding one of its scripts' blocks; empty when the set ran whole. */
  readonly blocksLeft: readonly string[];
}

// Only the pass itself is timed: its texts and scripts are built before, and its outputs checked after.
function cheapestColdPass(placement: RegexPlacement, textsOf: (salt: string) => readonly string[]): ColdPass {
  const passes = COLD_PASSES.map((salt): ColdPass => {
    const texts = textsOf(salt);
    const scripts = realShapedSet(salt, placement);
    const pass = openRegexPass(Number.POSITIVE_INFINITY);
    const before = process.threadCpuUsage();
    const outs = texts.map((text, depth) => pass.execute({ text, scripts, placement, depth, ctx: CTX }));
    const used = process.threadCpuUsage(before);
    return { cpuMs: (used.user + used.system) / 1000, blocksLeft: outs.filter((out) => out.includes(`<${salt}`) || out.includes(`[${salt}`)) };
  });
  return {
    cpuMs: Math.min(...passes.map((pass) => pass.cpuMs)),
    blocksLeft: passes.flatMap((pass) => pass.blocksLeft),
  };
}

test("the text pass budget carries ten times what the real-shaped set costs cold on a 40,000-character text", () => {
  const cold = cheapestColdPass("AI_OUTPUT", (salt) => [longText(salt)]);

  expect(cold.blocksLeft).toEqual([]);
  expect(REGEX_TEXT_PASS_BUDGET_MS).toBeGreaterThanOrEqual(10 * cold.cpuMs);
});

test("the history budget carries ten times what the real-shaped set costs cold per row", () => {
  const rows = 500;
  const cold = cheapestColdPass("PROMPT_HISTORY", (salt) => Array.from({ length: rows }, (_, r) => historyRow(salt, r)));

  expect(cold.blocksLeft).toEqual([]);
  // Read past the floor, so the per-row allowance itself is what is pinned.
  const allowancePerRow = regexHistoryPassBudgetMs(rows * 1000) / (rows * 1000);
  expect(allowancePerRow).toBeGreaterThanOrEqual(10 * (cold.cpuMs / rows));
});
