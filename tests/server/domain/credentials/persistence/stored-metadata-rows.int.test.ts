// A stored key's metadata decides what kind of secret it resolves to, as stored: a key this release does not declare
// rides through as JSON however deep, a row with no metadata is an API key, and an unknown kind falls back to one.
// @subject packages/contracts/src/credentials/index.ts
// @subject packages/server/src/domain/credentials/verbs/resolve.ts
import { providerIdSchema } from "@orb/contracts/inference";
import { userCredentials } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness, SECRET_BOX_TEST_KEY } from "@orb/testkit/node/composed";
import { eq, sql } from "drizzle-orm";

const PROVIDER = providerIdSchema.parse("custom-openai");
// Deeper than a recursive member check survives inside the read seam.
const DEPTH = 2500;
const DEEP = `${"[".repeat(DEPTH)}1${"]".repeat(DEPTH)}`;

test("a stored key resolves to the kind its metadata names, undeclared keys and absent metadata included", async () => {
  await using root = await createServerHarness({ secretBoxKey: SECRET_BOX_TEST_KEY });
  const caller = await root.internalCallerFor(root.ownerId);
  const created = await caller.credentials.add({ provider: PROVIDER, key: "stored-metadata-key" });
  const kindFor = async (stored: string | null): Promise<string> => {
    await root.db
      .update(userCredentials)
      .set({ metadata: stored === null ? null : sql`${stored}` })
      .where(eq(userCredentials.id, created.id));
    return (await root.services.credentials.resolve({ ownerId: root.ownerId, credentialId: created.id, providerId: PROVIDER })).kind;
  };

  expect(await kindFor(`{"auth":"oauthToken","vendor":{"note":"kept","deep":${DEEP}}}`)).toBe("oauthToken");
  expect(await kindFor('{"auth":"endpoint"}')).toBe("bearer");
  expect(await kindFor(null)).toBe("apiKey");
  expect(await kindFor('{"auth":"retired","vendor":1}')).toBe("apiKey");
});
