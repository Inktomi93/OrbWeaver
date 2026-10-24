// A harness whose native SDK stand-in answers from a scripted wire, with its saved connection.

import { declaredCapabilitySchema } from "@orb/contracts/inference";
import type { Resolved } from "@orb/inference";
import { createServerHarness } from "@orb/testkit/node/composed";
import { createSdkProcessSpawner } from "@orb/testkit/node/helpers";

export const MODEL = "sdk-wire-model";
export const SDK_TOKEN = "controlled-wire-oauth-token";

export async function rootFor(mode: string): Promise<Awaited<ReturnType<typeof createServerHarness>>> {
  const execute = createSdkProcessSpawner(new URL("./sdk-wire-child.ts", import.meta.url), [mode, MODEL, SDK_TOKEN]);
  return await createServerHarness({ logLevel: "error", secretBoxKey: Buffer.alloc(32, 1), sdkSpawn: execute });
}

export async function savedConnection(root: Awaited<ReturnType<typeof createServerHarness>>): Promise<Resolved<"chat">> {
  const principal = await root.principalFor(root.ownerId);
  const credential = await root.services.credentials.add({ principal, provider: "claude-sub", key: SDK_TOKEN });
  const connection = await root.services.connection.create({
    principal,
    providerId: "claude-sub",
    credentialId: credential.id,
    baseUrl: null,
    model: MODEL,
    allowBackground: true,
    declared: declaredCapabilitySchema.parse({ kind: "generation", generation: { input: ["text", "image"] } }),
  });
  const { resolved } = await root.app.runtime.resolve({ task: "chat", connectionId: connection.id, principal, cachedFacts: true });
  await root.settleBackground();
  return { ...resolved, task: "chat" };
}
