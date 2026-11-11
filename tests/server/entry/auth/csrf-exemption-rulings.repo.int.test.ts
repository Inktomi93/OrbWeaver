// @subject packages/server/src/entry/auth/csrf-exemptions.ts
// Every CSRF exemption rests on a ruling, by construction: each `CSRF_EXEMPT_ROUTES` entry cites a law or ledger file
// and the exact sentence in it that rules the exemption. The sentence must open with the entry's own method and path
// and stand in the file word for word, at the start of a sentence, so a sentence that only mentions the route or
// states the opposite never admits it. A proof case alone never admits an entry.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CSRF_EXEMPT_ROUTES } from "@orb/server/entry/auth";
import { expect, test } from "@orb/testkit/tooling";

const SENTENCE_END = ".";

/** Does `markdown` hold `sentence` word for word, opening a sentence? Line wraps and indents read as one space. */
function statesSentence(markdown: string, sentence: string): boolean {
  const text = markdown.replaceAll(/\s+/gu, " ");
  for (let at = text.indexOf(sentence); at !== -1; at = text.indexOf(sentence, at + 1)) {
    const before = text.slice(0, at).trimEnd();
    if (before === "" || before.endsWith(SENTENCE_END)) {
      return true;
    }
  }
  return false;
}

test("each CSRF-exempt route cites a sentence of its ruling file that rules it, word for word", async ({ repoRoot }) => {
  const entries = Object.entries(CSRF_EXEMPT_ROUTES);
  expect(entries.length).toBeGreaterThan(0);
  for (const [key, { method, path, ruling }] of entries) {
    expect(ruling.sentence.startsWith(`\`${method} ${path}\` `), key).toBe(true);
    expect(statesSentence(await readFile(join(repoRoot, ruling.file), "utf8"), ruling.sentence), `${key} cites ${ruling.file}`).toBe(true);
  }
});

test("a sentence that names the route without ruling it admits nothing", () => {
  const entries = Object.values(CSRF_EXEMPT_ROUTES);
  expect(entries.length).toBeGreaterThan(0);
  for (const { method, path, ruling } of entries) {
    const route = `\`${method} ${path}\``;
    // The sentence itself, opening its paragraph: admitted.
    expect(statesSentence(ruling.sentence, ruling.sentence)).toBe(true);
    // The route named beside the words, in a sentence that states the opposite: refused.
    expect(statesSentence(`Unlike the other route, which carries no CSRF check, ${route} requires the header.`, ruling.sentence)).toBe(false);
    // The exact words, but inside another sentence that qualifies them: refused.
    expect(statesSentence(`It is false that ${ruling.sentence}`, ruling.sentence)).toBe(false);
  }
});
