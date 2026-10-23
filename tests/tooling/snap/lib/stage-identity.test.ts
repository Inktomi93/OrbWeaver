// The stage identity readers: the clone flag survives, and anything off-grammar is null rather than half-read.

import { expect, test } from "@orb/testkit/tooling";
import { parseStageBoundIdentity, parseStageDbProvenance } from "../../../../tooling/src/snap/lib/stage-identity.ts";

const PROVENANCE = { copiedFrom: "/box/prod.db", copiedAt: "2026-10-11T10:00:00.000Z", devDbMtimeAtCopy: "2026-10-11T09:00:00.000Z" };

test("db provenance keeps the clone flag when set, omits it for a dev-db copy, and is null when a field is missing", () => {
  expect(parseStageDbProvenance({ ...PROVENANCE, cloned: true })).toEqual({ ...PROVENANCE, cloned: true });
  expect(parseStageDbProvenance({ ...PROVENANCE, cloned: false })).toEqual(PROVENANCE);
  expect(parseStageDbProvenance({ copiedFrom: "/box/prod.db" })).toBeNull();
  expect(parseStageDbProvenance("nope")).toBeNull();
});

test("a bound identity needs its boot, tree and a readable-or-null provenance", () => {
  const bound = { sha: "a".repeat(40), dir: "/stage/a", startedAt: PROVENANCE.copiedAt, dbProvenance: null };
  expect(parseStageBoundIdentity(bound)).toEqual(bound);
  expect(parseStageBoundIdentity({ ...bound, dbProvenance: { ...PROVENANCE, cloned: true } })?.dbProvenance).toEqual({ ...PROVENANCE, cloned: true });
  expect(parseStageBoundIdentity({ ...bound, dbProvenance: { copiedFrom: "/x" } })).toBeNull();
  expect(parseStageBoundIdentity({ ...bound, startedAt: 1 })).toBeNull();
  expect(parseStageBoundIdentity(null)).toBeNull();
});
