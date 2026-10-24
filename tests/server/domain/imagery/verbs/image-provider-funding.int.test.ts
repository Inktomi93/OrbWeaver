// @subject packages/server/src/domain/imagery/verbs/image-provider-ops.ts
// @subject packages/inference/src/roles/executor.ts

import { generationOf } from "@orb/inference";
import { DomainNoCredentialError } from "@orb/kit/errors";
import { createImageProviderOps } from "@orb/server/domain/imagery";
import { expect } from "@orb/testkit/node";
import { TEST_PROVIDER_ID } from "@orb/testkit/node/helpers";
import { fundingConnection, test } from "../../embeddings/verbs/runtime-funding.fixtures.ts";

test("imagery's real provider op reports an auth rejection against its dispatched key", async ({ app, harness, ownerCaller, fundingProvider }) => {
  const key = await ownerCaller.credentials.add({ provider: TEST_PROVIDER_ID, key: "image-funding-key", metadata: { auth: "endpoint" } });
  const connection = await fundingConnection({ ownerCaller, harness, task: "generateImage", credentialId: key.id, allowBackground: false });
  const imagery = createImageProviderOps({ resolve: app.runtime.resolve, generateImage: app.runtime.executor.generateImage });
  const request = { connection, model: connection.model, capability: generationOf(connection), prompt: "A funding control." };
  expect((await imagery.generateImage(request)).images).toHaveLength(1);
  fundingProvider.status(401);
  await expect(imagery.generateImage(request)).toThrowProviderError("auth_failed");
  expect((await ownerCaller.credentials.list()).find((row) => row.id === key.id)?.revokedReason).toBe("auth_failed");
  expect(fundingProvider.calls).toHaveLength(2);
  const requests = [...fundingProvider.requests];
  await expect(imagery.generateImage(request)).rejects.toBeInstanceOf(DomainNoCredentialError);
  expect(fundingProvider.requests).toEqual(requests);
});
