// substrate/admission — the write-seam refusals a connection or draft passes before storage: an unregistered
// provider, a base URL shape mismatch, an inadmissible endpoint host, and a foreign credential. One home so
// `create`/`update` and the draft catalog reads cannot disagree about what a legal draft is.

import { CONNECTION_OP_CODES } from "@orb/contracts/inference";
import type { UserCredentialId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { requireBaseUrl, requireCredential, requireProvider } from "../../../../../packages/server/src/domain/connection/substrate/admission.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { BYO_BASE_URL, BYO_PROVIDER, makeHarness, seedOwner } from "../_support.ts";

test("requireProvider returns a registered provider and throws providerUnknown otherwise", async () => {
  const db = await freshDb();
  const h = await makeHarness(db);
  expect(requireProvider(h.ctx, "openrouter")).toMatchObject({ id: "openrouter" });
  expect(() => requireProvider(h.ctx, "no-such-provider")).toThrowError(expect.objectContaining({ code: CONNECTION_OP_CODES.providerUnknown }));
});

test("requireBaseUrl refuses a fixed-endpoint provider carrying a base URL, and passes it with none", () => {
  const provider = { auth: "apiKey" as const, label: "OpenRouter" } as Parameters<typeof requireBaseUrl>[1];
  expect(() => requireBaseUrl({} as Parameters<typeof requireBaseUrl>[0], provider, "http://example.test/v1")).toThrowError(
    expect.objectContaining({ code: CONNECTION_OP_CODES.baseUrlShape }),
  );
  expect(() => requireBaseUrl({} as Parameters<typeof requireBaseUrl>[0], provider, null)).not.toThrow();
});

test("requireBaseUrl on an endpoint provider requires a URL and admits or refuses it by the deployment's rule", async () => {
  const db = await freshDb();
  const refused = await makeHarness(db, { admission: () => "refused" });
  const invalid = await makeHarness(db, { admission: () => "invalid" });
  const admitted = await makeHarness(db, { admission: () => "admitted" });
  const provider = requireProvider(admitted.ctx, BYO_PROVIDER);

  expect(() => requireBaseUrl(admitted.ctx, provider, null)).toThrowError(expect.objectContaining({ code: CONNECTION_OP_CODES.baseUrlShape }));
  expect(() => requireBaseUrl(invalid.ctx, provider, "ftp://example.test")).toThrowError(expect.objectContaining({ code: CONNECTION_OP_CODES.baseUrlInvalid }));
  expect(() => requireBaseUrl(refused.ctx, provider, BYO_BASE_URL)).toThrowError(expect.objectContaining({ code: CONNECTION_OP_CODES.baseUrlRefused }));
  expect(() => requireBaseUrl(admitted.ctx, provider, BYO_BASE_URL)).not.toThrow();
});

test("requireCredential passes a null id, an owned id, and refuses a foreign one as the same not-yours verdict", async () => {
  const db = await freshDb();
  const owner = await seedOwner(db);
  const h = await makeHarness(db, { credentialOwned: () => false });
  const credentialId = castId<UserCredentialId>("user_credential_other");

  await expect(requireCredential(h.ctx, owner.userId, null)).resolves.toBeUndefined();
  await expect(requireCredential(h.ctx, owner.userId, credentialId)).rejects.toMatchObject({ code: CONNECTION_OP_CODES.credentialForeign });
});
