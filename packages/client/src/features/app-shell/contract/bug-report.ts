// Client-owned projections derive their production wire/input homes; computed presentation data stays local.

import type { resolveEvidenceWindow } from "@orb/kit/evidence-window";
import type { buildBugReportClientBundle } from "#src/lib/bug-report-bundle.ts";

export type BugReportCaptureInput = Pick<Parameters<typeof buildBugReportClientBundle>[0], "note"> & {
  readonly windowMinutes: Parameters<typeof resolveEvidenceWindow>[1];
  readonly now?: Parameters<typeof resolveEvidenceWindow>[0];
};
