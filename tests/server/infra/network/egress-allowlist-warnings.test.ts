// An `EGRESS_ALLOWLIST` entry the egress belt cannot match gets one boot warning naming it; an entry it reads gets none.
// The named entry never carries URL credentials: userinfo is cut, and an entry where a credential cannot be ruled out is
// named by its position alone.
// @subject packages/server/src/infra/network/egress.ts

import { egressAllowlistWarnings } from "@orb/server/infra/network";
import { expect, test } from "@orb/testkit/node";

const READ = ["proxy.lan", "proxy.lan:3128", "192.168.1.4", "192.168.1.4:8080", "[fd00::1]:8080", "::1", "engine_gen"];
const UNREAD = ["proxy.lan:not-a-port", "proxy.lan:70000", "http://proxy.lan", "10.0.0.0/8", "proxy.lan/v1"];
const SECRET = "hunter2-secret";

test("each entry the belt cannot read is named in exactly one warning, and no readable entry is", () => {
  const warnings = egressAllowlistWarnings([...READ, ...UNREAD].join(", "));

  expect(warnings.map(({ entry, position }) => ({ entry, position }))).toEqual(UNREAD.map((entry, index) => ({ entry, position: READ.length + index + 1 })));
});

test.for([
  { written: `http://orb:${SECRET}@proxy.lan:not-a-port`, entry: "http://proxy.lan:not-a-port" },
  { written: `orb:${SECRET}@proxy.lan:3128`, entry: "proxy.lan:3128" },
  { written: `orb:${SECRET}@proxy.lan`, entry: "proxy.lan" },
  { written: `https://orb:${SECRET}@proxy.lan/v1`, entry: "https://proxy.lan/v1" },
])("the warning for $written names the entry with its userinfo cut and nothing else changed", ({ written, entry }) => {
  const warnings = egressAllowlistWarnings(`proxy.lan, ${written}`);

  expect(warnings.map((warning) => ({ entry: warning.entry, position: warning.position }))).toEqual([{ entry, position: 2 }]);
  expect(JSON.stringify(warnings)).not.toContain(SECRET);
});

// An `@` outside the authority cannot be told apart from a credential, so the entry is named by its position alone.
test.for([`proxy.lan/v1?key=${SECRET}@x`, `http://orb:pass/${SECRET}@proxy.lan`])("the warning for %s names only its position", (written) => {
  const warnings = egressAllowlistWarnings(`proxy.lan, ${written}`);

  expect(warnings.map((warning) => warning.position)).toEqual([2]);
  expect(JSON.stringify(warnings)).not.toContain(SECRET);
  expect(JSON.stringify(warnings.map((warning) => warning.entry))).not.toContain("proxy.lan");
});

test("a host written with a trailing dot is warned as admitting only that spelling, not as admitting nothing", () => {
  const [dotted] = egressAllowlistWarnings("ollama.lan.");
  const [unread] = egressAllowlistWarnings("ollama.lan:not-a-port");

  expect({ dotted: dotted?.reason, unread: unread?.reason }).toEqual({ dotted: "trailing-dot", unread: "admits-nothing" });
});

test("an empty or unset allowlist warns about nothing", () => {
  expect([egressAllowlistWarnings(undefined), egressAllowlistWarnings(" , ,")]).toEqual([[], []]);
});
