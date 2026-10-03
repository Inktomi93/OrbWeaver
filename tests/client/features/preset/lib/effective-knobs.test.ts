// Unit: the effective-knob DISPLAY names (features/preset/lib/effective-knobs). Every knob the server's
// projection can report needs a label, or the readout prints a schema identifier such as `replyMedia`.

import { EFFECTIVE_KNOBS, EFFECTIVE_PROVENANCES } from "@orb/server/domain/preset";
import { knobGhost, knobLabel, provenanceSuffix } from "../../../../../packages/client/src/features/preset/lib/effective-knobs.ts";
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

test("an unmapped key still prints itself rather than being hidden", () => {
  expect(knobLabel("someFutureKnob")).toBe("someFutureKnob");
});
