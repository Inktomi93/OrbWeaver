// observer/signals — the PURE signal builders (no db). Pins the kind mapping + the dedup-key identity
// (throttle grain): entity-id for workload/chat, 5-min bucket for the poll-driven trace/presence.

import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import {
  bucket5m,
  chatSignal,
  presenceSignal,
  traceSignal,
  workloadSignal,
} from "../../../../../packages/server/src/domain/buddy/observer/signals.ts";
import { expect, test } from "../../../../support/fixtures";

const U = castId<UserId>("user_1");
const AT = 1_750_000_000_000;

describe("buddy observer signal builders", () => {
  test("workloadSignal maps phase → kind + a per-entity+phase dedup key", () => {
    const s = workloadSignal({ workloadId: "wl_1", phase: "failed", at: AT }, U);
    expect(s.kind).toBe("workload:failed");
    expect(s.userId).toBe(U);
    expect(s.dedupKey).toBe("workload:wl_1:failed");
  });

  test("chatSignal keys to the host + buckets by 5-min window", () => {
    const s = chatSignal({ chatId: "c1", kind: "turn-completed", actingUserId: null, at: AT }, U);
    expect(s.kind).toBe("chat:turn-completed");
    expect(s.dedupKey).toBe(`chat:c1:turn-completed:${bucket5m(AT)}`);
  });

  test("trace + presence signals bucket to one reaction per 5-min window", () => {
    const t1 = traceSignal("slow-turn", U, AT);
    const t2 = traceSignal("slow-turn", U, AT + 60_000); // same window
    expect(t1.dedupKey).toBe(t2.dedupKey);
    const t3 = traceSignal("slow-turn", U, AT + 400_000); // next window
    expect(t3.dedupKey).not.toBe(t1.dedupKey);

    const p = presenceSignal("neglected", U, AT);
    expect(p.kind).toBe("presence:neglected");
    expect(p.userId).toBe(U);
  });

  test("bucket5m is stable within a window + increments across it", () => {
    const start = bucket5m(AT) * 300_000; // a bucket boundary
    expect(bucket5m(start)).toBe(bucket5m(start + 299_999));
    expect(bucket5m(start + 300_000)).toBe(bucket5m(start) + 1);
  });
});
