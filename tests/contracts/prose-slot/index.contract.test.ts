// PROSE-1 §10 — the SHAPE half: the override storage schema and the legacy bare-string adapter. The
// composed registry, the resolver and the baseline manifest are exercised in `tests/contracts/prose/`.
import type { ProseSlotId } from "@orb/contracts/prose-slot";
import {
  isProseSlotId,
  LEGACY_PROSE_BASE_VERSION,
  PROSE_COUNTER_AT,
  PROSE_MAX_CHARS,
  PROSE_SLOT_IDS,
  proseOverBy,
  proseOverrideFromLegacy,
  proseOverridesSchema,
} from "@orb/contracts/prose-slot";
import { expect, test } from "../../support/fixtures.ts";

const SOME_ID: ProseSlotId = "preset.format.impersonateNudge";

test("the slot id vocabulary is unique and recognised by the guard", () => {
  expect(new Set(PROSE_SLOT_IDS).size).toBe(PROSE_SLOT_IDS.length);
  expect(PROSE_SLOT_IDS.every((id) => isProseSlotId(id))).toBe(true);
  expect(isProseSlotId("not.a.slot")).toBe(false);
});

test("proseOverridesSchema: absent ⇒ {}, and a RETIRED id is stripped rather than failing the whole blob", () => {
  expect(proseOverridesSchema.parse(undefined)).toStrictEqual({});
  // §4.4 rung 5: a slot whose feature was retired leaves a stale key in a host's stored blob. An enum-keyed
  // record REJECTS an unknown key — stripping it is what keeps every OTHER override readable.
  expect(proseOverridesSchema.parse({ "retired.slot.id": { text: "x", baseVersion: 1 } })).toStrictEqual({});
});

test("proseOverridesSchema: one malformed row self-heals to the default without nuking its siblings", () => {
  const healed = proseOverridesSchema.parse({ [SOME_ID]: { text: 12 }, "preset.format.responseNudge": { text: "ok", baseVersion: 1 } });
  expect(healed[SOME_ID]).toBeUndefined();
  expect(healed["preset.format.responseNudge"]).toStrictEqual({ text: "ok", baseVersion: 1 });
});

test("proseOverridesSchema: an over-long override is rejected (self-healed away), not truncated", () => {
  const tooLong = proseOverridesSchema.parse({ [SOME_ID]: { text: "x".repeat(PROSE_MAX_CHARS + 1), baseVersion: 1 } });
  expect(tooLong[SOME_ID]).toBeUndefined();
  const atCap = proseOverridesSchema.parse({ [SOME_ID]: { text: "x".repeat(PROSE_MAX_CHARS), baseVersion: 1 } });
  expect(atCap[SOME_ID]?.text.length).toBe(PROSE_MAX_CHARS);
});

test("proseOverBy is the EDITOR-side twin of that rejection — the number the two prose editors refuse on", () => {
  // The test above is the loss: an over-cap override does not bounce, it self-heals to ABSENT, so the host's
  // text is deleted and the shipped default rides with nothing on screen having said so. `proseOverBy` is
  // what lets an editor see that coming BEFORE the wire, off this constant rather than a re-spelled 4000.
  expect(proseOverBy("")).toBe(0);
  expect(proseOverBy("x".repeat(PROSE_MAX_CHARS))).toBe(0);
  expect(proseOverBy("x".repeat(PROSE_MAX_CHARS + 1))).toBe(1);
  // TRIMMED, because the trimmed bytes are what the save boundaries actually store — a value that fits once
  // padding is dropped must not have its save refused, and one that does not must not be excused by it.
  expect(proseOverBy(`  ${"x".repeat(PROSE_MAX_CHARS)}  `)).toBe(0);
  expect(proseOverBy(`  ${"x".repeat(PROSE_MAX_CHARS + 3)}  `)).toBe(3);
  // The counter threshold is a fraction of the cap, not a second magic number.
  expect(PROSE_MAX_CHARS * PROSE_COUNTER_AT).toBe(3200);
});

test("the legacy bare-string adapter stamps the FIRST version — honest today, stale after the first bump", () => {
  expect(proseOverrideFromLegacy(undefined)).toBeUndefined();
  expect(proseOverrideFromLegacy("")).toStrictEqual({ text: "", baseVersion: LEGACY_PROSE_BASE_VERSION });
  expect(proseOverrideFromLegacy("mine")).toStrictEqual({ text: "mine", baseVersion: LEGACY_PROSE_BASE_VERSION });
});
