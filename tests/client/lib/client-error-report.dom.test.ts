// @subject packages/client/src/lib/client-error-report.ts

import { createTrpcClient } from "@orb/client/data";
import { buildClientErrorPayload } from "@orb/client/lib";
import { clientErrorReportSchema, REQUEST_ID_HEADER } from "@orb/contracts/diagnostics";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";
import { vi } from "vitest";

test("the caught render error builder preserves optional fields and the unsanitized injected URL", () => {
  const error = new Error("render failed");
  const withOwner = buildClientErrorPayload(error, "at <Component>", "/callback?code=retained#fragment");
  expect(withOwner).toEqual({
    message: error.message,
    stack: error.stack,
    ownerStack: "at <Component>",
    url: "/callback?code=retained#fragment",
  });
  expect(clientErrorReportSchema.parse(withOwner)).toEqual(withOwner);
  Object.defineProperty(error, "stack", { value: undefined });
  const omitted = buildClientErrorPayload(error, null, "/");
  expect(omitted).toEqual({ message: error.message, url: "/" });
  expect(omitted).not.toHaveProperty("requestId");
});

test("building a report does not pre-parse, truncate or drop a diagnostic that the server will refuse", () => {
  const error = new Error("x".repeat(20_001));
  const payload = buildClientErrorPayload(error, null, "/");
  expect(payload.message).toBe(error.message);
  expect(clientErrorReportSchema.safeParse(payload).success).toBe(false);
});

test("a render error that came from a failed call carries the request id the server stamped, and the server log line carries it back", async () => {
  await using root = await createServerHarness({
    env: { [AUTH_MODE_KEY]: "single-user", [AUTH_FALLBACK_KEY]: "owner" },
    physicalPeer: () => "127.0.0.1",
  });
  const stamped: (string | null)[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const response = await root.http.request(new Request(input, init));
    stamped.push(response.headers.get(REQUEST_ID_HEADER));
    return response;
  });
  const logged = vi.spyOn(root.logger, "error");
  try {
    const refused = await createTrpcClient("http://127.0.0.1:1/api/trpc")
      .clientError.mutate({ message: "x".repeat(20_001), url: "/" })
      .then(
        () => undefined,
        (error: unknown) => error,
      );
    if (!(refused instanceof Error)) {
      throw new Error("the oversize report was not refused");
    }
    const payload = buildClientErrorPayload(refused, null, "/");
    expect(stamped).toHaveLength(1);
    expect(stamped[0]).not.toBeNull();
    expect(payload.requestId).toBe(stamped[0]);

    const caller = await root.internalCallerFor(null);
    await caller.clientError(clientErrorReportSchema.parse(payload));
    expect(logged).toHaveBeenCalledWith(expect.objectContaining({ clientError: true, clientRequestId: stamped[0] }), expect.any(String));
  } finally {
    logged.mockRestore();
    vi.unstubAllGlobals();
  }
});
