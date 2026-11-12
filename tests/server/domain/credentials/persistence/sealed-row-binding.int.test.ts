// @subject packages/server/src/domain/credentials/persistence/aad.ts
// A sealed credential is bound to its owner and provider by the GCM additional data `<userId>|<providerId>`. A row
// sealed under that string with the deployment key resolves, so a change to the string orphans no stored key without
// this suite failing; a row read under another owner or another provider fails as the typed decrypt refusal.
import { createCipheriv } from "node:crypto";
import type { ProviderId } from "@orb/contracts/inference";
import { providerIdSchema } from "@orb/contracts/inference";
import { userCredentials } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { CREDENTIALS_OP_CODES } from "@orb/server/domain/credentials";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness, SECRET_BOX_TEST_KEY } from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";

const PROVIDER = providerIdSchema.parse("custom-openai");
const OTHER_PROVIDER = providerIdSchema.parse("openrouter");
const SECRET = "aad-binding-credential-material";
const GOLDEN_SECRET = "aad-binding-golden-credential-material";
// A fixed nonce for the independently sealed row only; the box draws a fresh one per encrypt.
const GOLDEN_IV = Buffer.alloc(12, 7);

// Seal as a stored row was sealed: AES-256-GCM under the deployment key, bound to the documented additional data.
// Written apart from the box, so a change to the string the box is handed shows here.
function sealedUnder(owner: UserId, provider: ProviderId, plaintext: string): { readonly ciphertext: string; readonly iv: string; readonly tag: string } {
  const cipher = createCipheriv("aes-256-gcm", SECRET_BOX_TEST_KEY, GOLDEN_IV);
  cipher.setAAD(Buffer.from(`${owner}|${provider}`, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return { ciphertext: ciphertext.toString("base64"), iv: GOLDEN_IV.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
}

test("a credential row sealed under <userId>|<providerId> resolves for that owner and provider, and under no other", async () => {
  await using root = await createServerHarness({ secretBoxKey: SECRET_BOX_TEST_KEY });
  const owner = await root.principalFor(root.ownerId);
  const other = await root.actor();
  const otherPrincipal = await root.principalFor(other.id);
  const resolve = root.services.credentials.resolve;

  const own = await root.services.credentials.add({ principal: owner, provider: PROVIDER, key: SECRET });
  expect((await resolve({ ownerId: root.ownerId, credentialId: own.id, providerId: PROVIDER })).secret).toBe(SECRET);

  // Read under another provider id: refused, never decrypted wrong.
  await expect(resolve({ ownerId: root.ownerId, credentialId: own.id, providerId: OTHER_PROVIDER })).rejects.toMatchObject({
    code: CREDENTIALS_OP_CODES.decryptFailed,
  });

  // Lifted into another owner's row: refused for that owner.
  const lifted = await root.services.credentials.add({ principal: otherPrincipal, provider: PROVIDER, key: "aad-binding-other-material" });
  expect((await resolve({ ownerId: other.id, credentialId: lifted.id, providerId: PROVIDER })).secret).toBe("aad-binding-other-material");
  const sealed = await root.db.select().from(userCredentials).where(eq(userCredentials.id, own.id)).get();
  if (sealed === undefined) {
    throw new Error("the owner's sealed row is missing");
  }
  await root.db.update(userCredentials).set({ ciphertext: sealed.ciphertext, iv: sealed.iv, tag: sealed.tag }).where(eq(userCredentials.id, lifted.id));
  await expect(resolve({ ownerId: other.id, credentialId: lifted.id, providerId: PROVIDER })).rejects.toMatchObject({
    code: CREDENTIALS_OP_CODES.decryptFailed,
  });

  // A row sealed apart from the box under the documented string resolves: the string is the stored format.
  await root.db
    .update(userCredentials)
    .set(sealedUnder(root.ownerId, PROVIDER, GOLDEN_SECRET))
    .where(eq(userCredentials.id, own.id));
  expect((await resolve({ ownerId: root.ownerId, credentialId: own.id, providerId: PROVIDER })).secret).toBe(GOLDEN_SECRET);
});
