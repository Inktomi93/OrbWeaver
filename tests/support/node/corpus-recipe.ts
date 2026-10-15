// The publisher and native capsule qualification share one external execution recipe; production still owns every domain operation.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { authConfigFromEnv } from "@orb/server/entry/auth";
import { createFrozenClock } from "../iso/clock.ts";
import { createSeededIds } from "../iso/ids.ts";
import type { CorpusCapsuleOptions } from "./corpus.ts";
import { CORPUS_CHAT_MODEL, corpusImageryPhysicalBytes, createCorpusChatWire } from "./corpus-chat-wire.ts";
import { CORPUS_IMAGE_MODEL } from "./corpus-imagery.ts";
import { corpusKnowledgeVariantsText, createKnowledgeSwipeWire } from "./corpus-knowledge-wire.ts";
import { CORPUS_EMBED_MODEL, CORPUS_EMBEDDING_VECTOR, CORPUS_STRUCTURED_REPLIES, CORPUS_TEXT_MODEL, createCorpusProviderExecution } from "./corpus-provider.ts";
import { createRpgFlightWire, RPG_RECURSION_MODEL, RPG_ROUND_MODEL } from "./corpus-rpg-flight-wire.ts";
import { createCorpusRpgWire } from "./corpus-rpg-wire.ts";

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

/** Only external responses, business clock/IDs and process-local crypto vary; nothing constructs a replacement domain graph. */
export async function createCorpusRecipe(parent: string): Promise<CorpusRecipe> {
  const rpgWire = createCorpusRpgWire();
  const swipes = createKnowledgeSwipeWire();
  const lifecycleWire = createCorpusChatWire();
  const rpgFlightWire = createRpgFlightWire();
  const execution = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL, CORPUS_CHAT_MODEL, CORPUS_IMAGE_MODEL, RPG_RECURSION_MODEL, RPG_ROUND_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: corpusKnowledgeVariantsText,
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: await corpusImageryPhysicalBytes(),
    usage: { promptTokens: 40, completionTokens: 15 },
    completion: (body) => rpgFlightWire.completion(body) ?? rpgWire.completion(body) ?? swipes.completion(body) ?? lifecycleWire.completion(body),
  });
  const key = randomBytes(32);
  const clock = createFrozenClock();
  const ids = createSeededIds();
  const options = {
    server: {
      clock,
      ids,
      authConfig: { ...authConfigFromEnv(), mode: "local" as const },
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
