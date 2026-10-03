// transport/trpc/router — the loose top-level procs living directly on `appRouter` (not a
// per-domain router.ts under routers/). `health`/`echo` are trivial diagnostics; `clientError`
// is the one with real behavior:
// is the one with real behavior: it must stay reachable with NO auth (a render throw can happen before
// auth resolves, or because auth itself is broken) and it must bound the wire payload. The sink's own
// logging behavior (truncation, the clientError:true tag, the clientRequestId rename) is covered by
// tests/server/foundation/observability/client-error.test.ts — this file only proves the TRANSPORT
// contract: reachable anonymously, validates input, always answers { ok: true } on success.

import { logger, logRing } from "@orb/server/foundation/observability";
import { describe, vi } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";
import { caller, makeContext, principal } from "./_support.ts";

describe("clientError (the client error boundary's report verb)", () => {
  test("a well-formed report is accepted with NO auth and answers { ok: true }", async () => {
    const ctx = makeContext({ auth: null });
    const result = await caller(ctx).clientError({
      message: "boom",
      url: "https://example.test/chats/abc",
    });
    expect(result).toEqual({ ok: true });
  });

  test("accepting the report records it into the observability log (the sink actually fired)", async () => {
    const spy = vi.spyOn(logger, "error");
    const ctx = makeContext({ auth: null });
    await caller(ctx).clientError({ message: "boom", url: "https://example.test/" });
    expect(spy).toHaveBeenCalledOnce();
  });

  test("optional fields (stack/ownerStack/requestId) are all accepted together", async () => {
    const ctx = makeContext({ auth: null });
    const result = await caller(ctx).clientError({
      message: "boom",
      url: "https://example.test/",
      stack: "Error: boom\n  at Foo",
      ownerStack: "at <Foo>",
      requestId: "req-123",
    });
    expect(result).toEqual({ ok: true });
  });

  test("a missing required field (url) is rejected with BAD_REQUEST", async () => {
    const ctx = makeContext({ auth: null });
    await expect(
      // biome-ignore lint/suspicious/noExplicitAny: deliberately malformed input — proving the zod gate rejects it, not the type layer.
      // @orb-waive no-test-fabrication(any): deliberately missing required wire field to prove the real tRPC/Zod boundary returns BAD_REQUEST; ends when the caller accepts unknown input directly.
      caller(ctx).clientError({ message: "boom" } as any),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  test("a pathologically oversized message is rejected with BAD_REQUEST (the wire-abuse cap)", async () => {
    const ctx = makeContext({ auth: null });
    await expect(caller(ctx).clientError({ message: "x".repeat(100_000), url: "https://example.test/" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  test("an authenticated caller can also report (auth is optional, not exclusive)", async () => {
    const ctx = makeContext({ auth: principal("user") });
    const result = await caller(ctx).clientError({
      message: "boom",
      url: "https://example.test/",
    });
    expect(result).toEqual({ ok: true });
  });
});

// The production "Report a bug" read. Its one principal-dependent arm is the role gate: the log ring is
// principal-blind, so the error census is the OWNER's (D17 — box diagnostics are not a delegated admin's), and
// every other signed-in caller gets runtime facts only. Driven through the real router, so the output schema's
// grammars run too. What the census may contain is pinned by
// tests/server/foundation/observability/bug-report-diagnostics.test.ts.
describe("bugReportDiagnostics (the production bug reporter's server read)", () => {
  const errorLine = JSON.stringify({ level: "error", time: "2026-09-02T08:00:00.000Z", msg: "chat bus: append failed", code: "SQLITE_BUSY" });

  test("the owner gets the error census", async () => {
    logRing.clear();
    logRing.push(errorLine);
    const read = await caller(makeContext({ auth: principal("owner") })).bugReportDiagnostics();
    expect(read.serverErrors.kind).toBe("included");
    expect(JSON.stringify(read.serverErrors)).toContain("SQLITE_BUSY");
  });

  test("an admin and a user get runtime facts only — never the principal-blind census", async () => {
    logRing.clear();
    logRing.push(errorLine);
    for (const role of ["admin", "user"] as const) {
      const read = await caller(makeContext({ auth: principal(role) })).bugReportDiagnostics();
      expect(read.serverErrors, role).toEqual({ kind: "owner-only" });
      expect(read.runtime.node, role).toMatch(/^v\d/u);
    }
  });

  test("an anonymous caller is refused", async () => {
    await expect(caller(makeContext({ auth: null })).bugReportDiagnostics()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
