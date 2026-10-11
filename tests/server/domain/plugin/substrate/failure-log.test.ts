import { PluginHostDeadlineError } from "@orb/contracts/plugin";
import { invokeFailureKind } from "../../../../../packages/server/src/domain/plugin/substrate/failure-log.ts";
import { expect, test } from "../../../../support/fixtures.ts";

test("a rejected invocation is classified by the typed error name that crossed the sandbox", () => {
  const unavailable = new Error("plugin broker: synchronous parent call timed out");
  unavailable.name = "PluginHostUnavailable";
  expect(invokeFailureKind(new PluginHostDeadlineError("getVariables", 5000))).toBe("host-deadline");
  expect(invokeFailureKind(unavailable)).toBe("broker-unavailable");
  expect(invokeFailureKind(new Error("handler boom"))).toBe("guest-error");
  expect(invokeFailureKind("not an error")).toBe("guest-error");
});
