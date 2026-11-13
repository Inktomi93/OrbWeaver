// The accessible names and texts the shell prints on its chrome. A zero-import leaf, so a spec's node side reads them
// without loading the shell graph.

/** The topbar bug door, its sheet row, its tooltip and its popover. */
export const BUG_REPORT_NAME = "Report a bug";

/** The bug report form's note field, which names itself over its visible label. */
export const BUG_REPORT_NOTE_NAME = "What happened?";

const BUG_REPORT_PREPARE_NAME = "Prepare report";
const BUG_REPORT_PREPARING_NAME = "Preparing…";

/** The form's prepare press, by whether the report is being read. */
export function bugReportPrepareLabel(preparing: boolean): string {
  return preparing ? BUG_REPORT_PREPARING_NAME : BUG_REPORT_PREPARE_NAME;
}

/** The ⌘K topbar chip's name, up to the shortcut hint. */
export const COMMAND_CHIP_NAME_LEAD = "Jump, the command menu";

/** The ⌘K topbar chip's name for the platform's `shortcut` hint. */
export function commandChipName(shortcut: string): string {
  return `${COMMAND_CHIP_NAME_LEAD} (${shortcut})`;
}

/** The first tab stop, which moves focus past the chrome to the section's content. */
export const SKIP_TO_CONTENT_NAME = "Skip to content";

/** The You sheet's group of chrome rows, and the heading over its overflow sections. */
export const YOU_SHEET_ACCOUNT_NAME = "Account and settings";
export const YOU_SHEET_MORE_HEADING = "More";

/** The Background section's library grid, and its press that opens the add-a-background form. */
export const BACKGROUND_IMAGE_NAME = "Background image";
export const ADD_BACKGROUND_NAME = "Add background";
