// The LITERAL control for the Admin pane's accessible-name builders (#2261).
//
// Every CT pin on these names now IMPORTS the builder, which is what makes a drifted spelling a compile
// error — and also what makes those pins blind to a COPY change (`name: userRoleFieldName("kes")` against a
// component rendering `userRoleFieldName(handle)` passes under any wording). The wording is therefore pinned
// ONCE, here, at the builders' own home.
//
// A `.dom.test.ts` rather than a `.test.ts` because the reach is through the FEATURE FRONT DOOR: the node
// compiler world has no DOM lib, and `@orb/client/features/user-admin` re-exports section `.tsx` that pull
// `@orb/ui` browser primitives behind them. The browser world is where a pin behind a feature barrel lives.

import { revokeSessionName, userActionsName, userEnabledFieldName, userRoleFieldName } from "@orb/client/features/user-admin";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "../../../../support/fixtures.ts";

test("each per-row admin control names its own subject, in the pane's own grammar", () => {
  // The user rows: N otherwise-identical controls, so the handle is what makes each one askable.
  expect(userRoleFieldName(castId<Handle>("kes"))).toBe("Role — kes");
  expect(userEnabledFieldName(castId<Handle>("kes"))).toBe("Enabled — kes");
  // The user kebab keeps the pane's `<handle> actions`, NOT the library `Actions for <x>` — a reader walking
  // the admin table hears the handle first, which is the column it is scanning.
  expect(userActionsName(castId<Handle>("kes"))).toBe("kes actions");
  expect(revokeSessionName("Firefox on Linux")).toBe("Revoke session — Firefox on Linux");
});
