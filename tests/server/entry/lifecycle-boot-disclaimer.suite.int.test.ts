// entry/lifecycle — the boot disclaimer is ONE contiguous log group, and a healthy loopback single-user box
// says nothing alarming in its whole boot. The widened-peer control is the sibling suite, which boots the same
// box with AUTH_FALLBACK_TRUSTED_PEERS set and sees the security line inside the group.

import { afterAll, beforeAll } from "vitest";
import type { BootedLifecycle } from "../../support/booted-lifecycle.ts";
import { bootLifecycle, disclaimerIndices } from "../../support/booted-lifecycle.ts";
import { expect, test } from "../../support/fixtures.ts";

const BOOT_TIMEOUT_MS = 120_000;
// mode, listener, credential-less owner, cookie rule, secrets and the single-user caveat.
const SINGLE_USER_TOPICS = 6;

let booted: BootedLifecycle;

beforeAll(async () => {
  booted = await bootLifecycle("orb-boot-disclaimer-", [
    ["AUTH_MODE", "single-user"],
    ["AUTH_FALLBACK", undefined],
    ["AUTH_FALLBACK_TRUSTED_PEERS", undefined],
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

test("the disclaimer is one contiguous group, carrying the single-user caveat", () => {
  const indices = disclaimerIndices(booted.bootLog);
  expect(indices).toHaveLength(SINGLE_USER_TOPICS);
  expect(indices.at(-1)).toBe((indices[0] ?? 0) + indices.length - 1);
  expect(indices.map((index) => booted.bootLog[index]?.["topic"])).toContain("caveat");
});

test("a healthy loopback single-user boot writes no security line anywhere in its boot log", () => {
  expect(booted.bootLog.filter((line) => line["security"] === true)).toEqual([]);
});
