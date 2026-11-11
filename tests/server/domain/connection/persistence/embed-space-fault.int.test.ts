// A connection write that can move an embed space resolves the bound encoder before and after the write. A binding that
// cannot resolve is the no-space answer; any other failure of that resolve fails the write as itself, never read as
// "no space", which would let the write move vectors past the space check unseen.
// Storage is the subject: the stored key's sealed bytes are damaged in place, a state no verb writes.
// @subject packages/server/src/domain/connection/substrate/embed-space.ts

import { userCredentials } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";

// Any 32-byte key turns on per-user credential storage, so the encoder can carry a key its resolve must open.
const SECRET_BOX_KEY = Buffer.alloc(32, 7);
// The credentials domain's typed decrypt failure, named as it crosses into this domain; the connection tests may not
// import that domain.
const DECRYPT_FAILURE = "CredentialsDecryptError";
const FOREIGN_TAG = Buffer.alloc(16, 9).toString("base64");

test("a stored key that no longer decrypts fails a space-moving write instead of reading as no space", async () => {
  await using root = await createServerHarness({ logLevel: "error", secretBoxKey: SECRET_BOX_KEY });
  const principal = await root.principalFor(root.ownerId);
  const caller = await root.internalCallerFor(root.ownerId);
  const credential = await root.services.credentials.add({ principal, provider: "custom-openai", key: "embed-space-fault-key" });
  const encoder = await root.services.connection.create({
    principal,
    providerId: "custom-openai",
    credentialId: credential.id,
    baseUrl: "http://127.0.0.1:9999/v1",
    model: "fault-encoder",
    allowBackground: true,
    declared: { kind: "embedding", embedding: { dims: 3 }, features: { detectServer: false } },
  });
  await caller.connection.setBinding({ task: "embed", connectionId: encoder.id });

  // Control: with the key readable the write is admitted.
  expect((await root.services.connection.update({ principal, connectionId: encoder.id, patch: { model: "fault-encoder-moved" } })).model).toBe(
    "fault-encoder-moved",
  );

  await root.db.update(userCredentials).set({ tag: FOREIGN_TAG }).where(eq(userCredentials.id, credential.id));
  await expect(root.services.connection.update({ principal, connectionId: encoder.id, patch: { model: "fault-encoder-again" } })).rejects.toMatchObject({
    name: DECRYPT_FAILURE,
  });
  expect((await root.services.connection.get({ principal, connectionId: encoder.id })).model).toBe("fault-encoder-moved");
});
