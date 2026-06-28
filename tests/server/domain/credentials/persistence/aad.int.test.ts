// persistence/aad — the load-bearing AES-256-GCM AAD invariant (credentials.md "AAD invariant"). The
// byte-string `${userId}|${provider}` MUST stay byte-identical: any change to the separator/order/
// stringification silently breaks decryption for every stored credential. This test PINS the exact format
// AND proves the belt end-to-end against the real SecretBox: a row decrypts only under its own
// `(owner, provider)` slot; swapping either half fails the GCM tag check (loud error, not a wrong decrypt).

import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe, expect, test } from "vitest";
import { aadFor } from "../../../../../packages/server/src/domain/credentials/persistence/aad.ts";
import { createSecretBox } from "../../../../../packages/server/src/infra/crypto/secrets.ts";

const alice = castId<UserId>("user_alice");
const bob = castId<UserId>("user_bob");

describe("aadFor", () => {
  test("is byte-identical: userId, then a pipe separator, then provider", () => {
    expect(aadFor(alice, "openrouter")).toBe("user_alice|openrouter");
    expect(aadFor(alice, "custom_openai")).toBe("user_alice|custom_openai");
  });

  test("round-trips through the SecretBox: decrypt under the same slot yields the plaintext", () => {
    const box = createSecretBox(Buffer.alloc(32, 7));
    const sealed = box.encrypt("sk-secret", aadFor(alice, "openrouter"));
    expect(box.decrypt(sealed, aadFor(alice, "openrouter"))).toBe("sk-secret");
  });

  test("a different owner's AAD fails the GCM tag (row-lift is impossible without re-encryption)", () => {
    const box = createSecretBox(Buffer.alloc(32, 7));
    const sealed = box.encrypt("sk-secret", aadFor(alice, "openrouter"));
    expect(() => box.decrypt(sealed, aadFor(bob, "openrouter"))).toThrow();
  });

  test("a different provider's AAD fails the GCM tag (slot move is impossible)", () => {
    const box = createSecretBox(Buffer.alloc(32, 7));
    const sealed = box.encrypt("sk-secret", aadFor(alice, "openrouter"));
    expect(() => box.decrypt(sealed, aadFor(alice, "custom_openai"))).toThrow();
  });
});
