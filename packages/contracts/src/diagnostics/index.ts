// The production "Report a bug" server read: what the box may say about itself in a PUBLIC issue. Every string
// in it matches a closed grammar below, because the log ring it is projected from is free text that can carry
// chat content, names and credentials.

import { z } from "zod";
import { AUTH_MODES } from "#identity";

/** How many server error records one read carries, newest first. */
export const BUG_REPORT_SERVER_ERRORS_MAX = 20;

/**
 * The only shapes a diagnostic string may take. A value that does not match is dropped, never truncated or
 * escaped: a partial match of free text is still free text.
 *
 * - `source`: a log line's lower-case category, the text before its first `: ` ("chat bus", "boot/seed-owner").
 * - `identifier`: an error class, a tRPC procedure path or a structured `event` ("TypeError", "chat.send").
 * - `code`: an error code in UPPER_SNAKE ("SQLITE_BUSY", "ENOENT") or lower_snake ("share_owner_unclaimed").
 *   Mixed case is refused, which is the shape of a random token.
 * - `runtime`: a runtime fact ("v26.3.0", "linux", "x64").
 */
export const DIAGNOSTIC_GRAMMARS = {
  source: /^[a-z][a-z0-9 ._/-]{0,39}$/u,
  identifier: /^[A-Za-z_$][\w$.]{0,79}$/u,
  code: /^(?:[A-Z][A-Z0-9_]{1,47}|[a-z][a-z0-9_.-]{1,47})$/u,
  runtime: /^[\w.+-]{1,32}$/u,
} as const;

/** One error-level log line, reduced to grammar-checked fields; `at` is epoch ms. */
const bugReportServerErrorSchema = z.strictObject({
  at: z.number().int().positive(),
  source: z.string().regex(DIAGNOSTIC_GRAMMARS.source).nullable(),
  event: z.string().regex(DIAGNOSTIC_GRAMMARS.identifier).nullable(),
  errorType: z.string().regex(DIAGNOSTIC_GRAMMARS.identifier).nullable(),
  code: z.string().regex(DIAGNOSTIC_GRAMMARS.code).nullable(),
  procedure: z.string().regex(DIAGNOSTIC_GRAMMARS.identifier).nullable(),
});
export type BugReportServerError = z.infer<typeof bugReportServerErrorSchema>;

/** The read. `serverErrors` is `owner-only` for every other caller, because the log ring is principal-blind
 *  (D17). `held` counts every error line the ring still holds, so a reader can tell when `records` is the
 *  newest slice of more. */
export const bugReportDiagnosticsSchema = z.strictObject({
  runtime: z.strictObject({
    node: z.string().regex(DIAGNOSTIC_GRAMMARS.runtime),
    platform: z.string().regex(DIAGNOSTIC_GRAMMARS.runtime),
    arch: z.string().regex(DIAGNOSTIC_GRAMMARS.runtime),
    authMode: z.enum(AUTH_MODES),
  }),
  serverErrors: z.discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("included"),
      records: z.array(bugReportServerErrorSchema).max(BUG_REPORT_SERVER_ERRORS_MAX),
      held: z.number().int().nonnegative(),
    }),
    z.strictObject({ kind: z.literal("owner-only") }),
  ]),
});
export type BugReportDiagnostics = z.infer<typeof bugReportDiagnosticsSchema>;
