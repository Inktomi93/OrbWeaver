// Script files and executable bytes are fixture-owned; no Query, principal or accounting result is fabricated.
import "@orb/testkit/node/composed-real.ts";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jsonValueSchema } from "@orb/kit/json";
import { createSeededIds } from "@orb/testkit/iso";
import type { ChatRoot, ChatRootOptions } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
  seedMessage,
} from "@orb/testkit/node/composed";
import { createSdkProcessSpawner } from "@orb/testkit/node/helpers";
import { z } from "zod";
import { CORE_SDK_IMPORT_RECEIPT, CORE_SDK_RECEIPT, CORE_SDK_RUNTIME_ARG, CORE_SDK_SCRIPT_ARG } from "./core-sdk-physical.mjs";
import { ENGINE_SDK_MODEL } from "./engine-sdk-physical.mjs";

const replySchema = z.object({
  text: z.string(),
  failed: z.boolean(),
  cost: z.number(),
  thinking: z.string().optional(),
  deltaThinking: z.string().optional(),
});
const importSchema = z.object({ sessionId: z.uuid(), resume: z.uuid(), frames: z.array(jsonValueSchema) });
const sdkIds = createSeededIds();
export type CoreSdkReply = z.infer<typeof replySchema>;

/** Supply raw SDK replies from an owned file while the installed native Query owns actual session state. */
export async function coreSdkRoom(
  initial: CoreSdkReply,
  server: ChatRootOptions["server"] = {},
): Promise<
  AsyncDisposable & {
    readonly h: ChatRoot;
    readonly connection: Awaited<ReturnType<ChatRoot["root"]["services"]["connection"]["create"]>>;
    readonly receipts: readonly CoreSdkReply[];
    readonly imports: readonly z.infer<typeof importSchema>[];
    readonly childCounts: () => { readonly spawned: number; readonly closed: number };
    readonly setReply: (reply: CoreSdkReply) => Promise<void>;
  }
> {
  await using construction = new AsyncDisposableStack();
  const scratch = await mkdtemp(join(tmpdir(), "orb-1193-core-sdk-"));
  construction.defer(() => rm(scratch, { recursive: true, force: true }));
  const scriptPath = join(scratch, "reply.json");
  const setReply = async (reply: CoreSdkReply): Promise<void> => {
    await writeFile(scriptPath, JSON.stringify(replySchema.parse(reply)));
  };
  await setReply(initial);
  const spawn = createSdkProcessSpawner(new URL("./core-sdk-physical.mjs", import.meta.url));
  const children: ReturnType<typeof spawn>[] = [];
  const closed = new Set<ReturnType<typeof spawn>>();
  const closeReceipts: Promise<void>[] = [];
  construction.defer(async () => {
    const failures: Error[] = [];
    const live = children.filter((child) => !closed.has(child) && child.exitCode === null && child.signalCode === null);
    if (live.length > 0) {
      failures.push(new Error("the real SDK root left its physical child running"));
    }
    for (const child of live) {
      try {
        if (!child.kill("SIGTERM")) {
          failures.push(new Error("the owned SDK child refused its cleanup signal"));
        }
      } catch (error) {
        failures.push(new Error("the owned SDK cleanup signal failed", { cause: error }));
      }
    }
    await Promise.all(closeReceipts);
    if (failures.length > 0) {
      throw new AggregateError(failures, "the controlled SDK root did not release its physical children");
    }
  });
  const receipts: CoreSdkReply[] = [];
  const imports: z.infer<typeof importSchema>[] = [];
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "No core SDK test requests an HTTP generation.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  const h = construction.use(
    await createChatRoot({
      providerFetch: physical.execute,
      memoryEnabled: false,
      group: { output: "per-speaker", policy: "list", allowSelfResponses: true },
      server: {
        secretBoxKey: Buffer.alloc(32, 1),
        ids: sdkIds,
        ...server,
        sdkSpawn: (input) => {
          const runtime = input.env["CLAUDE_CONFIG_DIR"];
          if (runtime === undefined) {
            throw new Error("the actual native SDK spawn has no materialized configuration directory");
          }
          const child = spawn({ ...input, args: [...input.args, `${CORE_SDK_SCRIPT_ARG}${scriptPath}`, `${CORE_SDK_RUNTIME_ARG}${runtime}`] });
          children.push(child);
          closeReceipts.push(
            new Promise<void>((resolve) => {
              child.once("close", () => {
                closed.add(child);
                resolve();
              });
            }),
          );
          let pending = "";
          child.stderr.on("data", (bytes: Buffer) => {
            const lines = `${pending}${bytes.toString("utf8")}`.split("\n");
            pending = lines.pop() ?? "";
            for (const line of lines) {
              if (line.startsWith(CORE_SDK_RECEIPT)) {
                receipts.push(replySchema.parse(JSON.parse(line.slice(CORE_SDK_RECEIPT.length))));
              } else if (line.startsWith(CORE_SDK_IMPORT_RECEIPT)) {
                imports.push(importSchema.parse(JSON.parse(line.slice(CORE_SDK_IMPORT_RECEIPT.length))));
              }
            }
          });
          return child;
        },
      },
    }),
  );
  const character = h.characters[0];
  if (character === undefined) {
    throw new Error("the actual SDK room has no seated character");
  }
  await seedMessage(h.root.db, { chatId: h.chatId, seq: 1, role: "user", authorUserId: h.owner.userId, content: "An owned SDK seed." }, h.root.idSource);
  await seedMessage(h.root.db, { chatId: h.chatId, seq: 2, characterId: character.id, content: "The prior assistant answers." }, h.root.idSource);
  const credential = await h.root.services.credentials.add({ principal: h.owner, provider: "claude-sub", key: "controlled-core-native-sdk-token" });
  const connection = await h.root.services.connection.create({
    principal: h.owner,
    providerId: "claude-sub",
    credentialId: credential.id,
    baseUrl: null,
    model: ENGINE_SDK_MODEL,
    allowBackground: true,
  });
  await h.caller.connection.setBinding({ task: "chat", connectionId: connection.id });
  await h.root.services.stats.reconcile(h.owner.userId);
  const lifetime = construction.move();
  return {
    h,
    connection,
    receipts,
    imports,
    childCounts: () => ({ spawned: children.length, closed: closed.size }),
    setReply,
    [Symbol.asyncDispose]: () => lifetime.disposeAsync(),
  };
}
