// Which consent ask a pending plugin is making. A never-approved install (the seeded examples, a fan-out copy)
// and an update that widened reach both raise `reconsentPending`; only the second may be described as an
// update. The branch is pinned here; the words each arm prints are not.

import { consentAskKind } from "../../../../../packages/client/src/features/plugin/lib/plugin-copy.ts";
import { expect, test } from "../../../../support/fixtures.ts";

test("a pending plugin the owner has granted nothing is a first ask", () => {
  expect(consentAskKind({ grantedCapabilities: [] })).toBe("first");
});

test("a pending plugin holding an earlier grant is asking about an update", () => {
  expect(consentAskKind({ grantedCapabilities: ["chat.read"] })).toBe("update");
});
