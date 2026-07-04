// support/matchers — self-test for the two custom matchers (unit lane; no db). Proves the pass/fail
// truth table: the right class+discriminant passes; the wrong discriminant, the wrong class, and a
// RESOLVED promise all fail (via `.not`). The TRPCError side uses the cross-realm duck shape (an Error
// named "TRPCError" carrying a string `code`) — exactly what the matcher detects at runtime; the REAL
// tRPC ladder path is proven end-to-end by `fixtures.int.test.ts` (anonCaller → UNAUTHORIZED).

import { ProviderError } from "@orb/server/infra/providers";
import { describe } from "vitest";
import { expect, test } from "./fixtures.ts";

/** Build the cross-realm TRPCError duck (trpc's own `getTRPCErrorFromUnknown` shape). */
function trpcErrorLike(code: string, message = "boom"): Error {
  const err = Object.assign(new Error(message), { code });
  err.name = "TRPCError";
  return err;
}

describe("toThrowTRPCError", () => {
  test("passes on a rejection with the matching code (promise + thunk forms)", async () => {
    await expect(Promise.reject(trpcErrorLike("NOT_FOUND"))).toThrowTRPCError("NOT_FOUND");
    await expect((): never => {
      throw trpcErrorLike("UNAUTHORIZED");
    }).toThrowTRPCError("UNAUTHORIZED");
  });

  test("fails on the wrong code — the wrong error can no longer pass", async () => {
    await expect(Promise.reject(trpcErrorLike("NOT_FOUND"))).not.toThrowTRPCError("FORBIDDEN");
  });

  test("fails on a non-tRPC rejection (the silent-pass class .rejects.toThrow() allowed)", async () => {
    await expect(Promise.reject(new Error("an FK violation"))).not.toThrowTRPCError("NOT_FOUND");
  });

  test("fails when the promise resolves", async () => {
    await expect(Promise.resolve({ ok: true })).not.toThrowTRPCError("NOT_FOUND");
  });
});

describe("toThrowProviderError", () => {
  test("passes on a ProviderError with the matching kind", async () => {
    const err = new ProviderError({ kind: "rate_limit", retryable: true, message: "throttled" });
    await expect(Promise.reject(err)).toThrowProviderError("rate_limit");
  });

  test("fails on the wrong kind", async () => {
    const err = new ProviderError({ kind: "invalid", retryable: false, message: "bad pairing" });
    await expect(Promise.reject(err)).not.toThrowProviderError("auth_failed");
  });

  test("fails on a non-ProviderError rejection and on a resolved promise", async () => {
    await expect(Promise.reject(new Error("plain"))).not.toThrowProviderError("server");
    await expect(Promise.resolve("fine")).not.toThrowProviderError("server");
  });
});
