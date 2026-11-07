// @subject packages/inference/src/backends/openai-compat/diagnostics.ts
// A probe reads `unreachable` only when the engine did not answer. A failure of our own request is no verdict.
import { createServer } from "node:net";
import { makeGenerationCapability } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";

const HTTP_NOT_FOUND = 404;

/** A loopback port nothing listens on: the real fetch against it fails with the transport's own refusal. */
async function refusedPort(): Promise<number> {
  const listener = createServer();
  await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const address = listener.address();
  await new Promise<void>((resolve) => listener.close(() => resolve()));
  if (address === null || typeof address === "string") {
    throw new Error("the probe listener has no TCP address");
  }
  return address.port;
}

async function probeAt(root: ServerTestHarness, baseUrl: string): ReturnType<ServerTestHarness["services"]["connection"]["probe"]> {
  const principal = await root.principalFor(root.ownerId);
  const row = await root.services.connection.create({
    principal,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl,
    model: "probed-model",
    declared: { kind: "generation", features: { detectServer: false }, generation: makeGenerationCapability() },
  });
  return await root.services.connection.probe({ principal, connectionId: row.id });
}

test("a refused connection reads unreachable, with no HTTP status", async () => {
  await using root = await createServerHarness({ providerFetch: fetch });
  const health = await probeAt(root, `http://127.0.0.1:${String(await refusedPort())}/v1`);
  expect(health).toMatchObject({ status: "unreachable" });
  expect(health).not.toHaveProperty("httpStatus");
});

test("an engine that answers with a client error reads unreachable, carrying the status it answered", async () => {
  await using root = await createServerHarness({ providerFetch: () => Promise.resolve(new Response("{}", { status: HTTP_NOT_FOUND })) });
  expect(await probeAt(root, "http://127.0.0.1:9999/v1")).toMatchObject({ status: "unreachable", httpStatus: HTTP_NOT_FOUND });
});

test("a failure of our own request reads unchecked, never unreachable", async () => {
  await using root = await createServerHarness({
    providerFetch: () => Promise.reject(new TypeError("a product bug in the request builder")),
  });
  expect(await probeAt(root, "http://127.0.0.1:9999/v1")).toMatchObject({ status: "unchecked" });
});
