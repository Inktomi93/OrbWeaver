// Shared real-root setup for native executable controls; no fixture owns engine decisions or context.
import type { ChatBusEvent } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { UserIntent } from "@orb/contracts/preset";
import { CLAUDE_CONFIG_DIR_ENV } from "@orb/contracts/preset";
import type { JsonValue } from "@orb/kit/json";
import { jsonValueSchema } from "@orb/kit/json";
import { createSeededIds } from "@orb/testkit/iso";
import { expect } from "@orb/testkit/node";
import type { ChatRoot, ChatRootOptions, CompactionMarker, TranscriptLine } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
  readCompactionMarker,
  readRoomCanon,
  SECRET_BOX_TEST_KEY,
} from "@orb/testkit/node/composed";
import { createSdkProcessSpawner } from "@orb/testkit/node/helpers";
import { z } from "zod";
import { ENGINE_SDK_MODEL, ENGINE_SDK_POLICY, ENGINE_SDK_RECEIPT } from "./engine-sdk-physical.mjs";

const receiptSchema = z.object({
  marker: z.boolean(),
  prompt: z.string(),
  held: z.boolean(),
  argv: z.array(z.string()),
  importedSeed: z.object({ sessionId: z.uuid(), rowCount: z.number(), firstText: z.string(), lastText: z.string() }).optional(),
  // The models the session's saved `cost-state` already held when this turn started.
  savedModels: z.array(z.string()).optional(),
});
const behaviorSchema = z.enum(["reply", "fail", "hold"]);
const policySchema = z.object({
  marker: behaviorSchema,
  foreground: behaviorSchema,
  inputTokens: z.number(),
  inspectHistory: z.literal(true).optional(),
  // Raw SDK protocol frames the foreground turn writes before its reply; `slot` names the parent frame identity each takes.
  frames: z.array(z.object({ slot: z.string(), frame: z.record(z.string(), z.json()) })).optional(),
  // The foreground result's billed models and permission denials, verbatim SDK protocol records.
  modelUsage: z.record(z.string(), z.json()).optional(),
  permissionDenials: z.array(z.json()).optional(),
  // The executable keeps its session's saved usage as the runtime does, so a resumed turn's `modelUsage` is cumulative.
  carryUsage: z.literal(true).optional(),
});

/** The stored credential secret the room's connection carries, so a case can plant it in what the SDK returns. */
export const ENGINE_SDK_CREDENTIAL = "controlled-engine-native-token";
const sdkFixtureIds = createSeededIds();

// Alternating owner and primary-character lines; the import attributes each assistant line to the primary seat.
function engineHistory(through: number): readonly TranscriptLine[] {
  return Array.from({ length: through }, (_, index) => {
    const seq = index + 1;
    return { role: seq % 2 === 1 ? "user" : "assistant", content: `turn ${seq} — ${"lorem ipsum dolor sit amet ".repeat(8)}` };
  });
}

export async function sdkEngineRoom(
  options: Omit<ChatRootOptions, "providerFetch"> & {
    readonly history?: number;
    readonly window?: number;
    /** The connection's window is a guess, as one no tier stated: declared as estimated, so the fold marks it. */
    readonly windowGuessed?: true;
    /** A model id the connection names; the default is the curated one every engine case runs. */
    readonly model?: string;
    readonly policy?: Partial<z.infer<typeof policySchema>>;
  } = {},
): Promise<
  AsyncDisposable & {
    readonly h: ChatRoot;
    readonly connection: Awaited<ReturnType<ChatRoot["root"]["services"]["connection"]["create"]>>;
    readonly receipts: readonly z.infer<typeof receiptSchema>[];
    readonly held: ReadonlySet<ReturnType<ReturnType<typeof createSdkProcessSpawner>>>;
    readonly setPolicy: (patch: Partial<z.infer<typeof policySchema>>) => void;
    readonly release: () => void;
    readonly turn: (intent?: UserIntent) => ReturnType<ChatRoot["root"]["services"]["chat"]["generate"]>;
    /** The checkpoint as the room's host reads it; pass the principal who holds the host seat after a handoff. */
    readonly marker: (host?: Principal) => Promise<CompactionMarker>;
    /** The stored seq of the room's nth canon row, counted from one; production owns the numbering. */
    readonly seqOfRow: (row: number) => Promise<number | undefined>;
    readonly warnings: () => Promise<Extract<ChatBusEvent, { type: "warning" }>[]>;
  }
