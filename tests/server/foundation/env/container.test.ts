// foundation/env/container — "in a container" is the image's own declaration, else a marker file the runtime writes.

import { ENVIRONMENT_BLOCK_WINS, HOST_NETWORK_OVERLAY, signInModeEnvLines } from "@orb/contracts/identity";
import { ALLOWED_HOSTS_KEY } from "@orb/kit/allowed-hosts";
import { CONTAINER_MARKER_FILES, runsInContainer, settingInstruction } from "@orb/server/foundation/env";
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

// The host-network overlay pins AUTH_MODE, AUTH_FALLBACK and AUTH_FALLBACK_TRUSTED_PEERS in its own environment:
// block, so only a fix that sets one of those can be overridden there.
test.each([
  ["a sign-in mode switch", signInModeEnvLines("local", "container"), true],
  ["the trusted-peers key alone", [["AUTH_FALLBACK_TRUSTED_PEERS", "<CIDR list>"]], true],
  ["ALLOWED_HOSTS", [[ALLOWED_HOSTS_KEY, "nas.local"]], false],
] as const)("a container fix for %s names the overlay sentence only when the overlay pins a key in it", (_label, lines, names) => {
  const fix = settingInstruction(true, lines);
  expect(fix.includes(ENVIRONMENT_BLOCK_WINS)).toBe(names);
  expect(fix.includes(HOST_NETWORK_OVERLAY)).toBe(names);
});

test("the overlay sentence names all three keys the overlay sets", () => {
  for (const key of ["AUTH_MODE", "AUTH_FALLBACK", "AUTH_FALLBACK_TRUSTED_PEERS"]) {
    expect(ENVIRONMENT_BLOCK_WINS).toContain(key);
  }
});
