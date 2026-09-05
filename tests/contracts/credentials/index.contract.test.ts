import type { ResolvedCredential } from "@orb/contracts/credentials";
import {
  CRED_PROVIDERS,
  CRED_REVOKED_REASONS,
  CRED_SOURCES,
  credentialProviderSchema,
  credentialSourceSchema,
  parseProviderMetadata,
  providerMetadataSchema,
} from "@orb/contracts/credentials";
import { expect, test } from "../../support/fixtures.ts";

// --- The two axes round-trip + stay distinct (D31, §7.5) ---------------------

test("credentialSourceSchema round-trips every dispatch source", () => {
  for (const source of CRED_SOURCES) {
    expect(credentialSourceSchema.parse(source)).toBe(source);
  }
  expect(CRED_SOURCES).toEqual(["max-pro-sub", "openrouter", "vllm", "local-light", "custom_openai"]);
});

test("credentialProviderSchema round-trips every storable provider", () => {
  for (const provider of CRED_PROVIDERS) {
    expect(credentialProviderSchema.parse(provider)).toBe(provider);
  }
  expect(CRED_PROVIDERS).toEqual(["openrouter", "anthropic", "openai", "custom_openai"]);
});

test("CRED_REVOKED_REASONS is the closed why-a-credential-is-dead vocabulary (#1373)", () => {
  // The literal list is the assertion: each member has a live producer and they are NOT interchangeable —
  // `auth_failed` (the provider looked at the key and rejected it: the post-generation strike-out and the
  // health probe's auth-class verdict), `unreachable` (the probe's 3-strike limit — nothing ever answered,
  // so nothing judged the key), `user` (the owner's own revoke). Collapsing `unreachable` into
  // `auth_failed` would have the pane tell a user the provider rejected their key over their own box being
  // off. A new member is a new PRODUCER plus the client's reason copy, never a spelling.
  expect(CRED_REVOKED_REASONS).toEqual(["auth_failed", "unreachable", "user"]);
  // A revocation reason is NOT a provider-error kind and must never be fed one — the strike-out maps the
  // whole `auth_failed` kind onto the reason, and nothing else crosses.
  for (const reason of CRED_REVOKED_REASONS) {
    expect(credentialSourceSchema.safeParse(reason).success).toBe(false);
    expect(credentialProviderSchema.safeParse(reason).success).toBe(false);
  }
});

test("the source axis and the storage axis are NOT conflated", () => {
  // Sources with no storable-provider row: dispatch-only (the keyless local tiers + the sub).
  expect(credentialProviderSchema.safeParse("max-pro-sub").success).toBe(false);
  expect(credentialProviderSchema.safeParse("vllm").success).toBe(false);
  expect(credentialProviderSchema.safeParse("local-light").success).toBe(false);
  // Storable providers with no resolver arm: storage-only (`anthropic` persists a key row but is not a
  // dispatch source in this worktree; `openai` has no resolver arm yet).
  for (const storageOnly of ["anthropic", "openai"]) {
    expect(credentialSourceSchema.safeParse(storageOnly).success).toBe(false);
  }
  // The overlap (a key stored AND dispatched) is exactly { openrouter, custom_openai }.
  const overlap = CRED_SOURCES.filter((s) => (CRED_PROVIDERS as readonly string[]).includes(s));
  expect(overlap.toSorted()).toEqual(["custom_openai", "openrouter"]);
});

// --- Provider metadata schema (the `metadata` JSON gate) ----------------------

test("providerMetadataSchema accepts + round-trips a custom_openai blob", () => {
  const meta = {
    kind: "custom_openai" as const,
    baseUrl: "http://localhost:8000/v1",
    model: "local-model",
    headers: { "x-tenant": "studio" },
  };
  expect(providerMetadataSchema.parse(meta)).toEqual(meta);
});

test("providerMetadataSchema accepts null", () => {
  expect(providerMetadataSchema.parse(null)).toBeNull();
});

test("parseProviderMetadata returns null for a custom_openai row missing baseUrl", () => {
  // The load-bearing read-side guard: a corrupt row must NOT leak `undefined` as a URL.
  expect(parseProviderMetadata({ kind: "custom_openai" })).toBeNull();
  expect(parseProviderMetadata("not an object")).toBeNull();
  expect(parseProviderMetadata({ kind: "unknown_provider" })).toBeNull();
});

// --- The ResolvedCredential brand is unconstructable from a bare literal ------

test("a plain object literal cannot satisfy the ResolvedCredential brand", () => {
  // @ts-expect-error — the phantom brand key is unreachable, so the literal is unassignable.
  const fake: ResolvedCredential = { source: "vllm", credentialId: null };
  expect(fake.source).toBe("vllm");
});
