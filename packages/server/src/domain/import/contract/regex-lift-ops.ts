// The regex lifts the import drivers call. The data shapes live in `@orb/contracts/regex`; the regex domain's verbs
// satisfy these signatures and the composition root wires them.

import type { ImportCardScriptsArgs, ImportCardScriptsResult, ImportGlobalScriptsArgs, ImportPresetScriptsArgs } from "@orb/contracts/regex";

export type ImportCardScripts = (args: ImportCardScriptsArgs) => Promise<ImportCardScriptsResult>;
export type ImportPresetScripts = (args: ImportPresetScriptsArgs) => Promise<ImportCardScriptsResult>;
export type ImportGlobalScripts = (args: ImportGlobalScriptsArgs) => Promise<ImportCardScriptsResult>;
