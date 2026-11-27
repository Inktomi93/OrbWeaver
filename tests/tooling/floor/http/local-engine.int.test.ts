// @subject tooling/src/floor/http/local-engine.ts
// The one local-engine model resolution snap's `--stage-connection local` and the e2e global setup share, against the
// composed product over real loopback HTTP: a listed model is taken, an engine that is down falls back or refuses by
// the caller's choice, and admission touches the stage's allowlist only when asked.
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import { CONNECTION_OP_CODES } from "@orb/contracts/inference";
import { createServerHarness, servePhysicalPeer } from "@orb/testkit/node/composed";
import { expect, test } from "@orb/testkit/tooling";
import { ENGINE_PORTS } from "../../../../tooling/src/floor/host/ports.ts";
import { LOCAL_ENGINE_BASE_URL, LOCAL_ENGINE_PROVIDER, resolveLocalEngineModel } from "../../../../tooling/src/floor/http/local-engine.ts";
import { connectOrb, stageRefusalReason } from "../../../../tooling/src/floor/http/stage-trpc.ts";

const ENGINE_MODEL = "local-engine-listed-model";
const FALLBACK_MODEL = "local-engine-fallback-model";
const LOOPBACK = "127.0.0.1";

test("the shared endpoint is the box's generation engine under the vllm provider", () => {
  expect([LOCAL_ENGINE_PROVIDER, LOCAL_ENGINE_BASE_URL]).toEqual(["vllm", `http://${LOOPBACK}:${String(ENGINE_PORTS.generate)}/v1`]);
});

/** A multi-user stage's allowlist floor is empty, so a loopback engine is refused until it is admitted. */
async function refusingStage(): Promise<Awaited<ReturnType<typeof createServerHarness>>> {
  return await createServerHarness({
    env: { [AUTH_MODE_KEY]: "local", [AUTH_FALLBACK_KEY]: "owner" },
    physicalPeer: () => LOOPBACK,
    providerFetch: fetch,
  });
}

test("a listed model is taken, and admission adds the engine's own host and port to the allowlist", async () => {
  await using engine = await servePhysicalPeer((request) =>
    Promise.resolve(
      new URL(request.url).pathname.endsWith("/models")
        ? Response.json({ object: "list", data: [{ id: ENGINE_MODEL, object: "model" }] })
        : new Response(null, { status: 404 }),
    ),
  );
  await using root = await refusingStage();
  const api = connectOrb(`http://${LOOPBACK}:${String((await root.listen()).port)}`);
  const baseUrl = `${engine.origin}/v1`;
  const before = (await api.settings.getAppSettingsWithOverrides.query()).resolved.privateEndpointAllowlist;

  const resolved = await resolveLocalEngineModel(api, { baseUrl, fallbackModel: FALLBACK_MODEL, admit: true });

  expect(resolved).toEqual({ model: ENGINE_MODEL, listed: true });
  const after = (await api.settings.getAppSettingsWithOverrides.query()).resolved.privateEndpointAllowlist;
  expect(after).toEqual([...before, new URL(engine.origin).host]);
});

test("without admission a refused endpoint is thrown and the allowlist stays as it was", async () => {
  await using engine = await servePhysicalPeer(() => Promise.resolve(Response.json({ object: "list", data: [{ id: ENGINE_MODEL, object: "model" }] })));
  await using root = await refusingStage();
  const api = connectOrb(`http://${LOOPBACK}:${String((await root.listen()).port)}`);
  const before = (await api.settings.getAppSettingsWithOverrides.query()).resolved.privateEndpointAllowlist;

  const refusal = await resolveLocalEngineModel(api, { baseUrl: `${engine.origin}/v1`, fallbackModel: FALLBACK_MODEL, admit: false }).then(
    () => null,
    (error: unknown) => stageRefusalReason(error),
  );

  expect(refusal).toBe(CONNECTION_OP_CODES.baseUrlRefused);
  expect((await api.settings.getAppSettingsWithOverrides.query()).resolved.privateEndpointAllowlist).toEqual(before);
});

test("an engine that is down yields the declared fallback unchecked, or an error when the caller declared none", async () => {
  // Serve once to learn a free port, then let the peer close: nothing listens there afterwards.
  const downBaseUrl = await (async (): Promise<string> => {
    await using engine = await servePhysicalPeer(() => Promise.resolve(new Response(null, { status: 404 })));
    return `${engine.origin}/v1`;
  })();
  await using root = await refusingStage();
  const api = connectOrb(`http://${LOOPBACK}:${String((await root.listen()).port)}`);

  const fallback = await resolveLocalEngineModel(api, { baseUrl: downBaseUrl, fallbackModel: FALLBACK_MODEL, admit: true });
  expect(fallback).toEqual({ model: FALLBACK_MODEL, listed: false });

  await expect(resolveLocalEngineModel(api, { baseUrl: downBaseUrl, fallbackModel: null, admit: true })).rejects.toThrow(
    `the local engine at ${downBaseUrl} lists no model: `,
  );
});
