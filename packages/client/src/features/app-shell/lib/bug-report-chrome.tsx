// bugReportChrome — "Report a bug" as a registered `topbar.trail` widget (the `contextToggleChrome` idiom):
// app-shell registers its own chrome through the same door as any feature, with no edit to `shell-topbar.tsx`.
// Visible in every build. Only the developer capture inside the form is dev-gated (`ReportBugChromeButton`).

import { Bug } from "@orb/ui/icons";
import type { OverflowMenuForm } from "#lib";
import type { ChromeEntry } from "#state";
import { ReportBugChromeButton } from "../components/bug-report-button.tsx";
import { bugReportRequests } from "./bug-report-requests.ts";

const MENU_FORMS: readonly OverflowMenuForm[] = [{ id: "bug-report", label: "Report a bug", icon: Bug, onSelect: (): void => bugReportRequests.request() }];

const alwaysVisible = (): boolean => true;
const menuForms = (): readonly OverflowMenuForm[] => MENU_FORMS;

export const bugReportChrome: ChromeEntry = {
  id: "bug-report",
  label: "Report a bug",
  zone: "topbar.trail",
  // After the shell's own toggles (context toggle is 30) — the report affordance is the last thing on the row.
  order: 90,
  // A phone's topbar budget belongs to the room's name; a rarely used report door rides the You sheet instead.
  mobile: "sheet",
  useVisible: alwaysVisible,
  behavior: {
    kind: "widget",
    body: (presentation): ReturnType<typeof ReportBugChromeButton> => <ReportBugChromeButton presentation={presentation} />,
    // The menu entry opens the button's own form.
    useMenuForms: menuForms,
  },
};
