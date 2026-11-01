// A preset's RECEIVE switches shape the committed reply through a real turn, and a long blank run costs its length.
// @subject packages/server/src/primitives/post-process/index.ts

import type { PromptConfig } from "@orb/contracts/preset";
import { makePromptConfig } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { coreHttpRoom, coreProse } from "./core-physical.ts";

const RUN = 240_000;
const TURN_BUDGET_MS = 8000;

type PostProcess = NonNullable<PromptConfig["postProcess"]>;

const OFF = { collapseNewlines: false, trimTrailingWhitespace: false, dropIncompleteSentence: false, singleLine: false } as const satisfies PostProcess;

async function committed(reply: string, flags: Partial<PostProcess>): Promise<string | undefined> {
  await using h = await coreHttpRoom([(): Response => coreProse(reply)], { promptConfig: makePromptConfig({ postProcess: { ...OFF, ...flags } }) });
  const outcome = await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId });
  return outcome.messages[0]?.content;
}

test.each([
  ["trailing blanks of every kind go", "Done. \t\n ", { trimTrailingWhitespace: true }, "Done."],
  ["no-break and byte-order spaces are whitespace", "Done.\u00A0\uFEFF", { trimTrailingWhitespace: true }, "Done."],
  ["inner and leading blanks stay", "  a  b  \n", { trimTrailingWhitespace: true }, "  a  b"],
  ["an unfinished sentence drops", "One. Two and", { dropIncompleteSentence: true }, "One."],
  ["a closer stays with the last complete sentence", 'One." Two and', { dropIncompleteSentence: true }, 'One."'],
  ["a trailing blank does not make a sentence unfinished", "One. Two.  ", { dropIncompleteSentence: true }, "One. Two.  "],
  ["a fragment with no sentence end stays", "a fragment", { dropIncompleteSentence: true }, "a fragment"],
  ["single line keeps the first line and trims it", "First line  \nsecond", { singleLine: true }, "First line"],
  ["single line skips leading blank lines", "\n\nFirst line\nsecond", { singleLine: true }, "First line"],
] as const)("%s", async (_name, reply, flags, expected) => {
  expect(await committed(reply, flags)).toBe(expected);
});

test("a long blank run that ends no line costs its length through a real turn", async () => {
  const reply = `Scene${" ".repeat(RUN)}x`;
  const started = performance.now();
  expect(await committed(reply, { trimTrailingWhitespace: true, dropIncompleteSentence: true })).toBe(reply);
  expect(performance.now() - started).toBeLessThan(TURN_BUDGET_MS);
});
