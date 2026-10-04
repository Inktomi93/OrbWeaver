// A Custom connection reads the facts of the local server it detects (`features.detectServer`): the probe order,
// the per-URL detect cache, a declared reader skipping the probe, and the identity that never moves — the
// credential is resolved for the REGISTERED row and `Resolved.providerId` stays it. The servers are the rig's
// recordings (`tests/inference/catalog/_local-servers-fixtures.ts`).

import type { ResolvedSecret } from "@orb/contracts/credentials";
import type { UserConnection } from "@orb/contracts/inference";
import { createInferenceRuntime } from "@orb/inference";
import { runOpenAiCompatChatTurn } from "../../../packages/inference/src/backends/openai-compat/chat.ts";
import { detectServer } from "../../../packages/inference/src/catalog/detect.ts";
import { principal } from "../../support/factories/principal.ts";
import { expect, test } from "../../support/fixtures.ts";
import { fakeConnection, fakeDeps, memoryStores, memoryTokenLexicon, newUserId } from "../_support.ts";
import { OLLAMA_NATIVE_RECORDINGS } from "../backends/openai-compat/_ollama-native-recordings.ts";
import type { LocalServerArm } from "../catalog/_local-servers-fetch.ts";
import { localServerFetch } from "../catalog/_local-servers-fetch.ts";

const BASE_URL = "http://127.0.0.1:1/v1";
const ROOT = "http://127.0.0.1:1";
const DETECT_KEY = `catalog:endpoint:${BASE_URL}#detect`;
/** KoboldCpp's fake Ollama version route (koboldcpp.py `/api/version`), as the rig's KoboldCpp answered it. */
const KOBOLD_FAKE_OLLAMA_VERSION = { "api-version": { version: "0.7.0" } };

interface Box {
  readonly runtime: Awaited<ReturnType<typeof createInferenceRuntime>>;
  readonly connection: UserConnection;
  readonly seen: string[];
  readonly credentialFor: string[];
  readonly snapshots: Map<string, string>;
  readonly alice: ReturnType<typeof principal>;
}

async function box(
  arm: LocalServerArm,
  opts: { readonly overrides?: Record<string, unknown>; readonly declared?: UserConnection["declared"] } = {},
): Promise<Box> {
  const stores = memoryStores();
  const seen: string[] = [];
  const credentialFor: string[] = [];
  const base = fakeDeps({ stores, fetch: localServerFetch(arm, opts.overrides, seen) });
  const deps = {
    ...base,
    resolveCredential: (args: Parameters<typeof base.resolveCredential>[0]): Promise<ResolvedSecret> => {
      credentialFor.push(args.providerId);
      return base.resolveCredential(args);
    },
  };
  const aliceId = newUserId();
  const connection = fakeConnection({
    ownerId: aliceId,
    providerId: "custom-openai",
    model: MODEL_OF[arm] ?? "any",
    baseUrl: BASE_URL,
    declared: opts.declared ?? null,
  });
  stores.connections.rows.set(connection.id, connection);
  stores.bindings.bind({ actorKind: "user", actorId: aliceId, task: "chat", connectionId: connection.id });
  const runtime = await createInferenceRuntime(deps);
  return { runtime, connection, seen, credentialFor, snapshots: stores.snapshotStore.entries, alice: principal(aliceId) };
}

/** The one model each rig server lists. */
const MODEL_OF: Readonly<Partial<Record<LocalServerArm, string>>> = {
  ollama: "qwen2.5:0.5b",
  "llamacpp-chat": "/models/qwen2.5-0.5b-instruct-q4_k_m.gguf",
  "kobold-chat": "koboldcpp/qwen2.5-0.5b-instruct-q4_k_m",
};

const probed = (seen: readonly string[], path: string): number => seen.filter((url) => url === `${ROOT}${path}`).length;

test("detection asks KoboldCpp first, so a KoboldCpp box that also answers Ollama's version route reads as KoboldCpp", async () => {
  const fetchFor = (arm: LocalServerArm, overrides?: Record<string, unknown>): typeof fetch => localServerFetch(arm, overrides);
  await expect(detectServer({ fetch: fetchFor("kobold-chat", KOBOLD_FAKE_OLLAMA_VERSION), baseUrl: BASE_URL, secret: null })).resolves.toEqual({
    server: "koboldcpp",
  });
  await expect(detectServer({ fetch: fetchFor("llamacpp-chat"), baseUrl: BASE_URL, secret: null })).resolves.toEqual({ server: "llama-cpp" });
  await expect(detectServer({ fetch: fetchFor("ollama"), baseUrl: BASE_URL, secret: null })).resolves.toEqual({ server: "ollama" });
  // KoboldCpp's `/props` is not llama.cpp's: with its version route gone it falls through to the fake Ollama version.
  await expect(
    detectServer({ fetch: fetchFor("kobold-chat", { ...KOBOLD_FAKE_OLLAMA_VERSION, "api-extra-version": undefined }), baseUrl: BASE_URL, secret: null }),
  ).resolves.toEqual({ server: "ollama" });
});

