import { randomBytes } from "node:crypto";
import { createSecretBox } from "@orb/server/infra/crypto";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures";

// Keys are MINTED via randomBytes (the function the boot path uses) rather than hardcoded high-entropy
// literals (noSecrets). The IV is produced by the box under test; we assert its shape/uniqueness
// structurally rather than pinning a value.
const key = (): Buffer => randomBytes(32);
const AAD = "user_123|openrouter";

describe("createSecretBox", () => {
  test("round-trips plaintext under the same AAD", () => {
    const box = createSecretBox(key());
    const sealed = box.encrypt("sk-secret-value", AAD);
    expect(box.decrypt(sealed, AAD)).toBe("sk-secret-value");
  });

  test("decrypt under a DIFFERENT AAD fails loudly (GCM tag), not a silent wrong decrypt", () => {
    const box = createSecretBox(key());
    const sealed = box.encrypt("sk-secret-value", AAD);
    expect(() => box.decrypt(sealed, "user_999|openrouter")).toThrow();
  });

  test("a fresh IV is generated per encrypt — no IV reuse with the key", () => {
    const box = createSecretBox(key());
    const a = box.encrypt("same-plaintext", AAD);
    const b = box.encrypt("same-plaintext", AAD);
    expect(a.iv).not.toBe(b.iv);
    // A reused IV would make identical plaintext produce identical ciphertext — the leak we guard against.
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  test("Sealed carries base64 ciphertext/iv/tag; the IV decodes to 12 bytes", () => {
    const box = createSecretBox(key());
    const sealed = box.encrypt("x", AAD);
    expect(Buffer.from(sealed.iv, "base64").length).toBe(12);
    expect(Buffer.from(sealed.tag, "base64").length).toBeGreaterThan(0);
    expect(typeof sealed.ciphertext).toBe("string");
  });

  test("a wrong key cannot decrypt another box's ciphertext", () => {
    const a = createSecretBox(key());
    const b = createSecretBox(key());
    const sealed = a.encrypt("secret", AAD);
    expect(() => b.decrypt(sealed, AAD)).toThrow();
  });

  test("a null key yields a DISABLED box; it throws only at call time", () => {
    const box = createSecretBox(null);
    expect(box.enabled).toBe(false);
    expect(() => box.encrypt("x", AAD)).toThrow("disabled");
    expect(() => box.decrypt({ ciphertext: "", iv: "", tag: "" }, AAD)).toThrow();
  });
});
