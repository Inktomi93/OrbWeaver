// Which consent ask a pending plugin is making. A never-approved install (the seeded examples, a fan-out copy)
// and an update that widened reach both raise `reconsentPending`; only the second may be described as an
// update. The branch is pinned here; the words each arm prints are not.

import { consentAskKind, statusCopy } from "../../../../../packages/client/src/features/plugin/lib/plugin-copy.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const PENDING_OFF = { status: "disabled", reconsentPending: true } as const;

test("a pending plugin with no grant and no recorded host delta is a first ask, and its status is quiet", () => {
  const plugin = { ...PENDING_OFF, grantedCapabilities: [], widenedNetHosts: [] };
  expect(consentAskKind(plugin)).toBe("first");
  expect(statusCopy(plugin).intent).toBe("neutral");
});

test("a pending plugin holding an earlier grant is asking about an update, and its status warns", () => {
  const plugin = { ...PENDING_OFF, grantedCapabilities: ["chat.read" as const], widenedNetHosts: [] };
  expect(consentAskKind(plugin)).toBe("update");
  expect(statusCopy(plugin).intent).toBe("warning");
});

test("an update that widened the hosts of an empty-grant plugin is still an update, and its status warns", () => {
  const plugin = { ...PENDING_OFF, grantedCapabilities: [], widenedNetHosts: ["collector.example"] };
  expect(consentAskKind(plugin)).toBe("update");
  expect(statusCopy(plugin).intent).toBe("warning");
});
