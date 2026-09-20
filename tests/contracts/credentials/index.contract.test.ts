import type { ResolvedSecret } from "@orb/contracts/credentials";
import { CRED_REVOKED_REASONS, parseProviderMetadata, providerMetadataSchema, RESOLVED_SECRET_KINDS } from "@orb/contracts/credentials";
import { expect, test } from "../../support/fixtures.ts";

// --- The credential vocabulary under connections-as-the-unit (inference program §3.2, F7) -------------
// The retired `CRED_SOURCES` / `CRED_PROVIDERS` axes have NO successor here: a row's `provider` is a registry
// id validated at the domain, and what a resolved secret IS is the `kind` tuple below.

test("RESOLVED_SECRET_KINDS is the closed what-kind-of-secret vocabulary, spelled from the provider row's auth", () => {
  expect(RESOLVED_SECRET_KINDS).toEqual(["apiKey", "oauthToken", "bearer", "none"]);
});

test("CRED_REVOKED_REASONS is the closed why-a-credential-is-dead vocabulary (#1373)", () => {
  // The literal list is the assertion: each member has a live producer and they are NOT interchangeable —
  // `auth_failed` (the provider looked at the key and rejected it: the post-generation strike-out and the
  // probe's auth-class verdict), `unreachable` (the probe's 3-strike limit — nothing ever answered, so
  // nothing judged the key), `user` (the owner's own revoke). Collapsing `unreachable` into `auth_failed`
  // would have the pane tell a user the provider rejected their key over their own box being off.
  expect(CRED_REVOKED_REASONS).toEqual(["auth_failed", "unreachable", "user"]);
});

// --- Provider metadata schema (the `metadata` JSON gate) — keyed on the provider row's `auth` ----------

test("providerMetadataSchema accepts + round-trips each auth arm", () => {
  for (const auth of ["apiKey", "oauthToken", "endpoint"] as const) {
    const meta = { auth, note: "loose extra keys survive" };
    expect(providerMetadataSchema.parse(meta)).toEqual(meta);
  }
});

test("providerMetadataSchema accepts null", () => {
  expect(providerMetadataSchema.parse(null)).toBeNull();
});

test("parseProviderMetadata returns null for an unknown or malformed blob (the read-side guard)", () => {
  expect(parseProviderMetadata({ kind: "custom_openai", baseUrl: "http://x/v1" })).toBeNull(); // the retired shape
  expect(parseProviderMetadata("not an object")).toBeNull();
  expect(parseProviderMetadata({ auth: "unknown" })).toBeNull();
});

// --- The ResolvedSecret brand is unconstructable from a bare literal ------

test("a plain object literal cannot satisfy the ResolvedSecret brand", () => {
  // @ts-expect-error — the phantom brand key is unreachable, so the literal is unassignable.
  const fake: ResolvedSecret = { kind: "none", secret: null, credentialId: null };
  expect(fake.kind).toBe("none");
});
