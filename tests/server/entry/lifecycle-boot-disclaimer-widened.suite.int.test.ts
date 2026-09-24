// entry/lifecycle — the control for the healthy-boot suite beside it: the same single-user box with a declared
// owner peer set boots, and the standing exposure is a security line INSIDE the one disclaimer group.

import { afterAll, beforeAll } from "vitest";
import type { BootedLifecycle } from "../../support/booted-lifecycle.ts";
import { bootLifecycle, disclaimerIndices } from "../../support/booted-lifecycle.ts";
import { expect, test } from "../../support/fixtures.ts";

const BOOT_TIMEOUT_MS = 120_000;

let booted: BootedLifecycle;

beforeAll(async () => {
  booted = await bootLifecycle("orb-boot-disclaimer-widened-", [
    ["AUTH_MODE", "single-user"],
    ["AUTH_FALLBACK", undefined],
    ["AUTH_FALLBACK_TRUSTED_PEERS", "172.16.0.0/12"],
    ["BIND_HOST", undefined],
    ["DEBUG_TOKEN", undefined],
    ["IP_ALLOWLIST", undefined],
    ["WIRE_CAPTURE", "off"],
    ["RPG_TRACE", "off"],
  ]);
}, BOOT_TIMEOUT_MS);

afterAll(async () => {
  await booted.shutdown();
});

test("the widened peer set is one security line, inside the contiguous disclaimer group", () => {
  const indices = disclaimerIndices(booted.bootLog);
  expect(indices.at(-1)).toBe((indices[0] ?? 0) + indices.length - 1);
  const security = booted.bootLog.flatMap((line, index) => (line["security"] === true ? [index] : []));
  expect(security).toHaveLength(1);
  expect(indices).toContain(security[0]);
});
