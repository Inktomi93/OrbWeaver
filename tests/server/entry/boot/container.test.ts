// entry/boot/container — the runtime's own marker files decide "in a container", Docker's or Podman's alone.

import { CONTAINER_MARKER_FILES, runsInContainer } from "@orb/server/entry/boot";
import { expect, test } from "../../../support/fixtures.ts";

test.each(CONTAINER_MARKER_FILES)("%s alone means a container", (marker) => {
  expect(runsInContainer((path) => path === marker)).toBe(true);
});

test("no marker file means bare metal", () => {
  expect(runsInContainer(() => false)).toBe(false);
});
