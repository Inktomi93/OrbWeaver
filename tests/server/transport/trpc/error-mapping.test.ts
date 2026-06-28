// classifyDomainError — the pure DomainError→tRPC classifier (transport Invariant #5: one case per
// subclass; load-bearing ORDER — NoCredential before Operation; the `.cause` walk survives re-wrapping).

import {
  DomainConflictError,
  DomainError,
  DomainForbiddenError,
  DomainNoCredentialError,
  DomainNotFoundError,
  DomainOperationError,
  DomainRateLimitError,
  DomainUnavailableError,
} from "@orb/kit/errors";
import { classifyDomainError } from "@orb/server/transport/trpc";
import { describe, expect, test } from "vitest";

describe("classifyDomainError — one case per subclass", () => {
  test("DomainNotFoundError → NOT_FOUND", () => {
    expect(classifyDomainError(new DomainNotFoundError("Tag", "tag_1"))?.code).toBe("NOT_FOUND");
  });

  test("DomainConflictError → CONFLICT", () => {
    expect(classifyDomainError(new DomainConflictError("dup"))?.code).toBe("CONFLICT");
  });

  test("DomainForbiddenError → FORBIDDEN", () => {
    expect(classifyDomainError(new DomainForbiddenError("nope"))?.code).toBe("FORBIDDEN");
  });

  test("DomainNoCredentialError → PRECONDITION_FAILED (checked before Operation)", () => {
    expect(classifyDomainError(new DomainNoCredentialError("openrouter"))?.code).toBe(
      "PRECONDITION_FAILED",
    );
  });

  test("DomainOperationError → BAD_REQUEST", () => {
    expect(classifyDomainError(new DomainOperationError("bad_input", "no"))?.code).toBe(
      "BAD_REQUEST",
    );
  });

  test("DomainRateLimitError → TOO_MANY_REQUESTS", () => {
    expect(classifyDomainError(new DomainRateLimitError("slow down"))?.code).toBe(
      "TOO_MANY_REQUESTS",
    );
  });

  test("DomainUnavailableError → SERVICE_UNAVAILABLE", () => {
    expect(classifyDomainError(new DomainUnavailableError("down"))?.code).toBe(
      "SERVICE_UNAVAILABLE",
    );
  });
});

describe("classifyDomainError — non-domain + cause walk", () => {
  test("a plain Error returns null (left to surface as 500)", () => {
    expect(classifyDomainError(new Error("boom"))).toBeNull();
    expect(classifyDomainError("not even an error")).toBeNull();
  });

  test("a base DomainError with no mapped subclass returns null", () => {
    expect(classifyDomainError(new DomainError("bare"))).toBeNull();
  });

  test("walks the .cause chain so a re-wrapped DomainError still classifies", () => {
    const wrapped = new Error("tx failed");
    wrapped.cause = new DomainNotFoundError("Chat", "chat_1");
    expect(classifyDomainError(wrapped)?.code).toBe("NOT_FOUND");
  });

  test("preserves the typed cause for the client banner", () => {
    const mapped = classifyDomainError(new DomainNoCredentialError("anthropic"));
    expect(mapped?.cause).toBeInstanceOf(DomainNoCredentialError);
  });
});
