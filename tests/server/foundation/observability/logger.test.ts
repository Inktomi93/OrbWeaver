// foundation/observability/logger — the request ring, the AsyncLocalStorage request scope, the getLog
// output shape (requestId stamped on the line), and securityEvent. The rings are module singletons shared
// across tests, so each test pushes its OWN markers and asserts on those (most-recent-first).

import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { RequestRecord } from "@orb/server/foundation/observability";
import {
  bindRequestUser,
  getLog,
  getRequestUserId,
  logger,
  recentRequests,
  recordRequest,
  runInRequest,
  securityEvent,
} from "@orb/server/foundation/observability";
import { describe, vi } from "vitest";
import { expect, test } from "../../../support/fixtures";

function rec(id: string): RequestRecord {
  return { id, method: "GET", path: `/${id}`, status: 200, durationMs: 1, at: 1 };
}

describe("request ring", () => {
  test("recentRequests returns the newest records first", () => {
    recordRequest(rec("ring-a"));
    recordRequest(rec("ring-b"));
    recordRequest(rec("ring-c"));
    expect(recentRequests(3).map((r) => r.id)).toEqual(["ring-c", "ring-b", "ring-a"]);
  });

  test("recentRequests honors the limit", () => {
    recordRequest(rec("lim-a"));
    recordRequest(rec("lim-b"));
    expect(recentRequests(1).map((r) => r.id)).toEqual(["lim-b"]);
  });
});

describe("request scope", () => {
  test("getRequestUserId is undefined outside a request scope", () => {
    expect(getRequestUserId()).toBeUndefined();
  });

  test("bindRequestUser sets the caller within the scope and clears when it exits", () => {
    runInRequest("req-scope-1", () => {
      expect(getRequestUserId()).toBeUndefined(); // not bound yet
      bindRequestUser(castId<UserId>("user-1"), castId<Handle>("alice"));
      expect(getRequestUserId()).toBe("user-1");
    });
    expect(getRequestUserId()).toBeUndefined(); // back outside
  });

  test("bindRequestUser outside a scope is a no-op (no throw)", () => {
    expect(() => bindRequestUser(castId<UserId>("user-x"))).not.toThrow();
    expect(getRequestUserId()).toBeUndefined();
  });
});

describe("getLog output shape", () => {
  test("getLog outside a request scope returns the base logger", () => {
    expect(getLog()).toBe(logger);
  });

  test("getLog inside a request scope returns a child (not the base logger)", () => {
    runInRequest("req-child-1", () => {
      expect(getLog()).not.toBe(logger);
    });
  });

  test("a line emitted via getLog inside a scope carries requestId", () => {
    const requestId = "logger-stamp-req";
    runInRequest(requestId, () => {
      // pino child loggers expose bindings() — verify requestId is bound without depending on
      // the ring (which is silenced by LOG_LEVEL=silent in the test environment).
      expect((getLog() as unknown as { bindings: () => Record<string, unknown> }).bindings()["requestId"]).toBe(requestId);
    });
  });
});

describe("securityEvent", () => {
  test("emits one security:true warn line carrying the event + extra fields", () => {
    // Spy on logger.warn — pino output is silenced (LOG_LEVEL=silent) in the test environment,
    // so we verify the call shape directly rather than scanning the ring.
    const spy = vi.spyOn(logger, "warn");
    securityEvent("test_block", { reason: "demo" });
    expect(spy).toHaveBeenCalledOnce();
    const [bindings] = spy.mock.calls[0] as [Record<string, unknown>, ...unknown[]];
    expect(bindings["security"]).toBe(true);
    expect(bindings["event"]).toBe("test_block");
    expect(bindings["reason"]).toBe("demo");
  });
});
