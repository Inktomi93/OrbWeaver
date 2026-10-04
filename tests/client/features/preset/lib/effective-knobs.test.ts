// Unit: the effective-knob DISPLAY names (features/preset/lib/effective-knobs). Every knob the server's
// projection can report needs a label, or the readout prints a schema identifier such as `replyMedia`.

import { samplingCapabilitySchema } from "@orb/contracts/inference";
import { EFFECTIVE_KNOBS, EFFECTIVE_PROVENANCES } from "@orb/server/domain/preset";
import { honoredKnobLabels, knobGhost, knobLabel, provenanceSuffix } from "../../../../../packages/client/src/features/preset/lib/effective-knobs.ts";
import { expect, test } from "../../../../support/fixtures.ts";

/** A camelCase key is a schema identifier; a one-word key (`seed`) may stand as its own label. */
const SCHEMA_IDENTIFIER = /[A-Z]/u;

test("no knob the server projects reads as its camelCase schema key", () => {
  const raw = EFFECTIVE_KNOBS.filter((knob) => SCHEMA_IDENTIFIER.test(knob) && knobLabel(knob) === knob);
  expect(raw).toEqual([]);
  // The positive control: the projection does carry camelCase knobs, so the filter above is not vacuous.
  expect(EFFECTIVE_KNOBS.filter((knob) => SCHEMA_IDENTIFIER.test(knob))).toContain("replyMedia");
});

test("every rung the server can return reads in the deck's words, never as its raw key", () => {
  const raw = EFFECTIVE_PROVENANCES.filter((provenance) => SCHEMA_IDENTIFIER.test(provenance) && provenanceSuffix(provenance) === provenance);
  expect(raw).toEqual([]);
  expect(EFFECTIVE_PROVENANCES).toContain("serverDefault");
});

test("a server's advertised default for an unset knob ghosts at its value with a gloss", () => {
  const ghost = knobGhost({ value: 0.8, provenance: "serverDefault" }, undefined);
  expect(ghost?.value).toBe(0.8);
  expect(ghost?.gloss).not.toBeNull();
});

test("the Capability honors line reads every sampling-schema key as a knob word, and drops the constraints", () => {
  const keys = Object.keys(samplingCapabilitySchema.shape);
  // Walk the WHOLE schema: a capability advertising every key it can carry.
  const everyKey = Object.fromEntries(keys.map((key) => [key, true]));
  const honored = honoredKnobLabels(everyKey);
  expect(honored.filter((label) => keys.includes(label) && SCHEMA_IDENTIFIER.test(label))).toEqual([]);
  // `exclusive` is a pairing constraint between knobs, not a knob the model honors.
  expect(honored).not.toContain(knobLabel("exclusive"));
  expect(honored).toHaveLength(keys.length - 1);
});

test("an unmapped key still prints itself rather than being hidden", () => {
  expect(knobLabel("someFutureKnob")).toBe("someFutureKnob");
});
