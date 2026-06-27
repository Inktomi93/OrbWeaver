// foundation/observability/logger — the request ring, the AsyncLocalStorage request scope, the getLog
// output shape (requestId stamped on the line), and securityEvent. The rings are module singletons shared
// across tests, so each test pushes its OWN markers and asserts on those (most-recent-first).

import type { RequestRecord } from "@orb/server/foundation/observability";
import {
  bindRequestUser,
  getLog,
  getRequestUserId,
  logger,
  logRing,
  recentRequests,
  recordRequest,
  runInRequest,
  securityEvent,
} from "@orb/server/foundation/observability";
import { describe, expect, test } from "vitest";

const WARN_LEVEL = 40; // pino numeric level for "warn"

function rec(id: string): RequestRecord {
  return { id, method: "GET", path: `/${id}`, status: 200, durationMs: 1, at: 1 };
}

function ringLines(): Record<string, unknown>[] {
  return logRing.recent(200).map((l) => JSON.parse(l) as Record<string, unknown>);
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
      bindRequestUser("user-1", "alice");
      expect(getRequestUserId()).toBe("user-1");
    });
    expect(getRequestUserId()).toBeUndefined(); // back outside
  });

  test("bindRequestUser outside a scope is a no-op (no throw)", () => {
    expect(() => bindRequestUser("user-x")).not.toThrow();
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
      getLog().info({ marker: "stamp-marker" }, "scoped line");
    });
    const line = ringLines().find((r) => r["marker"] === "stamp-marker");
    expect(line).toBeDefined();
    expect(line?.["requestId"]).toBe(requestId);
  });
});

describe("securityEvent", () => {
  test("emits one security:true warn line carrying the event + extra fields", () => {
    securityEvent("test_block", { reason: "demo" });
    const line = ringLines().find((r) => r["event"] === "test_block");
    expect(line).toBeDefined();
    expect(line?.["security"]).toBe(true);
    expect(line?.["reason"]).toBe("demo");
    expect(line?.["level"]).toBe(WARN_LEVEL);
  });
});
