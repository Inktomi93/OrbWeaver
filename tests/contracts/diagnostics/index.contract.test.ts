// @orb/contracts/diagnostics — the wire shape of the production "Report a bug" read. It is the second belt
// behind the server's projection: the tRPC output parser runs it, so a projection that ever let free text
// through fails the read instead of shipping the text to a public issue.

import type { BugReportDiagnostics } from "@orb/contracts/diagnostics";
import { BUG_REPORT_SERVER_ERRORS_MAX, bugReportDiagnosticsSchema, DIAGNOSTIC_GRAMMARS } from "@orb/contracts/diagnostics";
import { expect, test } from "../../support/fixtures.ts";

const RECORD = { at: 1_790_000_000_000, source: "chat bus", event: "trpc.unhandled", errorType: "TypeError", code: "SQLITE_BUSY", procedure: "chat.send" };
const RUNTIME = { node: "v26.3.0", platform: "linux", arch: "x64", authMode: "local" } as const;

function readWith(record: Record<string, unknown>): unknown {
  return { runtime: RUNTIME, serverErrors: { kind: "included", records: [record], held: 1 } };
}

test("a grammar-clean read parses, in both arms", () => {
  const owner: BugReportDiagnostics = { runtime: RUNTIME, serverErrors: { kind: "included", records: [RECORD], held: 1 } };
  expect(bugReportDiagnosticsSchema.safeParse(owner).success).toBe(true);
  expect(bugReportDiagnosticsSchema.safeParse({ runtime: RUNTIME, serverErrors: { kind: "owner-only" } }).success).toBe(true);
});

test("free text in any string field is refused, not trimmed", () => {
  for (const [field, value] of [
    ["source", "The lantern-keeper whispered"],
    ["source", "chat bus: append failed for canarychatline"],
    ["event", "trpc unhandled"],
    ["errorType", "Error: canarychatline"],
    ["procedure", "/api/blob/abc"],
  ] as const) {
    expect(bugReportDiagnosticsSchema.safeParse(readWith({ ...RECORD, [field]: value })).success, `${field}=${value}`).toBe(false);
  }
});

test("an error code in mixed case — the shape of a random token or a generated password — is refused", () => {
  expect(DIAGNOSTIC_GRAMMARS.code.test("SQLITE_BUSY")).toBe(true);
  expect(DIAGNOSTIC_GRAMMARS.code.test("share_owner_unclaimed")).toBe(true);
  expect(bugReportDiagnosticsSchema.safeParse(readWith({ ...RECORD, code: "Q3n_x9Zk2pLmA8rT0vWy" })).success).toBe(false);
});

test("a smuggled key is refused at every level, and the owner-only arm cannot carry records", () => {
  expect(bugReportDiagnosticsSchema.safeParse(readWith({ ...RECORD, message: "canarychatline" })).success).toBe(false);
  expect(bugReportDiagnosticsSchema.safeParse({ runtime: { ...RUNTIME, hostname: "box" }, serverErrors: { kind: "owner-only" } }).success).toBe(false);
  expect(bugReportDiagnosticsSchema.safeParse({ runtime: RUNTIME, serverErrors: { kind: "owner-only", records: [RECORD] } }).success).toBe(false);
});

test("the census is capped on the wire", () => {
  const records = Array.from({ length: BUG_REPORT_SERVER_ERRORS_MAX + 1 }, () => RECORD);
  expect(bugReportDiagnosticsSchema.safeParse({ runtime: RUNTIME, serverErrors: { kind: "included", records, held: records.length } }).success).toBe(false);
});
