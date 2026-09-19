// Fixtures for bug-report-button.ct.tsx — playwright-ct mounts only components imported from a module (an
// inline component in the spec file never reaches the CT registry), so the #2444 containment fixture lives
// here.
//
// It reproduces the SHAPE the defect was measured in: the bug-report FORM popover floating over a page whose
// own controls sit directly below it. On the real phone surface that lower control is the composer at
// y=540..620; here it is a fixed strip at the bottom of the viewport with a tap counter, which is the same
// question asked cheaply — does a tap aimed past the open form reach the page underneath?
import type { ReactElement } from "react";
import { useState } from "react";
import { BugReportButton } from "../../../../../packages/client/src/features/app-shell/components/bug-report-button.tsx";

const PAGE_CONTROL_STYLE = { position: "fixed", insetInline: 0, bottom: 0, height: "180px", width: "100%" } as const;

/** The bug-report door with a live page control pinned under it. */
export const BugReportOverPageFixture = (): ReactElement => {
  const [taps, setTaps] = useState(0);
  return (
    <>
      <BugReportButton />
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
