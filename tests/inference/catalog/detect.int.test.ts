import { makeGenerationCapability } from "@orb/testkit/iso/inference-capability.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";

const BASE_URL = "http://8.8.8.8:9999/v1";
const DETECT_SNAPSHOT_KEY = `catalog:endpoint:${BASE_URL}#detect`;
const MODELS_PATH = "/v1/models";

/** A 200 whose body dies mid-read, the way a socket reset or the shared read deadline ends a slow server. */
function bodyThatDies(): Response {
  const body = new ReadableStream<Uint8Array>({
    pull(controller): void {
      controller.error(new Error("socket reset while reading the body"));
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
}

/** Resolve one detecting custom row against a server whose `/v1/models` answers `modelsReply`; every other probe 404s. */
async function detectSnapshotAfterResolve(modelsReply: () => Response): Promise<unknown> {
  await using root = await createServerHarness({
    providerFetch: (input) => {
      const url = input instanceof Request ? input.url : String(input);
      return Promise.resolve(url.endsWith(MODELS_PATH) ? modelsReply() : new Response(null, { status: 404 }));
    },
  });
  const principal = await root.principalFor(root.ownerId);
  const row = await root.services.connection.create({
    principal,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: BASE_URL,
    model: "owned-model",
    declared: { kind: "generation", generation: makeGenerationCapability() },
  });
  await root.services.connection.resolve({ principal, task: "chat", connectionId: row.id }).catch(() => undefined);
  return (await root.services.settings.getGlobalSetting(DETECT_SNAPSHOT_KEY))?.value ?? null;
}

test("a detection probe whose body read fails is not persisted as 'no known server'", async () => {
  expect(await detectSnapshotAfterResolve(bodyThatDies)).toBeNull();
});

test("a server that answers every probe and matches none is persisted as 'no known server'", async () => {
  const snapshot = await detectSnapshotAfterResolve(() => new Response("<html>not a model list</html>", { status: 200 }));
  expect(JSON.parse(String(snapshot))).toMatchObject({ value: { server: null } });
});
