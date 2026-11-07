// A live arm may skip only on an engine that is not there; every other probe answer stays red.
import type { CredentialHealth } from "@orb/contracts/credentials";
import { expect, test } from "@orb/testkit/node";
import { localBackendUnavailableReason } from "./backend-probe.ts";

const checkedAt = 1;

test("an earned ok leaves the live arms running", () => {
  expect(localBackendUnavailableReason({ status: "ok", checkedAt })).toBeNull();
});

test.each<[string, CredentialHealth]>([
  ["nothing listening", { status: "unreachable", checkedAt, reason: "connection refused" }],
  ["a proxy in front of a dead box", { status: "unreachable", checkedAt, reason: "connection refused", httpStatus: 502 }],
])("%s is external unavailability, with its reason", (_name, health) => {
  expect(localBackendUnavailableReason(health)).toBe("no local chat backend on this stack: connection refused");
});

test.each<[string, CredentialHealth, string]>([
  ["a wrong path", { status: "unreachable", checkedAt, reason: "not found", httpStatus: 404 }, "HTTP 404"],
  ["a refused key", { status: "revoked", checkedAt, reason: "bad key" }, "refused the harness connection: bad key"],
  ["no verdict", { status: "unchecked", checkedAt, reason: "no probe arm" }, "no verdict: no probe arm"],
  ["a throttled probe", { status: "throttled", checkedAt }, "availability is unknown"],
])("%s is a product failure and propagates", (_name, health, message) => {
  expect(() => localBackendUnavailableReason(health)).toThrow(message);
});
