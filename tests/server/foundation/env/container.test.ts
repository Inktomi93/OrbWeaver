// foundation/env/container — the runtime's own marker files decide "in a container", Docker's or Podman's alone,
// and that decides which fix an operator-facing refusal names.

import { SETUP_COMMAND } from "@orb/contracts/identity";
import { CONTAINER_MARKER_FILES, runsInContainer, settingInstruction } from "@orb/server/foundation/env";
import { expect, test } from "../../../support/fixtures.ts";

test.each(CONTAINER_MARKER_FILES)("%s alone means a container", (marker) => {
  expect(runsInContainer((path) => path === marker)).toBe(true);
});

test("no marker file means bare metal", () => {
  expect(runsInContainer(() => false)).toBe(false);
});

test("the fix names the compose environment: block in a container and the setup command on bare metal", () => {
  const container = settingInstruction(true, "AUTH_MODE", "local");
  const bare = settingInstruction(false, "AUTH_MODE", "local");
  expect(container).toContain("AUTH_MODE: local under environment:");
  expect(container).not.toContain(SETUP_COMMAND);
  expect(bare).toContain(SETUP_COMMAND);
  expect(bare).toContain("AUTH_MODE=local");
});
