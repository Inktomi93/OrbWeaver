// contracts/inference/wires — the closed wire axis. `wireSchema` is the output parser of every resolved view, so a
// wire a shipped provider row names but the schema refuses would fail every connection read on that provider.

import { BUILTIN_PROVIDERS, WIRE_DEFS, wireSchema } from "@orb/contracts/inference";
import { expect, test } from "../../support/fixtures.ts";

test("every wire a built-in provider row or a wire def names parses", () => {
  for (const wire of [...BUILTIN_PROVIDERS.map((row) => row.wire), ...Object.keys(WIRE_DEFS)]) {
    expect(wireSchema.safeParse(wire).success, wire).toBe(true);
  }
});

test("a wire outside the closed tuple is refused", () => {
  expect(wireSchema.safeParse("plugin-wire").success).toBe(false);
});
