// share/substrate/start-relay — the seating-then-relay step both starts run: the seating goes on before the relay, a
// relay that starts keeps it on, and a relay that throws gets the seating put back before its own error surfaces.

import type { RelayStatus } from "@orb/contracts/identity";
import { DomainOperationError } from "@orb/kit/errors";
import { getLog } from "@orb/server/foundation/observability";
import { describe, vi } from "vitest";
import { startSeatedRelay } from "../../../../../packages/server/src/domain/share/substrate/start-relay.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const STARTING: RelayStatus = { state: "starting", relay: "quick", restartAfter: null };

function steps(startError?: Error, restoreError?: Error): { readonly calls: string[]; readonly run: () => Promise<RelayStatus> } {
  const calls: string[] = [];
  const run = (): Promise<RelayStatus> =>
    startSeatedRelay({
      enableSeating: () => {
        calls.push("enableSeating");
        return Promise.resolve(() => {
          calls.push("restoreSeating");
          return restoreError === undefined ? Promise.resolve() : Promise.reject(restoreError);
        });
      },
      relay: {
        start: () => {
          calls.push("relay.start");
          return startError === undefined ? Promise.resolve(STARTING) : Promise.reject(startError);
        },
        stop: () => undefined,
        status: () => STARTING,
      },
    });
  return { calls, run };
}

describe("startSeatedRelay", () => {
  test("a relay that starts keeps the seating on and answers its status", async () => {
    const { calls, run } = steps();
    await expect(run()).resolves.toEqual(STARTING);
    expect(calls).toEqual(["enableSeating", "relay.start"]);
  });

  test("a relay that throws gets the seating put back, and its own error reaches the caller", async () => {
    const refused = new DomainOperationError("relay_binary_checksum_mismatch", "not the pinned bytes");
    const { calls, run } = steps(refused);
    await expect(run()).rejects.toBe(refused);
    expect(calls).toEqual(["enableSeating", "relay.start", "restoreSeating"]);
  });

  test("a restore that also fails is logged, and the relay's own error still reaches the caller", async () => {
    const refused = new DomainOperationError("relay_binary_checksum_mismatch", "not the pinned bytes");
    const restoreFailed = new Error("settings write refused");
    const errorSpy = vi.spyOn(getLog(), "error").mockImplementation(() => undefined);
    try {
      const { run } = steps(refused, restoreFailed);
      await expect(run()).rejects.toBe(refused);
      expect(errorSpy).toHaveBeenCalledWith(expect.objectContaining({ err: restoreFailed }), expect.any(String));
    } finally {
      errorSpy.mockRestore();
    }
  });
});
