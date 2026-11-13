// An `EGRESS_ALLOWLIST` entry the egress belt cannot match gets one boot warning naming it; an entry it reads gets none.
// @subject packages/server/src/infra/network/egress.ts

import { egressAllowlistWarnings } from "@orb/server/infra/network";
import { expect, test } from "@orb/testkit/node";

const READ = ["proxy.lan", "proxy.lan:3128", "192.168.1.4", "192.168.1.4:8080", "[fd00::1]:8080", "::1", "engine_gen"];
const UNREAD = ["proxy.lan:not-a-port", "proxy.lan:70000", "http://proxy.lan", "10.0.0.0/8", "proxy.lan/v1"];

test("each entry the belt cannot read is named in exactly one warning, and no readable entry is", () => {
  const warnings = egressAllowlistWarnings([...READ, ...UNREAD].join(", "));

  expect(UNREAD.map((entry) => warnings.filter((warning) => warning.includes(`"${entry}"`)).length)).toEqual(UNREAD.map(() => 1));
  expect(warnings).toHaveLength(UNREAD.length);
  expect(READ.filter((entry) => warnings.some((warning) => warning.includes(`"${entry}"`)))).toEqual([]);
});

test("an empty or unset allowlist warns about nothing", () => {
  expect([egressAllowlistWarnings(undefined), egressAllowlistWarnings(" , ,")]).toEqual([[], []]);
});
