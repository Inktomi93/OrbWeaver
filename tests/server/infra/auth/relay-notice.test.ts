// infra/auth/relay-notice — the `owner_fallback_relayed` line is one per TCP peer per hour. A same-host tunnel
// sends every visitor from one loopback peer, so an unthrottled line repeats on every request.

import { logger } from "@orb/server/foundation/observability";
import { createRelayedFallbackNotice } from "@orb/server/infra/auth";
import { vi } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

const T0 = 1_700_000_000_000;
// The throttle's window, mirrored so the tests can step past it (the key-map bound is pinned in
// notice-throttle.test.ts).
const HOUR_MS = 3_600_000;
const EVENT = "owner_fallback_relayed";

/** A notice on a steerable clock, plus the peers each emitted line named. */
function harness(): { notice: (peer: string | undefined) => void; advance: (ms: number) => void; logged: () => unknown[] } {
  let at = T0;
  const spy = vi.spyOn(logger, "warn");
  return {
    notice: createRelayedFallbackNotice(() => at),
    advance: (ms): void => {
      at += ms;
    },
    logged: (): unknown[] =>
      spy.mock.calls.flatMap(([bindings]) => {
        const fields = bindings as Record<string, unknown>;
        return fields["event"] === EVENT ? [fields["peerIp"]] : [];
      }),
  };
}

test("one peer relaying many requests logs once per hour, then again after the hour", () => {
  const h = harness();
  for (let i = 0; i < 50; i += 1) {
    h.notice("127.0.0.1");
  }
  expect(h.logged()).toEqual(["127.0.0.1"]);
  h.advance(HOUR_MS - 1);
  h.notice("127.0.0.1");
  expect(h.logged()).toHaveLength(1);
  h.advance(1);
  h.notice("127.0.0.1");
  expect(h.logged()).toEqual(["127.0.0.1", "127.0.0.1"]);
});

test("each peer gets its own line; an absent peer is one shared key", () => {
  const h = harness();
  h.notice("127.0.0.1");
  h.notice("192.168.1.27");
  h.notice(undefined);
  h.notice(undefined);
  h.notice("192.168.1.27");
  expect(h.logged()).toEqual(["127.0.0.1", "192.168.1.27", null]);
});
