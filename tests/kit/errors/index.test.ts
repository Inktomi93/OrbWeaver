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
import { expect, test } from "vitest";

test("DomainNotFoundError carries entity + id in the message and its own name", () => {
  const err = new DomainNotFoundError("Character", "character_123");
  expect(err).toBeInstanceOf(DomainError);
  expect(err).toBeInstanceOf(Error);
  expect(err.message).toBe("Character character_123 not found");
  expect(err.name).toBe("DomainNotFoundError");
});

test("DomainOperationError exposes its discriminator code", () => {
  const err = new DomainOperationError("weak_password", "Password too weak");
  expect(err.code).toBe("weak_password");
  expect(err.name).toBe("DomainOperationError");
});

test("DomainConflictError is a DomainError with its own name", () => {
  const err = new DomainConflictError("handle taken");
  expect(err).toBeInstanceOf(DomainError);
  expect(err.name).toBe("DomainConflictError");
});

test("DomainRateLimitError accepts the numeric and the options forms", () => {
  const numeric = new DomainRateLimitError("slow down", 1000);
  expect(numeric.msBeforeNext).toBe(1000);
  expect(numeric.remainingPoints).toBeUndefined();

  const opts = new DomainRateLimitError("slow down", { msBeforeNext: 500, remainingPoints: 2 });
  expect(opts.msBeforeNext).toBe(500);
  expect(opts.remainingPoints).toBe(2);
});

test("DomainNoCredentialError names the provider", () => {
  const err = new DomainNoCredentialError("openrouter");
  expect(err.provider).toBe("openrouter");
  expect(err.message).toContain("openrouter");
});

test("DomainForbiddenError is a DomainError with its own name (the owner/admin gate error, D17)", () => {
  const err = new DomainForbiddenError("owner only");
  expect(err).toBeInstanceOf(DomainError);
  expect(err.name).toBe("DomainForbiddenError");
  expect(err.message).toBe("owner only");
});

test("DomainUnavailableError is a DomainError with its own name", () => {
  const err = new DomainUnavailableError("provider down");
  expect(err).toBeInstanceOf(DomainError);
  expect(err.name).toBe("DomainUnavailableError");
});
