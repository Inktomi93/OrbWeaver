import { defineVersionedConfig } from "@orb/contracts/versioned-config";
import { z } from "zod";
import { expect, test } from "../../support/fixtures";

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

test("serialize round-trips through parse, and default / currentVersion are exposed", () => {
  const value: Cfg = { count: 7, label: "round" };
  const json = config.serialize(value);
  expect(config.parse({ ...(JSON.parse(json) as Cfg), schemaVersion: 3 })).toEqual(value);
  expect(config.default).toEqual(DEFAULT);
  expect(config.currentVersion).toBe(3);
});
