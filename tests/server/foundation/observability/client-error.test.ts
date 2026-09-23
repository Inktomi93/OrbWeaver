// foundation/observability/client-error — the client→server error-report sink. `recordClientError`
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

  // A URL is not a redactable FIELD: the logger's key-based redaction cannot see inside the string, and a
  // client error thrown on an OAuth callback / invite-accept route carries the code or token in its query.
  // Truncation at 4000 does not help a short URL. So the query and fragment are dropped, not truncated.
  test("the URL query string and fragment are DROPPED before logging (a callback code is not a log line)", () => {
    const spy = vi.spyOn(logger, "error");
    recordClientError(report({ url: "https://example.test/auth/callback?code=SECRET-OAUTH-CODE&state=xyz#tok=SECRET-FRAGMENT" }));
    const [fields] = spy.mock.calls[0] as [Record<string, unknown>, string];
    expect(fields["url"]).toBe("https://example.test/auth/callback");
    expect(String(fields["url"])).not.toContain("SECRET-OAUTH-CODE");
    expect(String(fields["url"])).not.toContain("SECRET-FRAGMENT");
  });

  test("a non-absolute URL still degrades to its path — never logged whole, never dropped entirely", () => {
    const spy = vi.spyOn(logger, "error");
    recordClientError(report({ url: "/chats/abc?invite=SECRET-INVITE#x" }));
    const [fields] = spy.mock.calls[0] as [Record<string, unknown>, string];
    expect(fields["url"]).toBe("/chats/abc");
  });

  test("the client-supplied requestId is bounded and charset-checked (it had NO cap at all)", () => {
    const spy = vi.spyOn(logger, "error");
    recordClientError(report({ requestId: `${"r".repeat(5000)}\nX-Injected: 1\u0000` }));
    const [fields] = spy.mock.calls[0] as [Record<string, unknown>, string];
    const id = fields["clientRequestId"] as string;
    expect(id.length).toBeLessThanOrEqual(200);
    expect(id).toMatch(/^[A-Za-z0-9._:-]*$/u);
  });

  test("an oversized message is truncated in the log line too", () => {
    const spy = vi.spyOn(logger, "error");
    recordClientError(report({ message: "y".repeat(5000) }));
    const [, msg] = spy.mock.calls[0] as [Record<string, unknown>, string];
    expect(msg.length).toBeLessThan(5000);
    expect(msg.endsWith("…")).toBe(true);
  });
});
