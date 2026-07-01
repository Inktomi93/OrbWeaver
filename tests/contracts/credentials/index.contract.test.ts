import type { ResolvedCredential } from "@orb/contracts/credentials";
import {
  CRED_PROVIDERS,
  CRED_SOURCES,
  credentialProviderSchema,
  credentialSourceSchema,
  parseProviderMetadata,
  providerMetadataSchema,
} from "@orb/contracts/credentials";
import { expect, test } from "../../support/fixtures";

// --- The two axes round-trip + stay distinct (D31, §7.5) ---------------------

test("credentialSourceSchema round-trips every dispatch source", () => {
  for (const source of CRED_SOURCES) {
    expect(credentialSourceSchema.parse(source)).toBe(source);
  }
  expect(CRED_SOURCES).toEqual([
    "max-pro-sub",
    "openrouter",
    "vllm",
    "local-light",
    "custom_openai",
  ]);
});

test("credentialProviderSchema round-trips every storable provider", () => {
  for (const provider of CRED_PROVIDERS) {
    expect(credentialProviderSchema.parse(provider)).toBe(provider);
  }
  expect(CRED_PROVIDERS).toEqual([
    "openrouter",
    "anthropic",
    "openai",
    "google_vertex",
    "custom_openai",
  ]);
});

test("the source axis and the storage axis are NOT conflated", () => {
  // Sources with no storable-provider row: dispatch-only (the keyless local tiers + the sub).
  expect(credentialProviderSchema.safeParse("max-pro-sub").success).toBe(false);
  expect(credentialProviderSchema.safeParse("vllm").success).toBe(false);
  expect(credentialProviderSchema.safeParse("local-light").success).toBe(false);
  // Storable providers with no resolver arm: storage-only.
  for (const storageOnly of ["anthropic", "openai", "google_vertex"]) {
    expect(credentialSourceSchema.safeParse(storageOnly).success).toBe(false);
  }
  // The overlap is exactly { openrouter, custom_openai }.
  const overlap = CRED_SOURCES.filter((s) => (CRED_PROVIDERS as readonly string[]).includes(s));
  expect([...overlap].sort()).toEqual(["custom_openai", "openrouter"]);
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

test("providerMetadataSchema accepts a google_vertex blob and null", () => {
  const meta = { kind: "google_vertex" as const, project: "my-project", region: "us-central1" };
  expect(providerMetadataSchema.parse(meta)).toEqual(meta);
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
