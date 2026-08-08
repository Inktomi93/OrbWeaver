// Unit pins for the stage-parse seam: the null-drop belt (strict-compatible survival), the stripped-key
// capture diff (incl. nested paths), and the planted POSITIVE CONTROL (a clean payload strips nothing —
// a diff that cannot return empty would flag every run).

import { z } from "zod";
import { buildStageParse, diffKeyPaths } from "../../../../../packages/server/src/domain/refinery/substrate/stage-parse.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const SCHEMA = z.object({
  keep: z.string(),
  maybe: z.number().optional(),
  nested: z.object({ inner: z.string() }),
});

test("dropNullValues runs BEFORE validation: an explicit null on an optional field parses", () => {
  const parse = buildStageParse(SCHEMA);
  const parsed = parse.schema.parse({ keep: "k", maybe: null, nested: { inner: "i" } });
  expect(parsed).toEqual({ keep: "k", nested: { inner: "i" } });
  // A dropped null is NOT itemized (capture-after-drop, deliberate): it is strict-compatible's own
  // encoding of ABSENT — itemizing it would stamp every legitimate run on that deployment and drown
  // the tamper signal. Only schema-unknown keys itemize.
  expect(parse.strippedKeysOf(parsed)).toEqual([]);
});

test("invented keys are itemized as dotted paths (nested + top-level); a clean payload strips NOTHING (positive control)", () => {
  const parse = buildStageParse(SCHEMA);
  const parsed = parse.schema.parse({ keep: "k", junk: 1, nested: { inner: "i", deep: { x: 2 } } });
  expect(parse.strippedKeysOf(parsed)).toEqual(["junk", "nested.deep"]);

  const clean = buildStageParse(SCHEMA);
  const cleanParsed = clean.schema.parse({ keep: "k", maybe: 3, nested: { inner: "i" } });
  expect(clean.strippedKeysOf(cleanParsed)).toEqual([]);
});

test("diffKeyPaths walks arrays positionally", () => {
  expect(diffKeyPaths([{ a: 1, b: 2 }], [{ a: 1 }])).toEqual(["0.b"]);
});
