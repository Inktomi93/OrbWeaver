// transport/trpc/router — the loose top-level procs living directly on `appRouter` (not a
// per-domain router.ts under routers/). `health`/`echo` are trivial diagnostics; `clientError` (PD-58)
// is the one with real behavior: it must stay reachable with NO auth (a render throw can happen before
// auth resolves, or because auth itself is broken) and it must bound the wire payload. The sink's own
// logging behavior (truncation, the clientError:true tag, the clientRequestId rename) is covered by
// tests/server/foundation/observability/client-error.test.ts — this file only proves the TRANSPORT
// contract: reachable anonymously, validates input, always answers { ok: true } on success.

import { logger } from "@orb/server/foundation/observability";
import { describe, vi } from "vitest";
import { expect, test } from "../../../support/fixtures";
import { caller, makeContext, principal } from "./_support.ts";

describe("clientError (PD-58 — the client error boundary's report verb)", () => {
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
