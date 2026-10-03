// The estimated-turns relaxation (`turnsEstimated`, read by `turnsLevelFor` and `acceptsAssistantPrefill`) is a
// LOCAL-server ruling: a hosted route nobody measured keeps main's fail-closed floor, because its SDK or API
// refuses what the floor folds (`@ai-sdk/google` throws on a system message after the first turn). Resolved
// through the real runtime, so the scope is proven where the capability is built.

import type { GenerationCapability } from "@orb/contracts/inference";
import { acceptsAssistantPrefill, turnsLevelFor } from "@orb/contracts/inference";
import { createInferenceRuntime } from "@orb/inference";
import { principal } from "../../support/factories/principal.ts";
import { expect, test } from "../../support/fixtures.ts";
import { fakeApiKeySecret, fakeConnection, fakeDeps, memoryStores, newUserId } from "../_support.ts";
import { transcriptFetch } from "../catalog/_local-servers-fetch.ts";

const NOT_FOUND: typeof fetch = () => Promise.resolve(Response.json({ error: "no route" }, { status: 404 }));

async function generationFor(args: {
  readonly providerId: string;
  readonly model: string;
  readonly baseUrl?: string;
  readonly fetch?: typeof fetch;
}): Promise<GenerationCapability> {
  const stores = memoryStores();
  const ownerId = newUserId();
  const credentialId = args.baseUrl === undefined ? fakeConnection({ ownerId, providerId: "x", model: "x" }).id : null;
  const row = fakeConnection({
    ownerId,
    providerId: args.providerId,
    model: args.model,
    baseUrl: args.baseUrl ?? null,
    ...(credentialId === null ? {} : { credentialId: credentialId as never }),
  });
  stores.connections.rows.set(row.id, row);
  const secrets = new Map(credentialId === null ? [] : [[credentialId, fakeApiKeySecret("sk-test")]]);
  const runtime = await createInferenceRuntime(fakeDeps({ stores, fetch: args.fetch ?? NOT_FOUND, secrets }));
  const { capability } = (await runtime.resolve({ task: "chat", principal: principal(ownerId), connectionId: row.id })).resolved;
  if (capability.kind !== "generation") {
    throw new Error(`expected generation, got ${capability.kind}`);
  }
  return capability.generation;
}

test("Gemini direct with the preset at `none` is clamped to strict: a depth system row folds into user text", async () => {
  const gemini = await generationFor({ providerId: "google", model: "gemini-2.5-pro" });
  expect(gemini.turnsEstimated).toBeUndefined();
  expect(turnsLevelFor(gemini, "none")).toEqual({ roleHandlingFloor: "strict", midConversationSystem: false, historySystemRows: false });
});

test("a hosted GPT continue keeps the nudge: an unmeasured prefill cell does not authorize a trailing assistant row", async () => {
  const gpt = await generationFor({ providerId: "openai", model: "gpt-5-mini" });
  expect(gpt.turnsEstimated).toBeUndefined();
  expect(acceptsAssistantPrefill(gpt)).toBe(false);
});

test("an unknown local model with the preset at `none` still sends a mid-history system row", async () => {
  const local = await generationFor({
    providerId: "koboldcpp",
    model: "koboldcpp/qwen2.5-0.5b-instruct-q4_k_m",
    baseUrl: "http://127.0.0.1:1/v1",
    fetch: transcriptFetch("kobold-chat"),
  });
  expect(turnsLevelFor(local, "none")).toEqual({ roleHandlingFloor: "none", midConversationSystem: true, historySystemRows: true });
});