> {
  await using construction = new AsyncDisposableStack();
  const { history = 0, window = 32_000, windowGuessed, model = ENGINE_SDK_MODEL, policy: initialPolicy, ...rootOptions } = options;
  let policy = policySchema.parse({ marker: "reply", foreground: "reply", inputTokens: 4, ...initialPolicy });
  const spawn = createSdkProcessSpawner(new URL("./engine-sdk-physical.mjs", import.meta.url));
  const receipts: z.infer<typeof receiptSchema>[] = [];
  const held = new Set<ReturnType<typeof spawn>>();
  const released = new WeakSet<ReturnType<typeof spawn>>();
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "The stateless engine reply.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  const h = construction.use(
    await createChatRoot({
      memoryEnabled: false,
      group: { output: "per-speaker", policy: "list", allowSelfResponses: true },
      ...rootOptions,
      ...(history === 0 ? {} : { transcript: engineHistory(history) }),
      providerFetch: physical.execute,
      server: {
        secretBoxKey: SECRET_BOX_TEST_KEY,
        ids: sdkFixtureIds,
        ...rootOptions.server,
        sdkSpawn: (input) => {
          const readsTranscript = policy.inspectHistory === true || policy.carryUsage === true;
          const physicalPolicy = readsTranscript ? { ...policy, materializedRuntime: input.env[CLAUDE_CONFIG_DIR_ENV] } : policy;
          const child = spawn({ ...input, args: [...input.args, `${ENGINE_SDK_POLICY}${JSON.stringify(physicalPolicy)}`] });
          let pending = "";
          child.stderr.on("data", (bytes: Buffer) => {
            const lines = `${pending}${bytes.toString("utf8")}`.split("\n");
            pending = lines.pop() ?? "";
            for (const line of lines) {
              if (!line.startsWith(ENGINE_SDK_RECEIPT)) {
                continue;
              }
              const receipt = receiptSchema.parse(JSON.parse(line.slice(ENGINE_SDK_RECEIPT.length)));
              receipts.push(receipt);
              if (receipt.held) {
                held.add(child);
              }
            }
          });
          child.once("close", () => held.delete(child));
          return child;
        },
      },
    }),
  );
  const credential = await h.root.services.credentials.add({ principal: h.owner, provider: "claude-sub", key: ENGINE_SDK_CREDENTIAL });
  const connection = await h.root.services.connection.create({
    principal: h.owner,
    providerId: "claude-sub",
    credentialId: credential.id,
    baseUrl: null,
    model,
    allowBackground: true,
    declared: { kind: "generation", generation: { context: { window, ...(windowGuessed === true ? { windowEstimated: true } : {}) } } },
  });
  await h.caller.connection.setBinding({ task: "chat", connectionId: connection.id });
  const release = (): void => {
    for (const child of held) {
      if (!released.has(child)) {
        released.add(child);
        child.kill("SIGUSR2");
      }
    }
  };
  construction.defer(release);
  const lifetime = construction.move();
  return {
    h,
    connection,
    receipts,
    held,
    setPolicy: (patch): void => {
      policy = policySchema.parse({ ...policy, ...patch });
    },
    release,
    turn: async (intent = {}) => await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId, intent }),
    marker: async (host = h.owner) => await readCompactionMarker(h.root, host, h.chatId),
    seqOfRow: async (row) => (await readRoomCanon(h.root, h.owner, h.chatId))[row - 1]?.seq,
    warnings: async () =>
      (await h.root.services.chat.replayChatEvents({ principal: h.owner, chatId: h.chatId })).flatMap(({ event }) => (event.type === "warning" ? [event] : [])),
    [Symbol.asyncDispose]: () => lifetime.disposeAsync(),
  };
}

/** The room's turn outcomes as the authenticated debug door serves them, after its recorder state is checked. */
export async function readDebugOutcomes(h: ChatRoot, debugToken: string): Promise<JsonValue[]> {
  const response = await h.root.http.request(`/api/_debug/wire/outcomes?chatId=${h.chatId}`, {
    headers: { "x-debug-token": debugToken },
  });
  expect(response.status).toBe(200);
  const body = jsonValueSchema.parse(await response.json());
  if (body === null || typeof body !== "object" || Array.isArray(body) || !Array.isArray(body["outcomes"])) {
    throw new Error("the real debug outcome response has no outcome list");
  }
  expect(body["enabled"]).toBe(true);
  expect(body["count"]).toBe(body["outcomes"].length);
  return body["outcomes"];
}
