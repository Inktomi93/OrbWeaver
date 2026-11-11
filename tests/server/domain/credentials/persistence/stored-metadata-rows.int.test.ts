// A key's metadata keeps what it was stored with: a key this release does not declare is written by `credentials.add`
// and read back by the metadata parse however deep, and the stored `auth` decides the secret kind, a row with no
// metadata or an unknown kind resolving as an API key.
// @subject packages/contracts/src/credentials/index.ts
// @subject packages/server/src/domain/credentials/verbs/resolve.ts
import { parseProviderMetadata } from "@orb/contracts/credentials";
import { providerIdSchema } from "@orb/contracts/inference";
import { userCredentials } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness, SECRET_BOX_TEST_KEY } from "@orb/testkit/node/composed";
import { eq, sql } from "drizzle-orm";

const PROVIDER = providerIdSchema.parse("custom-openai");
// Deeper than a recursive member check survives inside the read seam.
const DEPTH = 2500;
const DEEP = `${"[".repeat(DEPTH)}1${"]".repeat(DEPTH)}`;

test("a stored key's metadata reads back with its undeclared keys, and its auth names the kind it resolves to", async () => {
  await using root = await createServerHarness({ secretBoxKey: SECRET_BOX_TEST_KEY });
  const caller = await root.internalCallerFor(root.ownerId);
  const remainder = { region: "eu", limits: { rpm: 60, tiers: [1, 2] } };
  const created = await caller.credentials.add({ provider: PROVIDER, key: "stored-metadata-key", metadata: { auth: "endpoint", ...remainder } });
  const storedMetadata = async (): Promise<unknown> =>
    (await root.db.select({ metadata: userCredentials.metadata }).from(userCredentials).where(eq(userCredentials.id, created.id)).get())?.metadata;
  expect(parseProviderMetadata(await storedMetadata())).toEqual({ auth: "endpoint", ...remainder });

  const store = async (stored: string | null): Promise<void> => {
    await root.db
      .update(userCredentials)
      .set({ metadata: stored === null ? null : sql`${stored}` })
      .where(eq(userCredentials.id, created.id));
  };
  const kind = async (): Promise<string> =>
    (await root.services.credentials.resolve({ ownerId: root.ownerId, credentialId: created.id, providerId: PROVIDER })).kind;

  const deep = `{"auth":"oauthToken","vendor":{"note":"kept","deep":${DEEP}}}`;
  await store(deep);
  expect(JSON.stringify(parseProviderMetadata(await storedMetadata()))).toBe(deep);
  expect(await kind()).toBe("oauthToken");
  await store('{"auth":"endpoint"}');
  expect(await kind()).toBe("bearer");
  await store(null);
  expect(await kind()).toBe("apiKey");
  await store('{"auth":"retired","vendor":1}');
  expect(parseProviderMetadata(await storedMetadata())).toBeNull();
  expect(await kind()).toBe("apiKey");
});
