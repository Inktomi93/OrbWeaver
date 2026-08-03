import { createPasswordHasher, DUMMY_PASSWORD_HASH } from "@orb/server/infra/auth";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

// Local-password mint/verify. Descriptive (low-entropy) fixture peppers — not real secrets (noSecrets).
const PEPPER = "test-session-secret-at-least-32-chars";
const OTHER_PEPPER = "another-fixture-session-secret-32xx";
const PASSWORD = "correct horse battery";

describe("createPasswordHasher", () => {
  test("round-trips: a hash verifies against its own cleartext", async () => {
    const hasher = createPasswordHasher(PEPPER);
    const stored = await hasher.hash(PASSWORD);
    expect(stored.startsWith("scrypt$")).toBe(true);
    expect(await hasher.verify(PASSWORD, stored)).toBe(true);
  });

  test("a wrong password does not verify", async () => {
    const hasher = createPasswordHasher(PEPPER);
    const stored = await hasher.hash(PASSWORD);
    expect(await hasher.verify("wrong horse battery", stored)).toBe(false);
  });

  test("a different pepper cannot verify the same cleartext (peppered, not bare scrypt)", async () => {
    const stored = await createPasswordHasher(PEPPER).hash(PASSWORD);
    expect(await createPasswordHasher(OTHER_PEPPER).verify(PASSWORD, stored)).toBe(false);
  });

  test("verify returns false (never throws) for a null / malformed stored value", async () => {
    const hasher = createPasswordHasher(PEPPER);
    expect(await hasher.verify(PASSWORD, null)).toBe(false);
    expect(await hasher.verify(PASSWORD, "not-a-valid-hash")).toBe(false);
    expect(await hasher.verify(PASSWORD, "bcrypt$salt$hash")).toBe(false);
  });

  test("the DUMMY hash (the constant-time floor) never matches a real password", async () => {
    expect(await createPasswordHasher(PEPPER).verify(PASSWORD, DUMMY_PASSWORD_HASH)).toBe(false);
  });

  test("a too-short password is rejected at the hashing boundary", async () => {
    await expect(createPasswordHasher(PEPPER).hash("short")).rejects.toThrow("at least");
  });

  test("an unset pepper yields a DISABLED hasher that throws at call time", async () => {
    const hasher = createPasswordHasher(null);
    expect(hasher.enabled).toBe(false);
    await expect(hasher.hash(PASSWORD)).rejects.toThrow("SESSION_SECRET");
  });
});
