// @subject tests/support/iso/corpus.ts
// The committed fixture must parse against the current published-corpus schema; a contract change that needs a
// republish fails here naming the field, before every corpus-backed case fails on a stale fixture.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { parseCorpusWire } from "../iso/corpus.ts";
import { expect, test } from "./fixtures.ts";

const COMMITTED_WIRE = fileURLToPath(new URL("./corpus-data/corpus.json", import.meta.url));

/** Every schema issue as `<dotted path>: <message>`, or none when the publication is current. */
function publicationIssues(serialized: string): readonly string[] {
  try {
    parseCorpusWire(serialized);
    return [];
  } catch (error) {
    if (!(error instanceof z.ZodError)) {
      throw error;
    }
    return error.issues.map((issue) => {
      const keys = issue.code === "unrecognized_keys" ? ` ${issue.keys.join(", ")}` : "";
      return `${issue.path.map(String).join(".") || "(root)"}: ${issue.message}${keys}`;
    });
  }
}

test("the committed corpus fixture parses against the current published-corpus schema; republish with `pnpm exec node scripts/corpus-fixture.ts publish`", () => {
  expect(publicationIssues(readFileSync(COMMITTED_WIRE, "utf8"))).toEqual([]);
});

test("a stale publication names the missing and the extra field", () => {
  const published = z.record(z.string(), z.json()).parse(JSON.parse(readFileSync(COMMITTED_WIRE, "utf8")));
  const { health: _health, ...withoutHealth } = published;
  expect(publicationIssues(JSON.stringify(withoutHealth))).toEqual([expect.stringMatching(/^health: /u)]);
  expect(publicationIssues(JSON.stringify({ ...published, retiredSection: true }))).toEqual([expect.stringMatching(/^\(root\): .*retiredSection$/u)]);
});
