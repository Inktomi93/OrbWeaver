// PROSE-1 §10 — the SHAPE half: the override storage schema and the legacy bare-string adapter. The
// composed registry, the resolver and the baseline manifest are exercised in `tests/contracts/prose/`.
import type { ProseSlotId } from "@orb/contracts/prose-slot";
import {
  isProseSlotId,
  LEGACY_PROSE_BASE_VERSION,
  PROSE_MAX_CHARS,
  PROSE_SLOT_IDS,
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

test("the legacy bare-string adapter stamps the FIRST version — honest today, stale after the first bump", () => {
  expect(proseOverrideFromLegacy(undefined)).toBeUndefined();
  expect(proseOverrideFromLegacy("")).toStrictEqual({ text: "", baseVersion: LEGACY_PROSE_BASE_VERSION });
  expect(proseOverrideFromLegacy("mine")).toStrictEqual({ text: "mine", baseVersion: LEGACY_PROSE_BASE_VERSION });
});
