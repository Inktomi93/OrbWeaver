// bugReportChrome — "Report a bug" as a registered `topbar.trail` widget (the `fullscreenChrome` idiom):
// app-shell registers its own chrome through the same door as any feature, with no edit to `shell-topbar.tsx`.
// Visible in every build. Only the developer capture inside the form is dev-gated (`ReportBugChromeButton`).

import type { ChromeEntry } from "#state";
import { ReportBugChromeButton } from "../components/bug-report-button.tsx";

export const bugReportChrome: ChromeEntry = {
  id: "bug-report",
  label: "Report a bug",
  zone: "topbar.trail",
  // After the shell's own toggles (fullscreen is 20) — the report affordance is the last thing on the row.
  order: 90,
  useVisible: (): boolean => true,
  behavior: { kind: "widget", body: (_presentation): ReturnType<typeof ReportBugChromeButton> => <ReportBugChromeButton /> },
};
