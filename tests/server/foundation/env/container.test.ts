// foundation/env/container — "in a container" is the image's own declaration, else a marker file the runtime writes.

import { CONTAINER_MARKER_FILES, runsInContainer } from "@orb/server/foundation/env";
import { expect, test } from "../../../support/fixtures.ts";

test.each(CONTAINER_MARKER_FILES)("%s alone means a container", (marker) => {
  expect(runsInContainer(false, (path) => path === marker)).toBe(true);
});

test("the image's declaration alone means a container (containerd and CRI-O write no marker file)", () => {
  expect(runsInContainer(true, () => false)).toBe(true);
});

test("no declaration and no marker file means bare metal", () => {
  expect(runsInContainer(false, () => false)).toBe(false);
});
