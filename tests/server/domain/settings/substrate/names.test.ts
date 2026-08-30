// substrate/names — freeThemeName: mint-time name de-collision, file-manager convention. Pins: a free base
// name passes through unnumbered, a collision takes the lowest free " N" (N >= 2), and a gap in the taken
// set is skipped (the scan finds the lowest FREE ordinal, not the count+1).

import { describe } from "vitest";
import { freeThemeName } from "../../../../../packages/server/src/domain/settings/substrate/names.ts";
import { expect, test } from "../../../../support/fixtures.ts";

describe("freeThemeName", () => {
  test("a free base name passes through unnumbered — the original row is never numbered", () => {
    expect(freeThemeName("Adventures", new Set())).toBe("Adventures");
  });

  test("a taken base name gets ' 2' first", () => {
    expect(freeThemeName("Adventures", new Set(["Adventures"]))).toBe("Adventures 2");
  });

  test("a chain of collisions climbs to the lowest free ordinal", () => {
    const taken = new Set(["Adventures", "Adventures 2", "Adventures 3"]);
    expect(freeThemeName("Adventures", taken)).toBe("Adventures 4");
  });

  test("a gap in the taken set is still skipped over — the scan wants FREE, not count+1", () => {
    // "Adventures 2" is taken but "Adventures 3" is free even though only 2 names total are taken.
    const taken = new Set(["Adventures", "Adventures 2"]);
    expect(freeThemeName("Adventures", taken)).toBe("Adventures 3");
  });
});
