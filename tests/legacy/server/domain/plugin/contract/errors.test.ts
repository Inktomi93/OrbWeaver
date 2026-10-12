import { DomainNotFoundError } from "@orb/kit/errors";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { asPluginActionError, PluginActionFailedError } from "#server/domain/plugin/contract/errors.ts";

test("host refusals retain their identity while guest failures become the action refusal", () => {
  const host = new DomainNotFoundError("plugin", "owned-install");
  expect(asPluginActionError(host)).toBe(host);
  const guest = asPluginActionError(new Error("guest handler failed"));
  expect(guest).toBeInstanceOf(PluginActionFailedError);
  expect(guest).toMatchObject({ code: "plugin_action_failed", message: "plugin action failed: guest handler failed" });
  expect(asPluginActionError("guest string")).toMatchObject({ code: "plugin_action_failed", message: "plugin action failed: guest string" });
});
