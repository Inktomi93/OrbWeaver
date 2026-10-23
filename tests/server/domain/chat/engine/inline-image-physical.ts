// A controlled image/tool endpoint speaks native Google bytes; plugin execution and asset retention stay real.
import { spawn } from "node:child_process";
import { parseVariantMetadata } from "@orb/contracts/chat";
import { providerDefSchema } from "@orb/contracts/inference";
import { PLUGIN_HOST_VERSIONS, PLUGIN_MAIN_ENTRY, pluginManifestSchema, pluginToolWireName } from "@orb/contracts/plugin";
import { assets, chatEvents, messageAssets, messages, messageVariants } from "@orb/db";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { JsonValue } from "@orb/kit/json";
import { jsonValueSchema } from "@orb/kit/json";
import type { ServerHarnessOptions } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
  makeAssetBytes,
  makePluginBundle,
  seedAdminProvider,
  seedInstalledPlugin,
  seedPluginGrant,
} from "@orb/testkit/node/composed";
import { and, eq } from "drizzle-orm";

export const IMAGE_PROSE = "She unrolls the map.";
export const IMAGE_SIGNATURE = "private-native-image-signature";
export const TEXT_SIGNATURE = "private-native-text-signature";
export const TOOL_SIGNATURE = "private-native-tool-signature";
export const BEFORE_SIGNATURE = "private-native-before-signature";
export const AFTER_SIGNATURE = "private-native-after-signature";
const TOOL_SLUG = "inline-image-draw";
export const IMAGE_TOOL = pluginToolWireName(TOOL_SLUG, "draw");

export function nativeText(text: string, thoughtSignature?: string): JsonValue {
  return { text, ...(thoughtSignature === undefined ? {} : { thoughtSignature }) };
}

export function nativeImage(invalid = false): JsonValue {
  const bytes = invalid ? Buffer.from("hello") : makeAssetBytes(mintTypeId(ID_PREFIX.asset));
  return { inlineData: { mimeType: "image/png", data: Buffer.from(bytes).toString("base64") }, thoughtSignature: IMAGE_SIGNATURE };
}

export function nativeTool(): JsonValue {
  return { functionCall: { id: "same", name: IMAGE_TOOL, args: {} }, thoughtSignature: TOOL_SIGNATURE };
}

interface NativeModalityCount {
  readonly modality: string;
  readonly tokenCount: number;
}

interface NativeImageUsage {
  readonly promptTokenCount?: number;
  readonly candidatesTokenCount: number;
  readonly totalTokenCount: number;
  readonly thoughtsTokenCount?: number;
  readonly cachedContentTokenCount?: number;
  readonly promptTokensDetails?: readonly NativeModalityCount[];
  readonly candidatesTokensDetails?: readonly NativeModalityCount[];
}

function nativeResponse(parts: readonly JsonValue[], usageMetadata: NativeImageUsage): Response {
  const frames = [
    ...parts.map((part) => ({ candidates: [{ content: { role: "model", parts: [part] } }] })),
    {
      candidates: [{ content: { role: "model", parts: [] }, finishReason: "STOP" }],
      usageMetadata,
    },
  ];
  return new Response(frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join(""), { headers: { "content-type": "text/event-stream" } });
}

interface ImagePhysicalOptions extends Pick<ServerHarnessOptions, "db"> {
  readonly cachedContentTokenCount?: number;
  readonly usageMetadata?: ReadonlyMap<number, NativeImageUsage>;
}

export async function imageRoom(
  script: readonly (readonly JsonValue[])[],
  tools = false,
  physicalOptions: ImagePhysicalOptions = {},
): Promise<
  AsyncDisposable & {
    readonly h: Awaited<ReturnType<typeof createChatRoot>>;
    readonly turn: () => ReturnType<Awaited<ReturnType<typeof createChatRoot>>["root"]["services"]["chat"]["generate"]>;
    readonly inputs: () => Promise<JsonValue[][]>;
    readonly canon: () => ReturnType<Awaited<ReturnType<typeof createChatRoot>>["caller"]["chat"]["listMessages"]>;
    readonly selected: () => Promise<ReturnType<typeof parseVariantMetadata> | undefined>;
    readonly links: () => Promise<(typeof messageAssets.$inferSelect)[]>;
    readonly generated: () => Promise<(typeof assets.$inferSelect)[]>;
    readonly events: () => Promise<(typeof chatEvents.$inferSelect)[]>;
  }
