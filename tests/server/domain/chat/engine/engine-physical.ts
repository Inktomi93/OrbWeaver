// Shared real-root setup for native executable controls; no fixture owns engine decisions or context.
import type { ChatBusEvent } from "@orb/contracts/chat";
import type { UserIntent } from "@orb/contracts/preset";
import { createSeededIds } from "@orb/testkit/iso";
import type { ChatRoot, ChatRootOptions, TranscriptLine } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
  readRoomCanon,
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
});
const behaviorSchema = z.enum(["reply", "fail", "hold"]);
const policySchema = z.object({ marker: behaviorSchema, foreground: behaviorSchema, inputTokens: z.number(), inspectHistory: z.literal(true).optional() });
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
    readonly marker: () => Promise<Pick<Awaited<ReturnType<ChatRoot["root"]["services"]["chat"]["getChat"]>>, "compactSummary" | "compactedAtSeq">>;
    /** The stored seq of the room's nth canon row, counted from one; production owns the numbering. */
    readonly seqOfRow: (row: number) => Promise<number | undefined>;
    readonly warnings: () => Promise<Extract<ChatBusEvent, { type: "warning" }>[]>;
  }
> {
  await using construction = new AsyncDisposableStack();
  const { history = 0, window = 32_000, policy: initialPolicy, ...rootOptions } = options;
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
        secretBoxKey: Buffer.alloc(32, 1),
        ids: sdkFixtureIds,
        ...rootOptions.server,
        sdkSpawn: (input) => {
          const physicalPolicy = policy.inspectHistory === true ? { ...policy, materializedRuntime: input.env["CLAUDE_CONFIG_DIR"] } : policy;
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
  const credential = await h.root.services.credentials.add({ principal: h.owner, provider: "claude-sub", key: "controlled-engine-native-token" });
  const connection = await h.root.services.connection.create({
    principal: h.owner,
    providerId: "claude-sub",
    credentialId: credential.id,
    baseUrl: null,
    model: ENGINE_SDK_MODEL,
    allowBackground: true,
    declared: { kind: "generation", generation: { context: { window } } },
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
    marker: async () => await h.root.services.chat.getChat({ principal: h.owner, chatId: h.chatId }),
    seqOfRow: async (row) => (await readRoomCanon(h.root, h.owner, h.chatId))[row - 1]?.seq,
    warnings: async () =>
      (await h.root.services.chat.replayChatEvents({ principal: h.owner, chatId: h.chatId })).flatMap(({ event }) => (event.type === "warning" ? [event] : [])),
    [Symbol.asyncDispose]: () => lifetime.disposeAsync(),
  };
}
