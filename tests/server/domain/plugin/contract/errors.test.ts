import { DomainNotFoundError } from "@orb/kit/errors";
import { asPluginActionError, PluginActionFailedError } from "../../../../../packages/server/src/domain/plugin/contract/errors.ts";
import { expect, test } from "../../../../support/fixtures.ts";

test("host refusals retain their identity while guest failures become the action refusal", () => {
  const host = new DomainNotFoundError("plugin", "owned-install");
  expect(asPluginActionError(host)).toBe(host);
  const guest = asPluginActionError(new Error("guest handler failed"));
  expect(guest).toBeInstanceOf(PluginActionFailedError);
  expect(guest).toMatchObject({ code: "plugin_action_failed", message: "plugin action failed: guest handler failed" });
  expect(asPluginActionError("guest string")).toMatchObject({ code: "plugin_action_failed", message: "plugin action failed: guest string" });
});
