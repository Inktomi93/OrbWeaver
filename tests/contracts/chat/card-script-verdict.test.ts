// The one script-posture rule a routed card frame and the client's script notice share: scripts run only when the
// author's resolved ladder step is Interactive and the viewer's own switch is on, and the holder named is the first in
// that order. The install's "Default for characters" reaches this rule only through the step an inheriting character
// resolves to, so it is no input here. Every combination is a stated row, so a reordered or dropped consent fails here.
// @subject packages/contracts/src/chat/roster.ts
import type { HtmlTrustStep } from "@orb/contracts/chat";
import { HTML_TRUST_STEPS, resolveCardScriptVerdict } from "@orb/contracts/chat";
import { expect, test } from "@orb/testkit/node";

const VIEWER_SWITCHES = ["on", "off"] as const;
type ViewerSwitch = (typeof VIEWER_SWITCHES)[number];

type CardScriptVerdict = ReturnType<typeof resolveCardScriptVerdict>;
const RUNS: CardScriptVerdict = { runs: true };
const CHARACTER: CardScriptVerdict = { runs: false, heldBy: "character" };
const VIEWER: CardScriptVerdict = { runs: false, heldBy: "viewer" };

// A new step fails `tsc` until it has its row.
const EXPECTED = {
  untrusted: { on: CHARACTER, off: CHARACTER },
  trusted: { on: CHARACTER, off: CHARACTER },
  interactive: { on: RUNS, off: VIEWER },
} as const satisfies Record<HtmlTrustStep, Record<ViewerSwitch, CardScriptVerdict>>;

for (const step of HTML_TRUST_STEPS) {
  for (const viewer of VIEWER_SWITCHES) {
    test(`step ${step}, viewer's scripts ${viewer}`, () => {
      expect(resolveCardScriptVerdict({ step, viewerRuns: viewer === "on" })).toEqual(EXPECTED[step][viewer]);
    });
  }
}
