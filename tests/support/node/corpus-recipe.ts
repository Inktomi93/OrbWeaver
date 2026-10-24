// The publisher and native capsule qualification share one external execution recipe; production still owns every domain operation.
import { spawn } from "node:child_process";
import { lookup } from "node:dns/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { errorMessage } from "@orb/kit/error-message";
import { createFrozenClock } from "../iso/clock.ts";
import { createSeededIds } from "../iso/ids.ts";
import type { CorpusCapsuleOptions, CorpusHarnessOptions } from "./corpus.ts";
import { cloneCorpusFixture, createCorpusHarness } from "./corpus.ts";
import { CORPUS_CHAT_MODEL, corpusImageryPhysicalBytes, createCorpusChatWire } from "./corpus-chat-wire.ts";
import { CORPUS_IMAGE_MODEL } from "./corpus-imagery.ts";
import { corpusKnowledgeVariantsText, createKnowledgeSwipeWire } from "./corpus-knowledge-wire.ts";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_PROVIDER_ENDPOINT,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  corpusEmbeddingForText,
  createCorpusProviderExecution,
  createCorpusProviderServer,
} from "./corpus-provider.ts";
import { createRpgFlightWire, RPG_RECURSION_MODEL, RPG_ROUND_MODEL } from "./corpus-rpg-flight-wire.ts";
import { createCorpusRpgWire } from "./corpus-rpg-wire.ts";
import { settleCorpusWorkloads } from "./corpus-workloads.ts";
import { SECRET_BOX_TEST_KEY } from "./server.ts";

export const CORPUS_OWNER_PASSWORD = "synthetic-capsule-owner-password";
export const CORPUS_PROVIDER_KEY = "synthetic-capsule-provider-key";

export interface CorpusRecipe {
  readonly options: Omit<CorpusCapsuleOptions, "directory">;
  readonly key: Buffer;
  readonly clock: ReturnType<typeof createFrozenClock>;
  readonly ids: ReturnType<typeof createSeededIds>;
  readonly swipes: ReturnType<typeof createKnowledgeSwipeWire>;
  readonly lifecycleWire: ReturnType<typeof createCorpusChatWire>;
  readonly rpgFlightWire: ReturnType<typeof createRpgFlightWire>;
}

interface CorpusRecipeExecution extends Pick<CorpusRecipe, "swipes" | "lifecycleWire" | "rpgFlightWire"> {
  readonly execution: ReturnType<typeof createCorpusProviderExecution>;
}

export interface PreparedCorpusSnapFixture extends AsyncDisposable {
  readonly fixture: Awaited<ReturnType<typeof cloneCorpusFixture>>;
  readonly provider: Pick<Awaited<ReturnType<typeof createCorpusProviderServer>>, "baseUrl" | "requests">;
}

type CorpusNetworkExecution = NonNullable<CorpusHarnessOptions["networkExecution"]>;
type CorpusProviderTransport = {
  readonly [Key in keyof Pick<CorpusNetworkExecution, "fetch" | "resolver">]-?: NonNullable<CorpusNetworkExecution[Key]>;
};

/** Physical execution for the one allocated corpus provider. */
export function createCorpusProviderTransport(
  baseUrl: string,
  nativeFetch: typeof fetch = fetch,
  nativeResolver: CorpusProviderTransport["resolver"] = async (hostname) => (await lookup(hostname, { all: true })).map(({ address }) => address),
): CorpusProviderTransport {
  const endpoint = new URL(baseUrl);
  return {
    fetch: async (input, init): Promise<Response> => {
      const request = new Request(input, init);
      if (new URL(request.url).origin !== endpoint.origin) {
        throw new Error("Corpus provider refused off-origin execution");
      }
      return await nativeFetch(request);
    },
    resolver: (hostname) =>
      hostname === endpoint.hostname ? nativeResolver(hostname) : Promise.reject(new Error("Corpus provider refused off-origin address resolution")),
  };
}

/** Keep the physical fixture until the consumer's retirement has been confirmed. */
export async function runCorpusSnapConsumer(
  resource: AsyncDisposable,
  consume: () => Promise<number>,
  retire: () => Promise<void>,
  retained: (reason: string) => void,
): Promise<number> {
  let code = 2;
  let executionFailure: Error | undefined;
  try {
    code = await consume();
  } catch (error) {
    executionFailure = error instanceof Error ? error : new Error("Corpus Snap consumer failed", { cause: error });
  }
  try {
    await retire();
  } catch (error) {
    retained(
      [executionFailure, error]
        .filter((failure) => failure !== undefined)
        .map(errorMessage)
        .join("; "),
    );
    return 2;
  }
  await resource[Symbol.asyncDispose]();
  if (executionFailure !== undefined) {
    throw executionFailure;
  }
  return code;
}

