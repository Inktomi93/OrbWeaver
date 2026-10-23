// @subject packages/client/src/lib/client-error-report.ts

import { buildClientErrorPayload } from "@orb/client/lib";
import { clientErrorReportSchema } from "@orb/contracts/diagnostics";
import { expect, test } from "@orb/testkit/node";

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
