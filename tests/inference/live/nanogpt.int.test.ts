// @subject packages/contracts/src/inference/builtin-providers.ts
// The built-in NanoGPT row against the live service, through the composed root: the add dialog's list read, the key
// check, and a thinker's efforts read from the list. All three are free reads, so the check runs on a key with no
// balance. Tagged `live`, so only `E2E_LIVE=1` runs it, and it skips with no `NANOGPT_PROBE_KEY`.
import { lookup } from "node:dns/promises";
import process from "node:process";
import { expect, test } from "@orb/testkit/node";
import { createRuntimeRoot } from "../roles/runtime.fixtures.ts";

// biome-ignore lint/style/noProcessEnv: a live provider key the person running the check exports, not application configuration.
const KEY = process.env["NANOGPT_PROBE_KEY"];
const PROVIDER = "nanogpt";
// A chat model the live list carried with a stated window and output cap, and a thinker that lists its efforts.
const MODEL = "meta-llama/llama-3.1-8b-instruct";
const THINKER = "inclusionai/ling-3.0-tiny:thinking";
const LIVE_TIMEOUT_MS = 60_000;

async function resolveHost(hostname: string): Promise<string[]> {
  return (await lookup(hostname, { all: true })).map((entry) => entry.address);
}

test.skipIf(KEY === undefined)(
  "the NanoGPT row lists stated limits, passes its key check and reads a thinker's listed efforts",
  { tags: ["live"], timeout: LIVE_TIMEOUT_MS },
  async () => {
    const key = KEY ?? "";
    await using root = await createRuntimeRoot({ providerFetch: fetch, networkExecution: { resolver: resolveHost } });
    const principal = await root.principalFor(root.ownerId);
    const listing = await root.services.connection.draftCatalogModels({ principal, providerId: PROVIDER, key, signal: new AbortController().signal });
    expect(listing.listed).toBe(true);
    const listed = listing.listed ? listing.models.find((model) => model.id === MODEL) : undefined;
    expect(listed?.contextLength).toBeGreaterThan(0);
    expect(listed?.maxCompletionTokens).toBeGreaterThan(0);

    const credential = await root.services.credentials.add({ principal, provider: PROVIDER, key });
    const row = await root.services.connection.create({ principal, providerId: PROVIDER, credentialId: credential.id, baseUrl: null, model: THINKER });
    expect(await root.services.connection.probe({ signal: new AbortController().signal, principal, connectionId: row.id })).toMatchObject({ status: "ok" });
    const { capability } = await root.services.connection.capabilities({ principal, connectionId: row.id, signal: new AbortController().signal });
    expect(capability).toMatchObject({ kind: "generation", generation: { reasoning: { mode: "effort", enabled: true } } });
    expect(capability.kind === "generation" ? capability.generation.reasoning.effortLevels : []).not.toEqual([]);
  },
);
