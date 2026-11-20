// The one script-posture rule a routed card frame and the client's script notice share: scripts run only when the
// install ceiling, the author's ladder step and the viewer's own switch all say yes, and the holder named is the first in
// that order. Every combination of the three is a stated row, so a reordered or dropped consent fails here.
// @subject packages/contracts/src/chat/roster.ts
import type { HtmlTrustStep } from "@orb/contracts/chat";
import { HTML_TRUST_STEPS, resolveCardScriptVerdict } from "@orb/contracts/chat";
import { expect, test } from "@orb/testkit/node";

const CEILINGS = ["up", "down"] as const;
const VIEWER_SWITCHES = ["on", "off"] as const;
type Consents = `${(typeof CEILINGS)[number]}/${(typeof VIEWER_SWITCHES)[number]}`;

type CardScriptVerdict = ReturnType<typeof resolveCardScriptVerdict>;
const RUNS: CardScriptVerdict = { runs: true };
const INSTALL: CardScriptVerdict = { runs: false, heldBy: "install" };
const CHARACTER: CardScriptVerdict = { runs: false, heldBy: "character" };
const VIEWER: CardScriptVerdict = { runs: false, heldBy: "viewer" };

// A new step fails `tsc` until it has its row.
const EXPECTED = {
  untrusted: { "up/on": CHARACTER, "up/off": CHARACTER, "down/on": INSTALL, "down/off": INSTALL },
  trusted: { "up/on": CHARACTER, "up/off": CHARACTER, "down/on": INSTALL, "down/off": INSTALL },
  interactive: { "up/on": RUNS, "up/off": VIEWER, "down/on": INSTALL, "down/off": INSTALL },
} as const satisfies Record<HtmlTrustStep, Record<Consents, CardScriptVerdict>>;

for (const step of HTML_TRUST_STEPS) {
  for (const ceiling of CEILINGS) {
    for (const viewer of VIEWER_SWITCHES) {
      test(`step ${step}, install ceiling ${ceiling}, viewer's scripts ${viewer}`, () => {
        expect(resolveCardScriptVerdict({ installAllows: ceiling === "up", step, viewerRuns: viewer === "on" })).toEqual(
          EXPECTED[step][`${ceiling}/${viewer}`],
        );
      });
    }
  }
}
