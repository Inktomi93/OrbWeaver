// Fixtures for bug-report-button.ct.tsx — playwright-ct mounts only components imported from a module (an
// inline component in the spec file never reaches the CT registry), so the form's two postures and the #2444
// containment fixture live here.
//
// The server reads are stubbed IN THE BROWSER, as the prop the chrome entry fills from tRPC: a CT has no
// backend, and a node-side callback cannot hand a value back to the page. The production error ring is
// installed here because `main.tsx`, which installs it in the app, never runs in a CT.
import type { BugReportServerFacts } from "@orb/client/lib";
import { installSafeErrorRing } from "@orb/client/lib";
import type { ReactElement } from "react";
import { useState } from "react";
import { BugReportButton } from "../../../../../packages/client/src/features/app-shell/components/bug-report-button.tsx";

installSafeErrorRing();

/** What the stubbed server says about itself: a stable build and one owner-visible server error. */
const SERVER_FACTS: BugReportServerFacts = {
  version: { version: "0.9.0", commit: "a".repeat(40), short: "a".repeat(12), source: "container", channel: "stable" },
  diagnostics: {
    runtime: { node: "v26.3.0", platform: "linux", arch: "x64", authMode: "local" },
    serverErrors: {
      kind: "included",
      held: 1,
      records: [{ at: 1_790_000_000_000, source: "chat bus", event: null, errorType: "LibsqlError", code: "SQLITE_BUSY", procedure: "chat.send" }],
    },
  },
};

const loadServerFacts = (): Promise<BugReportServerFacts> => Promise.resolve(SERVER_FACTS);

/** The form as a dev build shows it: the public outputs plus the developer capture. */
export const DevBugReportButton = (): ReactElement => <BugReportButton devCapture={true} loadServerFacts={loadServerFacts} />;

/** The form as a production build shows it: the public outputs only. */
export const PublicBugReportButton = (): ReactElement => <BugReportButton devCapture={false} loadServerFacts={loadServerFacts} />;

const PAGE_CONTROL_STYLE = { position: "fixed", insetInline: 0, bottom: 0, height: "180px", width: "100%" } as const;

/** The bug-report door with a live page control pinned under it. It reproduces the SHAPE the defect was
 *  measured in: the form popover floating over a page whose own controls sit directly below it (on the real
 *  phone surface, the composer at y=540..620) — does a tap aimed past the open form reach the page? */
export const BugReportOverPageFixture = (): ReactElement => {
  const [taps, setTaps] = useState(0);
  return (
    <>
      <BugReportButton devCapture={true} loadServerFacts={loadServerFacts} />
      <button
        data-testid="page-control"
        onClick={(): void => {
          setTaps((n) => n + 1);
        }}
        style={PAGE_CONTROL_STYLE}
        type="button"
      >
        Page control
      </button>
      <span data-testid="page-taps">{taps}</span>
    </>
  );
};
