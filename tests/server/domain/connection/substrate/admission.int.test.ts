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
  const owner = await seedOwner(db);
  expect(requireProvider(h.ctx, owner.userId, "openrouter")).toMatchObject({ id: "openrouter" });
  expect(() => requireProvider(h.ctx, owner.userId, "no-such-provider")).toThrow(expect.objectContaining({ code: CONNECTION_OP_CODES.providerUnknown }));
});

test("requireBaseUrl refuses a fixed-endpoint provider carrying a base URL, and passes it with none", async () => {
  const db = await freshDb();
  const h = await makeHarness(db);
  const owner = await seedOwner(db);
  const provider = requireProvider(h.ctx, owner.userId, "openrouter");
  await expect(requireBaseUrl(h.ctx, provider, "http://example.test/v1")).rejects.toMatchObject({ code: CONNECTION_OP_CODES.baseUrlShape });
  await expect(requireBaseUrl(h.ctx, provider, null)).resolves.toBeUndefined();
});

test("requireBaseUrl on an endpoint provider requires a URL and admits or refuses it by the deployment's rule", async () => {
  const db = await freshDb();
  const owner = await seedOwner(db);
  const refused = await makeHarness(db, { admission: () => "refused" });
  const invalid = await makeHarness(db, { admission: () => "invalid" });
  const admitted = await makeHarness(db, { admission: () => "admitted" });
  const provider = requireProvider(admitted.ctx, owner.userId, BYO_PROVIDER);

  await expect(requireBaseUrl(admitted.ctx, provider, null)).rejects.toMatchObject({ code: CONNECTION_OP_CODES.baseUrlShape });
  await expect(requireBaseUrl(invalid.ctx, provider, "ftp://example.test")).rejects.toMatchObject({ code: CONNECTION_OP_CODES.baseUrlInvalid });
  await expect(requireBaseUrl(refused.ctx, provider, BYO_BASE_URL)).rejects.toMatchObject({ code: CONNECTION_OP_CODES.baseUrlRefused });
  await expect(requireBaseUrl(admitted.ctx, provider, BYO_BASE_URL)).resolves.toBeUndefined();
});

// The refusal names the exact `host:port` the owner's Admit writes down, the scheme's port included.
test("a refused endpoint is named by the authority the Admit entry needs", async () => {
  const db = await freshDb();
  const owner = await seedOwner(db);
  const refused = await makeHarness(db, { admission: () => Promise.resolve("refused") });
  const provider = requireProvider(refused.ctx, owner.userId, BYO_PROVIDER);

  await expect(requireBaseUrl(refused.ctx, provider, "http://ollama.lan:11434/v1")).rejects.toMatchObject({
    code: CONNECTION_OP_CODES.baseUrlRefused,
    message: expect.stringContaining('"ollama.lan:11434"'),
  });
  await expect(requireBaseUrl(refused.ctx, provider, "http://10.0.0.5/v1")).rejects.toMatchObject({
    message: expect.stringContaining('"10.0.0.5:80"'),
  });
});

test("requireCredential passes a null id, an owned id, and refuses a foreign one as the same not-yours verdict", async () => {
  const db = await freshDb();
  const owner = await seedOwner(db);
  const h = await makeHarness(db, { credentialOwned: () => false });
  const credentialId = castId<UserCredentialId>("user_credential_other");

  await expect(requireCredential(h.ctx, owner.userId, null)).resolves.toBeUndefined();
  await expect(requireCredential(h.ctx, owner.userId, credentialId)).rejects.toMatchObject({ code: CONNECTION_OP_CODES.credentialForeign });
});
