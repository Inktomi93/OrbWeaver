// foundation/observability/client-error — the PD-58 client→server error-report sink. `recordClientError`
// is a thin tagged `getLog().error(...)` call; the ring is already fed by the pino ringStream (logger.ts),
// so this pins the RECORD SHAPE: the `clientError:true` tag, the `clientRequestId` rename (so it never
// collides with the request-scoped `requestId` binding `getLog()` itself attaches), and the field-length
// truncation belt. `logger.error` is spied directly — the same pattern `logger.test.ts` uses for
// `securityEvent` (spying a real object's method, not `vi.mock`ing a sibling module).

import type { ClientErrorReport } from "@orb/server/foundation/observability";
import { logger, recordClientError } from "@orb/server/foundation/observability";
import { describe, vi } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

function report(overrides: Partial<ClientErrorReport> = {}): ClientErrorReport {
  return { message: "boom", url: "https://example.test/chats/abc", ...overrides };
}

describe("recordClientError", () => {
  test("logs at error level, tagged clientError:true, with the message in the log line", () => {
    const spy = vi.spyOn(logger, "error");
    recordClientError(report());
    expect(spy).toHaveBeenCalledOnce();
    const [fields, msg] = spy.mock.calls[0] as [Record<string, unknown>, string];
    expect(fields["clientError"]).toBe(true);
    expect(fields["url"]).toBe("https://example.test/chats/abc");
    expect(msg).toBe("client error: boom");
  });

  test("optional fields (stack/ownerStack) pass through untouched when under the cap", () => {
    const spy = vi.spyOn(logger, "error");
    recordClientError(report({ stack: "Error: boom\n  at Foo", ownerStack: "at <Foo>" }));
    const [fields] = spy.mock.calls[0] as [Record<string, unknown>, string];
    expect(fields["stack"]).toBe("Error: boom\n  at Foo");
    expect(fields["ownerStack"]).toBe("at <Foo>");
  });

  test("undefined optional fields stay undefined (never coerced to a string)", () => {
    const spy = vi.spyOn(logger, "error");
    recordClientError(report());
    const [fields] = spy.mock.calls[0] as [Record<string, unknown>, string];
    expect(fields["stack"]).toBeUndefined();
    expect(fields["ownerStack"]).toBeUndefined();
    expect(fields["clientRequestId"]).toBeUndefined();
  });

  test("the client-supplied requestId lands as clientRequestId (never bare requestId)", () => {
    const spy = vi.spyOn(logger, "error");
    recordClientError(report({ requestId: "req-from-a-prior-call" }));
    const [fields] = spy.mock.calls[0] as [Record<string, unknown>, string];
    expect(fields["clientRequestId"]).toBe("req-from-a-prior-call");
    expect(fields["requestId"]).toBeUndefined();
  });

  test("an oversized field is truncated with an ellipsis rather than logged whole", () => {
    const spy = vi.spyOn(logger, "error");
    const hugeStack = "x".repeat(5000);
    recordClientError(report({ stack: hugeStack }));
    const [fields] = spy.mock.calls[0] as [Record<string, unknown>, string];
    const stack = fields["stack"] as string;
    expect(stack.length).toBeLessThan(hugeStack.length);
    expect(stack.endsWith("…")).toBe(true);
  });

  test("an oversized message is truncated in the log line too", () => {
    const spy = vi.spyOn(logger, "error");
    recordClientError(report({ message: "y".repeat(5000) }));
    const [, msg] = spy.mock.calls[0] as [Record<string, unknown>, string];
    expect(msg.length).toBeLessThan(5000);
    expect(msg.endsWith("…")).toBe(true);
  });
});
