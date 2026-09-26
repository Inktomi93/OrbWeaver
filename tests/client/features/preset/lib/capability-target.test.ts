// Unit: the capability panel's switcher model (features/preset/lib/capability-target). The Select's values
// round-trip through one encoder, a value the panel never offered decodes to nothing, and a connection that has
// left the user's list falls back to the chat role with the removal stated.

import type { UserConnectionId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { CHAT_ROLE_TARGET, effectiveTarget, targetFromValue, targetValue } from "../../../../../packages/client/src/features/preset/lib/capability-target.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const ROW = castId<UserConnectionId>("user_connection_ctswitch001");

test("every offered target survives the Select's string value, and an unoffered value decodes to nothing", () => {
  const utility = { kind: "role", task: "summarize" } as const;
  const row = { kind: "connection", connectionId: ROW } as const;
  expect(targetFromValue(targetValue(utility), [ROW])).toEqual(utility);
  expect(targetFromValue(targetValue(row), [ROW])).toEqual(row);
  // Embedding is a routable role, but not one whose sampling this panel describes.
  expect(targetFromValue("role:embed", [ROW])).toBeNull();
  expect(targetFromValue(targetValue(row), [])).toBeNull();
});

test("a picked connection that left the list reads the chat role and says it was removed; an unloaded list decides nothing", () => {
  const row = { kind: "connection", connectionId: ROW } as const;
  expect(effectiveTarget(row, [ROW])).toEqual({ target: row, removed: false });
  expect(effectiveTarget(row, [])).toEqual({ target: CHAT_ROLE_TARGET, removed: true });
  expect(effectiveTarget(row, undefined)).toEqual({ target: row, removed: false });
});
