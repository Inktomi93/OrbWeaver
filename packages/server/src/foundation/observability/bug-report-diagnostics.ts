// The production "Report a bug" server read (`@orb/contracts/diagnostics`). It projects the principal-blind log
// ring through closed grammars and then drops any record that still carries a known secret literal, so its
// output can be pasted into a public issue. The developer capture beside `/api/_debug` is a different surface.

import process from "node:process";
import type { BugReportDiagnostics, BugReportServerError } from "@orb/contracts/diagnostics";
import { BUG_REPORT_SERVER_ERRORS_MAX, DIAGNOSTIC_GRAMMARS } from "@orb/contracts/diagnostics";
import type { BoundedRing } from "@orb/kit/bounded-ring";
import { secretRedactionLiterals } from "@orb/kit/secret-redaction";
import type { Env } from "#foundation/env/record";
import { secretLiterals } from "./debug/bug-report.ts";
import { ERROR_LEVEL, parseLogRingLine, ringLineLevel, ringLineTime } from "./debug/log-ring-read.ts";

/** The whole ring: the census counts every error line it still holds. */
const RING_READ_DEPTH = 2000;
/** A log message's category is the text before this separator ("chat bus: DURABLE APPEND FAILED …"). */
const SOURCE_SEPARATOR = ": ";

type Grammar = keyof typeof DIAGNOSTIC_GRAMMARS;

/** The value when it is a string matching `grammar`, else `null`. Never a partial: free text is dropped whole. */
function token(value: unknown, grammar: Grammar): string | null {
  return typeof value === "string" && DIAGNOSTIC_GRAMMARS[grammar].test(value) ? value : null;
}

/** The category of a log message: its lower-case prefix before `: `, or the whole message when it is one bare
 *  lower-case token ("request.thrown"). Anything else, including every message that is free text, yields `null`. */
function messageSource(msg: unknown): string | null {
  if (typeof msg !== "string") {
    return null;
  }
  const cut = msg.indexOf(SOURCE_SEPARATOR);
  if (cut === -1) {
    return msg.includes(" ") ? null : token(msg, "source");
  }
  return token(msg.slice(0, cut), "source");
}

function errField(record: Record<string, unknown>, key: string): unknown {
  const err = record["err"];
  return typeof err === "object" && err !== null ? (err as Record<string, unknown>)[key] : undefined;
}

/** One ring line as a grammar-checked record. The pino `err` serializer carries the class as `type`; a few
 *  call sites log `err` as a plain message string, which carries no class and is dropped. */
function project(record: Record<string, unknown>): BugReportServerError | null {
  const at = ringLineTime(record);
  if (at <= 0) {
    return null;
  }
  return {
    at,
    source: messageSource(record["msg"]),
    event: token(record["event"], "identifier"),
    errorType: token(errField(record, "type"), "identifier"),
    code: token(record["code"], "code") ?? token(errField(record, "code"), "code"),
    procedure: token(record["path"], "identifier"),
  };
}

/** True when any field of the record contains a secret literal. A lower-case password or a hex key can pass
 *  the `source` or `code` grammar, so the grammar alone does not keep the box's own secrets out. */
function carriesSecret(record: BugReportServerError, literals: readonly string[]): boolean {
  const fields = [record.source, record.event, record.errorType, record.code, record.procedure];
  return fields.some((field) => field !== null && literals.some((literal) => field.includes(literal)));
}

/** The safe error census, newest first. */
function serverErrors(logs: BoundedRing<string>, secrets: readonly string[]): Extract<BugReportDiagnostics["serverErrors"], { kind: "included" }> {
  const literals = secretRedactionLiterals(secrets);
  const lines = logs
    .recent(RING_READ_DEPTH)
    .map(parseLogRingLine)
    .filter((record): record is Record<string, unknown> => record !== null && ringLineLevel(record) >= ERROR_LEVEL);
  const records = lines
    .map(project)
    .filter((record): record is BugReportServerError => record !== null && !carriesSecret(record, literals))
    .sort((left, right) => right.at - left.at)
    .slice(0, BUG_REPORT_SERVER_ERRORS_MAX);
  return { kind: "included", records, held: lines.length };
}

/** The bug-report read bound to one root's env record and log ring; the tRPC context carries it. */
export type BugReportDiagnosticsRead = (args: { readonly includeServerErrors: boolean }) => BugReportDiagnostics;

/**
 * The diagnostics a bug report may carry about this server. The error census is the OWNER's only (D17: box
 * diagnostics are not a delegated admin's), decided by the caller from the request Principal; every other
 * caller still gets the runtime facts. The scrub drops every secret-named value the record holds.
 */
export function createBugReportDiagnosticsRead(record: Env, logs: BoundedRing<string>): BugReportDiagnosticsRead {
  const secrets = secretLiterals(record);
  return (args) => ({
    runtime: { node: process.version, platform: process.platform, arch: process.arch, authMode: record.AUTH_MODE },
    serverErrors: args.includeServerErrors ? serverErrors(logs, secrets) : { kind: "owner-only" },
  });
}
