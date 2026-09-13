export const UI_PACKAGE_ROOT = "packages/ui";
export const THEME = `${UI_PACKAGE_ROOT}/src/styles/theme.css`;
export const UI_GLOBALS = `${UI_PACKAGE_ROOT}/src/styles/globals.css`;
export const TIERS = `${UI_PACKAGE_ROOT}/src/styles/tiers.css`;
export const CLIENT_GLOBALS = "packages/client/src/styles/globals.css";
export const SHELL = "packages/client/src/features/app-shell/surfaces/shell.css";

export const PRODUCT_STYLESHEETS = [THEME, UI_GLOBALS, TIERS, CLIENT_GLOBALS, SHELL] as const;
export const AUTHORED_STYLESHEETS = [UI_GLOBALS, TIERS, CLIENT_GLOBALS, SHELL] as const;

export type ProductStylesheet = (typeof PRODUCT_STYLESHEETS)[number];

/** The report sink a policy hands in. Deliberately the narrow shape `ctx.report.file` already has, so a
 * reader cannot smuggle a node anchor into a CSS verdict. */
export type CssFamilyReport = (
  file: string,
  details: {
    readonly line: number;
    readonly column: number;
    readonly token?: string;
    readonly subject?: string;
    readonly operation?: string;
    readonly message: string;
  },
) => void;
