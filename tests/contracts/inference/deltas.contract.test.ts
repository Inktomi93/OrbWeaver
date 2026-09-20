// contracts/inference/deltas — the stream-delta vocabulary. A wire DECLARES which members its backend may
// emit (`WIRE_DEFS[w].deltas`) and a runner never invents one, so the coupling is the test: no wire may
// declare a delta the tuple does not carry (the bus and the canon content blocks dispatch on this union).
// The union is OPEN-ENDED by design — `audio` is captured vocabulary no wire emits yet — so the second pin
// is the one that must hold today: a wire that serves `chat` has to be able to emit TEXT and USAGE, or its
// turns stream nothing visible and cost nothing measurable.

import { DELTA_KINDS, deltaKindSchema, WIRE_DEFS, WIRES } from "@orb/contracts/inference";
import { expect, test } from "../../support/fixtures.ts";

test("every member parses to itself and anything else is REFUSED", () => {
  for (const kind of DELTA_KINDS) {
    expect(deltaKindSchema.parse(kind)).toBe(kind);
  }
  for (const notADelta of ["content", "delta", "text-delta", ""]) {
    expect(deltaKindSchema.safeParse(notADelta).success, `"${notADelta}" must not parse as a delta kind`).toBe(false);
  }
});

test("no wire declares a delta outside the tuple — the bus dispatches on this union", () => {
  const known: ReadonlySet<string> = new Set<string>(DELTA_KINDS);
  for (const wire of WIRES) {
    for (const delta of WIRE_DEFS[wire].deltas) {
      expect(known.has(delta), `the "${wire}" wire declares "${delta}", which is not a DELTA_KINDS member`).toBe(true);
    }
  }
});

test("every chat-serving wire can emit TEXT and USAGE", () => {
  for (const wire of WIRES) {
    if (!WIRE_DEFS[wire].serves.includes("chat")) {
      continue;
    }
    expect(WIRE_DEFS[wire].deltas, `the "${wire}" wire serves chat`).toContain("text");
    expect(WIRE_DEFS[wire].deltas, `the "${wire}" wire serves chat, so its turns must be measurable`).toContain("usage");
  }
});

test("a wire that streams nothing declares NO deltas — an empty list, never an inherited default", () => {
  expect(WIRE_DEFS["local-light"].deltas, "the in-process tier answers whole values; it has no stream").toEqual([]);
  expect(WIRE_DEFS["local-light"].serves).not.toContain("chat");
});
