import { defineVersionedConfig, tolerantArray } from "@orb/contracts/versioned-config";
import { z } from "zod";
import { expect, test } from "../../support/fixtures.ts";

// A 3-version config with a NON-IDEMPOTENT lift (appends to a counter) so we can prove the
// storedVersion-beats-probe invariant: re-running the lift would corrupt `count`.
const schema = z.object({ count: z.number(), label: z.string() });
type Cfg = z.infer<typeof schema>;
const DEFAULT: Cfg = { count: 0, label: "default" };

const config = defineVersionedConfig<Cfg>({
  schema,
  version: 3,
  default: DEFAULT,
  lifts: {
    // v1 → v2: introduce `count` (non-idempotent — bumps if already present).
    1: (c) => ({ ...c, count: typeof c["count"] === "number" ? c["count"] + 1 : 1 }),
    // v2 → v3: introduce `label`.
    2: (c) => ({ ...c, label: c["label"] ?? "lifted" }),
  },
});

test("parse returns the default for non-object / null / undefined input", () => {
  expect(config.parse(null)).toEqual(DEFAULT);
  expect(config.parse(undefined)).toEqual(DEFAULT);
  expect(config.parse("nope")).toEqual(DEFAULT);
  expect(config.parse(42)).toEqual(DEFAULT);
});

test("parse lifts an old blob up through every version in order", () => {
  // A v1 blob (schemaVersion 1) walks 1→2 (count→1) then 2→3 (label→lifted).
  expect(config.parse({ schemaVersion: 1 })).toEqual({ count: 1, label: "lifted" });
});

test("storedVersion beats the in-blob probe so non-idempotent lifts don't re-run", () => {
  // The blob is already at v3 (count=5) but its in-blob probe is absent → would probe as v1 and
  // re-run BOTH lifts (corrupting count to 6). Passing storedVersion=3 skips the lifts entirely.
  const current = { count: 5, label: "kept" };
  expect(config.parse(current, 3)).toEqual({ count: 5, label: "kept" });
  // Without the stored version, the probe defaults to v1 and the non-idempotent lift bumps count.
  expect(config.parse(current).count).toBe(6);
});

test("a garbage storedVersion falls back to the in-blob probe (doesn't poison the walk)", () => {
  // storedVersion 0 / non-int are ignored; the blob carries schemaVersion 3 → no lifts.
  const atV3 = { schemaVersion: 3, count: 9, label: "x" };
  expect(config.parse(atV3, 0)).toEqual({ count: 9, label: "x" });
  expect(config.parse(atV3, 1.5)).toEqual({ count: 9, label: "x" });
});

test("a lift returning a non-object, or a final blob failing the schema, degrades to default", () => {
  const broken = defineVersionedConfig<Cfg>({
    schema,
    version: 2,
    default: DEFAULT,
    // biome-ignore lint/suspicious/noExplicitAny: deliberately returns a non-object to test the guard.
    lifts: { 1: () => null as any },
  });
  expect(broken.parse({ schemaVersion: 1 })).toEqual(DEFAULT);
  // A blob at the current version whose fields fail the schema → default.
  expect(config.parse({ schemaVersion: 3, count: "not a number" })).toEqual(DEFAULT);
});