/** The publisher and physical stage edge consume the same request-specific response script. */
export async function createCorpusRecipeExecution(baseUrl?: string): Promise<CorpusRecipeExecution> {
  const rpgWire = createCorpusRpgWire();
  const swipes = createKnowledgeSwipeWire();
  const lifecycleWire = createCorpusChatWire();
  const rpgFlightWire = createRpgFlightWire();
  const execution = createCorpusProviderExecution({
    ...(baseUrl === undefined ? {} : { baseUrl }),
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL, CORPUS_CHAT_MODEL, CORPUS_IMAGE_MODEL, RPG_RECURSION_MODEL, RPG_ROUND_MODEL],
    embedding: corpusEmbeddingForText,
    chatText: corpusKnowledgeVariantsText,
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: await corpusImageryPhysicalBytes(),
    usage: { promptTokens: 40, completionTokens: 15 },
    completion: (body) => rpgFlightWire.completion(body) ?? rpgWire.completion(body) ?? swipes.completion(body) ?? lifecycleWire.completion(body),
  });
  return { execution, swipes, lifecycleWire, rpgFlightWire };
}

/** Only external responses, business clock/IDs and process-local crypto vary; nothing constructs a replacement domain graph. */
export async function createCorpusRecipe(parent: string): Promise<CorpusRecipe> {
  const { execution, swipes, lifecycleWire, rpgFlightWire } = await createCorpusRecipeExecution();
  const key = SECRET_BOX_TEST_KEY;
  const clock = createFrozenClock();
  const ids = createSeededIds();
  const options = {
    server: {
      clock,
      ids,
      env: { ["AUTH_MODE"]: "local", ["AUTH_FALLBACK"]: "owner" },
      providerFetch: execution.execute,
      secretBoxKey: key,
      temporaryParentDir: parent,
      pluginSpawn: spawn,
    },
    seed: { ownerPassword: CORPUS_OWNER_PASSWORD, log: (): void => undefined },
    privateCredential: { provider: "custom-openai", key: CORPUS_PROVIDER_KEY, metadata: { auth: "endpoint" as const } },
  } satisfies Omit<CorpusCapsuleOptions, "directory">;
  return { options, key, clock, ids, swipes, lifecycleWire, rpgFlightWire };
}

/** Configure only an owned clone through production; the native consumer must stop before disposal. */
export async function prepareCorpusSnapFixture(directory?: string): Promise<PreparedCorpusSnapFixture> {
  await using ownership = new AsyncDisposableStack();
  const parent = await mkdtemp(join(tmpdir(), "orb-corpus-snap-"));
  ownership.defer(() => rm(parent, { recursive: true, force: true }));
  // biome-ignore lint/nursery/useDisposables: ownership.use registers disposal; ownership.move transfers it to the returned fixture lifetime.
  const provider: PreparedCorpusSnapFixture["provider"] = ownership.use(
    await createCorpusProviderServer(async (endpoint) => (await createCorpusRecipeExecution(endpoint)).execution),
  );
  const { baseUrl, requests } = provider;
  const transport = createCorpusProviderTransport(baseUrl);
  let fixture: Awaited<ReturnType<typeof cloneCorpusFixture>>;
  {
    await using root = await createCorpusHarness(directory, {
      providerFetch: transport.fetch,
      networkExecution: transport,
    });
    const principal = await root.principalFor(root.ownerId);
    const connections = await root.services.connection.list({ principal });
    for (const connection of connections) {
      if (connection.baseUrl === CORPUS_PROVIDER_ENDPOINT) {
        await root.services.connection.update({ principal, connectionId: connection.id, patch: { baseUrl } });
      }
    }
    const caller = await root.internalCallerFor(root.ownerId);
    await settleCorpusWorkloads(root, caller, [
      await caller.workloads.start({ input: { kind: "databank-reindex", params: { scope: { kind: "owner" }, mode: "chunk-embed" } }, mode: "singular" }),
    ]);
    fixture = ownership.use(
      await cloneCorpusFixture(
        {
          ...root.corpus,
          replay: { version: 1, nowMs: root.clock.now(), idCursor: root.ids.snapshot() },
        },
        join(parent, "stage"),
      ),
    );
  }
  const lifetime = ownership.move();
  return { fixture, provider: { baseUrl, requests }, [Symbol.asyncDispose]: (): Promise<void> => lifetime.disposeAsync() };
}