> {
  await using construction = new AsyncDisposableStack();
  let next = 0;
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "unused image-room corpus reply",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  const definition = providerDefSchema.parse({
    id: "controlled-inline-native",
    label: "Controlled native image and tool endpoint",
    wire: "google-generative-ai",
    auth: "endpoint",
    apis: ["google-generative-ai"],
    catalog: "url",
    metered: true,
  });
  const h = construction.use(
    await createChatRoot({
      memoryEnabled: false,
      group: { output: "per-speaker", policy: "list", allowSelfResponses: true },
      server: { secretBoxKey: Buffer.alloc(32, 1), pluginSpawn: spawn, ...(physicalOptions.db === undefined ? {} : { db: physicalOptions.db }) },
      providerFetch: async (input, init) => {
        const request = new Request(input, init);
        if (request.method === "POST" && new URL(request.url).pathname.endsWith(":streamGenerateContent")) {
          const exchange = next++;
          const parts = script[exchange];
          if (parts === undefined) {
            throw new Error("the finite native image completion script is exhausted");
          }
          return nativeResponse(
            parts,
            physicalOptions.usageMetadata?.get(exchange) ?? {
              promptTokenCount: 10,
              candidatesTokenCount: 4,
              totalTokenCount: 14,
              ...(physicalOptions.cachedContentTokenCount === undefined ? {} : { cachedContentTokenCount: physicalOptions.cachedContentTokenCount }),
            },
          );
        }
        return await physical.execute(request);
      },
    }),
  );
  await seedAdminProvider(h.root, definition, { admin: h.owner.userId });
  const credential = await h.root.services.credentials.add({ principal: h.owner, provider: definition.id, key: "controlled-native-image-key" });
  const connection = await h.root.services.connection.create({
    principal: h.owner,
    providerId: definition.id,
    credentialId: credential.id,
    baseUrl: "http://127.0.0.1:8704/v1beta",
    model: "controlled-image-tool-model",
    // This declaration describes the physical supplier, not an unsupported claim about an official Google image model.
    declared: {
      kind: "generation",
      generation: {
        input: ["text", "image"],
        context: { window: 128_000 },
        output: { modalities: ["text", "image"], maxTokens: { min: 1, max: 8192 } },
        ...(tools ? { tools: { parallel: true } } : {}),
        reasoning: { replay: "signed" },
      },
      features: { detectServer: false },
    },
  });
  await h.caller.connection.setBinding({ task: "chat", connectionId: connection.id });
  if (tools) {
    const manifest = pluginManifestSchema.parse({
      id: TOOL_SLUG,
      name: "Native image draw tool",
      description: "Returns the drawn moon through real guest execution.",
      version: "1.0.0",
      hostVersion: PLUGIN_HOST_VERSIONS[0],
      entry: PLUGIN_MAIN_ENTRY,
      capabilities: ["tools.register"],
    });
    const source = `const host = orb.host(1);
host.tools.register({name:"draw",description:"Draw the moon.",replayHistory:true,
  parameters:{type:"object",properties:{},additionalProperties:false},handler:async()=>"Moon"});`;
    const installed = await seedInstalledPlugin(h.root, {
      caller: h.owner,
      bundle: makePluginBundle(manifest, source, h.root.clock.now()),
      grant: [],
    });
    const enabled = await seedPluginGrant(h.root, {
      caller: h.owner,
      pluginId: installed.outcome.id,
      grant: manifest.capabilities,
      acknowledgedNetHosts: [],
      enable: true,
    });
    if (enabled.outcome.status !== "enabled") {
      throw new Error("the actual native drawing plugin did not activate");
    }
  }
  const inputs = async (): Promise<JsonValue[][]> =>
    await Promise.all(
      h.requests
        .filter((request) => request.method === "POST" && new URL(request.url).pathname.endsWith(":streamGenerateContent"))
        .map(async (request) => {
          const body = jsonValueSchema.parse(JSON.parse(await request.clone().text()));
          if (body === null || typeof body !== "object" || Array.isArray(body) || !Array.isArray(body["contents"])) {
            throw new Error("the native image request has no contents");
          }
          return body["contents"];
        }),
    );
  const lifetime = construction.move();
  return {
    h,
    inputs,
    turn: async () =>
      await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId, intent: { replyMedia: "text+image", carryReasoning: "conversation" } }),
    canon: async () => await h.caller.chat.listMessages({ chatId: h.chatId }),
    selected: async (): Promise<ReturnType<typeof parseVariantMetadata> | undefined> => {
      const row = await h.root.db
        .select({ metadata: messageVariants.metadata })
        .from(messages)
        .innerJoin(messageVariants, eq(messages.selectedVariantId, messageVariants.id))
        .where(and(eq(messages.chatId, h.chatId), eq(messages.role, "assistant")))
        .orderBy(messages.seq)
        .get();
      return row === undefined ? undefined : parseVariantMetadata(row.metadata);
    },
    links: async () =>
      await h.root.db
        .select({ link: messageAssets })
        .from(messageAssets)
        .innerJoin(messages, eq(messages.id, messageAssets.messageId))
        .where(eq(messages.chatId, h.chatId))
        .then((rows) => rows.map(({ link }) => link)),
    generated: async () =>
      await h.root.db
        .select()
        .from(assets)
        .where(and(eq(assets.ownerId, h.owner.userId), eq(assets.kind, "generated"))),
    events: async () => await h.root.db.select().from(chatEvents).where(eq(chatEvents.chatId, h.chatId)),
    [Symbol.asyncDispose]: () => lifetime.disposeAsync(),
  };
}

export function wireParts(contents: readonly JsonValue[], role?: string): JsonValue[] {
  return contents.flatMap((row) =>
    row !== null && typeof row === "object" && !Array.isArray(row) && (role === undefined || row["role"] === role) && Array.isArray(row["parts"])
      ? row["parts"]
      : [],
  );
}

export function partKinds(parts: readonly JsonValue[]): string[] {
  return parts.flatMap((part) => {
    if (part === null || typeof part !== "object" || Array.isArray(part)) {
      return [];
    }
    if ("inlineData" in part) {
      return ["image"];
    }
    if ("functionCall" in part) {
      return ["call"];
    }
    if ("functionResponse" in part) {
      return ["result"];
    }
    return typeof part["text"] === "string" && ["Before.", "After.", "Done."].includes(part["text"]) ? [part["text"]] : [];
  });
}
