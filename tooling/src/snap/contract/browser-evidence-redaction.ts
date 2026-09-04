// Disk-safe projections for browser diagnostics and the smaller console/request rings persisted beside
// Snap artifacts. Raw collector types stay live-only; these shapes are the serialization boundary.
import type { CapturedConsole, CapturedRequest } from "../../_shared/browser-capture.ts";
import type { BrowserPageError } from "../../_shared/browser-contract.ts";
import type { BrowserDiagnostic } from "../../_shared/browser-diagnostics.ts";
import type { NetworkEvidenceLimits, NetworkLimitEvent, RedactedJsonValue } from "./har-redaction.ts";

export interface DiskSafeLimitReceipt {
  readonly policy: NetworkEvidenceLimits;
  readonly events: readonly NetworkLimitEvent[];
}

export interface DiskSafeTextEvidence {
  readonly text: string;
  readonly _orbMeasuredLimit: DiskSafeLimitReceipt;
}

export interface DiskSafeBrowserPageError extends Omit<BrowserPageError, "name" | "message" | "stack"> {
  readonly name: string | null;
  readonly message: string;
  readonly stack: string | null;
  readonly _orbMeasuredLimit: DiskSafeLimitReceipt;
}

interface DiskSafeDiagnosticLocation {
  readonly url: string;
  readonly line: number;
  readonly column: number | null;
}

interface DiskSafeConsoleLocation {
  readonly url: string;
  readonly line: number;
  readonly column: number;
}

export interface DiskSafeBrowserDiagnostic
  extends Omit<BrowserDiagnostic, "source" | "category" | "text" | "location" | "stack" | "requestId" | "issueCode" | "details" | "raw"> {
  readonly source: string;
  readonly category: string | null;
  readonly text: string;
  readonly location: DiskSafeDiagnosticLocation | null;
  readonly stack: RedactedJsonValue;
  readonly requestId: string | null;
  readonly issueCode: string | null;
  readonly details: RedactedJsonValue;
  readonly raw: RedactedJsonValue;
  readonly _orbMeasuredLimit: DiskSafeLimitReceipt;
}

export interface DiskSafeBrowserDiagnostics {
  readonly records: readonly DiskSafeBrowserDiagnostic[];
  readonly _orbMeasuredLimit: DiskSafeLimitReceipt;
}

export interface DiskSafeCapturedConsole extends Omit<CapturedConsole, "type" | "text" | "location" | "line"> {
  readonly type: string;
  readonly text: string;
  readonly location: DiskSafeConsoleLocation | null;
  readonly line: string;
  readonly _orbMeasuredLimit: DiskSafeLimitReceipt;
}

export interface DiskSafeCapturedRequest extends Omit<CapturedRequest, "method" | "url" | "failed" | "type"> {
  readonly method: string;
  readonly url: string;
  readonly failed: string | null;
  readonly type: string;
  readonly _orbMeasuredLimit: DiskSafeLimitReceipt;
}
