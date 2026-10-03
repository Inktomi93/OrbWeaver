// Unit: the effective-knob DISPLAY names (features/preset/lib/effective-knobs). Every knob the server's
// projection can report needs a label, or the readout prints a schema identifier such as `replyMedia`.

import { EFFECTIVE_KNOBS } from "@orb/server/domain/preset";
import { knobLabel } from "../../../../../packages/client/src/features/preset/lib/effective-knobs.ts";
import { expect, test } from "../../../../support/fixtures.ts";

/** A camelCase key is a schema identifier; a one-word key (`seed`) may stand as its own label. */
const SCHEMA_IDENTIFIER = /[A-Z]/u;

test("no knob the server projects reads as its camelCase schema key", () => {
  const raw = EFFECTIVE_KNOBS.filter((knob) => SCHEMA_IDENTIFIER.test(knob) && knobLabel(knob) === knob);
  expect(raw).toEqual([]);
  // The positive control: the projection does carry camelCase knobs, so the filter above is not vacuous.
  expect(EFFECTIVE_KNOBS.filter((knob) => SCHEMA_IDENTIFIER.test(knob))).toContain("replyMedia");
});

test("an unmapped key still prints itself rather than being hidden", () => {
  expect(knobLabel("someFutureKnob")).toBe("someFutureKnob");
});