// #471 — `parse` cannot tell a caller whether it got the stored blob or a stand-in for one that could not
// be read, which is exactly the discriminator a read-modify-WRITE needs before it overwrites storage.
test("parseOutcome reports the value's provenance and names the failure", () => {
  expect(config.parseOutcome({ schemaVersion: 3, count: 5, label: "kept" })).toEqual({ intact: true, value: { count: 5, label: "kept" } });
  // A lifted blob is still the stored blob — lifting is not degrading.
  expect(config.parseOutcome({ schemaVersion: 1 })).toEqual({ intact: true, value: { count: 1, label: "lifted" } });

  expect(config.parseOutcome(null)).toEqual({ intact: false, value: DEFAULT, failure: "not-an-object" });
  expect(config.parseOutcome(undefined)).toEqual({ intact: false, value: DEFAULT, failure: "not-an-object" });
  // #1592 — a `schema-rejected` outcome carries the FIRST offending zod issue (dot-path + message), so a
  // caller can name which field blew the schema rather than the bare word.
  expect(config.parseOutcome({ schemaVersion: 3, count: "not a number" })).toEqual({
    intact: false,
    value: DEFAULT,
    failure: "schema-rejected",
    issue: { path: "count", message: "Invalid input: expected number, received string" },
  });

  const broken = defineVersionedConfig<Cfg>({
    schema,
    version: 2,
    default: DEFAULT,
    // biome-ignore lint/suspicious/noExplicitAny: deliberately returns a non-object to test the guard.
    lifts: { 1: () => null as any },
  });
  expect(broken.parseOutcome({ schemaVersion: 1 })).toEqual({ intact: false, value: DEFAULT, failure: "lift-broke-shape" });
});

test("parse is parseOutcome minus the provenance (the two can never disagree)", () => {
  for (const raw of [null, "nope", 42, { schemaVersion: 1 }, { schemaVersion: 3, count: 5, label: "kept" }, { schemaVersion: 3, count: "bad" }]) {
    expect(config.parse(raw)).toEqual(config.parseOutcome(raw).value);
  }
});

// #1364 — a blob written by a NEWER build has no lift (lifts only go forward), so the current non-strict
// schema simply STRIPPED every field this build never heard of and the parse SUCCEEDED. `intact: true` over
// a truncated blob is the #471 wipe class through a different door: the write seam round-trips the
// truncation. Read posture (header): serve the stripped value, refuse the write.
test("a NEWER-than-current blob is served but never reported intact (#1364)", () => {
  const outcome = config.parseOutcome({ schemaVersion: 9, count: 5, label: "kept", futureField: "written by a newer build" });
  expect(outcome.intact).toBe(false);
  expect(outcome).toMatchObject({ failure: "version-from-future" });
  // The SESSION stays usable — the value is the stored blob (minus what this build cannot represent), not
  // the default, so the user does not see "my settings reset".
  expect(outcome.value).toEqual({ count: 5, label: "kept" });
  // The storage column wins over the in-blob probe here exactly as it does for older versions.
  expect(config.parseOutcome({ count: 5, label: "kept" }, 9).intact).toBe(false);
  // A future blob the current schema cannot read at all still falls back to the default.
  expect(config.parseOutcome({ schemaVersion: 9, count: "not a number" })).toEqual({
    intact: false,
    value: DEFAULT,
    failure: "version-from-future",
  });
  // The CURRENT version is untouched by the comparison.
  expect(config.parseOutcome({ schemaVersion: 3, count: 5, label: "kept" }).intact).toBe(true);
});

// #1365 — `intact: true` cannot mean "the stored blob was fully read" while a leaf self-heals, so a
// collection leaf gets element-wise tolerance instead of a whole-array `.catch()`.
test("tolerantArray keeps every readable element and costs only the malformed ones (#1365)", () => {
  const rows = tolerantArray(z.object({ id: z.string() }), []);
  expect(rows.parse([{ id: "a" }, { id: 7 }, { id: "c" }])).toEqual([{ id: "a" }, { id: "c" }]);
  // The whole-collection fallback fires ONLY when there is no element-wise reading at all.
  expect(rows.parse("not an array")).toEqual([]);
  expect(tolerantArray(z.string(), ["fallback"]).parse(42)).toEqual(["fallback"]);
});

test("serialize round-trips through parse, and default / currentVersion are exposed", () => {
  const value: Cfg = { count: 7, label: "round" };
  const json = config.serialize(value);
  expect(config.parse({ ...(JSON.parse(json) as Cfg), schemaVersion: 3 })).toEqual(value);
  expect(config.default).toEqual(DEFAULT);
  expect(config.currentVersion).toBe(3);
});
