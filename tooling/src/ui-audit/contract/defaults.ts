// design-audit's argv defaults that both ops/parse.ts (the parser) and contract/help.ts (the operator
// prose, which interpolates them) need — split out so help.ts never imports the parser (a cycle: parse.ts
// re-exports DESIGN_AUDIT_HELP from help.ts today).
import type { Severity } from "./findings.ts";

/** `--settle <ms>` (renamed from `--wait` at #1290 F1 — snap's `--wait` names a SELECTOR; this one always
 *  meant milliseconds). */
export const DEFAULT_SETTLE_MS = 500;

export const DEFAULT_FAIL_ON: Severity = "P1";