test("a server that answers no probe is none of them, and one that answers nothing at all stays undecided", async () => {
  const notFound = ((): Promise<Response> => Promise.resolve(Response.json({ error: "no route" }, { status: 404 }))) as typeof fetch;
  await expect(detectServer({ fetch: notFound, baseUrl: BASE_URL, secret: null })).resolves.toEqual({ server: null });
  const refused = ((): Promise<Response> => Promise.reject(new TypeError("fetch failed"))) as typeof fetch;
  await expect(detectServer({ fetch: refused, baseUrl: BASE_URL, secret: null })).rejects.toThrow("fetch failed");
});

test("a Custom connection on an Ollama server takes the Ollama row's facts and its native chat route, under its own identity", async () => {
  const b = await box("ollama");
  const { resolved } = await b.runtime.resolve({ task: "chat", principal: b.alice });
  expect(resolved.providerId).toBe("custom-openai");
  expect(resolved.provider.id).toBe("custom-openai");
  // Every credential read names the registered row: the credential's AAD binds that id, never the detected one.
  expect(b.credentialFor.length).toBeGreaterThan(0);
  expect(new Set(b.credentialFor)).toEqual(new Set(["custom-openai"]));
  expect(resolved.features).toMatchObject({ detectServer: true, modelInfoApi: "ollama", nativeChat: "ollama" });
  // The Ollama reader's facts, not the bare list's.
  expect(resolved.capability).toMatchObject({ kind: "generation", generation: { input: ["text"], tools: { parallel: false } } });

  const recorded: { url: string }[] = [];
  await runOpenAiCompatChatTurn(
    {
      api: "chat-completions",
      connection: { ...resolved, task: "chat" },
      params: { maxOutputTokens: 16 },
      systemPrompt: { static: "", dynamic: "" },
      history: [{ role: "user", content: [{ type: "text", text: "Say hello." }] }],
    },
    {
      now: () => 0,
      log: { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined },
      tokens: memoryTokenLexicon(),
      transport: {
        fetch: (input: Parameters<typeof fetch>[0]): Promise<Response> => {
          recorded.push({ url: String(input) });
          const recording = OLLAMA_NATIVE_RECORDINGS.text;
          return Promise.resolve(new Response(recording.body, { status: recording.status, headers: { "content-type": recording.contentType } }));
        },
        app: { name: "t", url: "http://localhost:0" },
      },
    },
  );
  expect(recorded[0]?.url).toBe(`${ROOT}/api/chat`);
});

test("the capability read names the detected row; a llama.cpp box detects as llama.cpp", async () => {
  const b = await box("llamacpp-chat");
  const read = await b.runtime.capabilities.for({ connectionId: b.connection.id, principal: b.alice });
  expect(read.detectedProviderId).toBe("llama-cpp");
  expect(read.capability).toMatchObject({ kind: "generation", generation: { tools: { parallel: true } } });
});

test("the detect answer is cached per URL and persisted; forgetting the endpoint forgets it and probes again", async () => {
  const b = await box("ollama");
  await b.runtime.resolve({ task: "chat", principal: b.alice });
  await b.runtime.resolve({ task: "chat", principal: b.alice });
  expect(probed(b.seen, "/api/extra/version")).toBe(1);
  expect(JSON.parse(b.snapshots.get(DETECT_KEY) ?? "{}")).toMatchObject({ value: { server: "ollama" } });
  // The models mirror keys on the detected reader.
  expect(b.snapshots.has(`catalog:endpoint:${BASE_URL}#ollama`)).toBe(true);
  expect(b.snapshots.has(`catalog:endpoint:${BASE_URL}#list`)).toBe(false);

  await b.runtime.catalogs.invalidateEndpoint(b.connection);
  expect(b.snapshots.has(DETECT_KEY)).toBe(false);
  expect(b.snapshots.has(`catalog:endpoint:${BASE_URL}#ollama`)).toBe(false);
  await b.runtime.resolve({ task: "chat", principal: b.alice });
  expect(probed(b.seen, "/api/extra/version")).toBe(2);
});

test("a declared model-info API skips detection, and declared features layer over the detected row's", async () => {
  const declared = await box("ollama", { declared: { features: { modelInfoApi: "ollama" } } });
  const { resolved } = await declared.runtime.resolve({ task: "chat", principal: declared.alice });
  expect(probed(declared.seen, "/api/extra/version")).toBe(0);
  expect(resolved.features.modelInfoApi).toBe("ollama");
  // A declared reader is not a detected row: Ollama's native route is the Ollama row's quirk, not the reader's.
  expect(resolved.features.nativeChat).toBeUndefined();
  expect((await declared.runtime.capabilities.for({ connectionId: declared.connection.id, principal: declared.alice })).detectedProviderId).toBeUndefined();

  const layered = await box("ollama", { declared: { features: { nativeChat: "none" } } });
  const read = await layered.runtime.resolve({ task: "chat", principal: layered.alice });
  expect(read.resolved.features).toMatchObject({ modelInfoApi: "ollama", nativeChat: "none" });

  const off = await box("ollama", { declared: { features: { detectServer: false } } });
  const plain = await off.runtime.resolve({ task: "chat", principal: off.alice });
  expect(probed(off.seen, "/api/extra/version")).toBe(0);
  expect(plain.resolved.features.modelInfoApi).toBeUndefined();
});
