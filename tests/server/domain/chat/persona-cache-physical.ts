// Native Anthropic input carries the cache proof; only response bytes and canonical-host DNS are supplied.
import { builtinProvider, SHIPPED_PROMPT_CACHE } from "@orb/contracts/inference";
import { createPersonaSchema } from "@orb/contracts/persona";
import { createBookSchema, createEntrySchema } from "@orb/contracts/world-info";
import type { JsonValue } from "@orb/kit/json";
import { jsonValueSchema } from "@orb/kit/json";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import type { ChatRoot, ChatRootOptions } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
} from "@orb/testkit/node/composed";

const MODEL = "claude-opus-5-5";

function reply(text: string, model: string): Response {
  const event = (type: string, data: string): string => `event: ${type}\ndata: ${data}\n\n`;
  return new Response(
    [
      event(
        "message_start",
        `{"type":"message_start","message":{"id":"msg_persona","type":"message","role":"assistant","model":${JSON.stringify(model)},"content":[],"stop_reason":null,"usage":{"input_tokens":4,"output_tokens":0}}}`,
      ),
      event("content_block_start", '{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}'),
      event("content_block_delta", `{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":${JSON.stringify(text)}}}`),
      event("content_block_stop", '{"type":"content_block_stop","index":0}'),
      event("message_delta", '{"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":2}}'),
      event("message_stop", '{"type":"message_stop"}'),
    ].join(""),
    { headers: { "content-type": "text/event-stream" } },
  );
}

/** Keep provider admission and the native converter real while controlling a finite sequence of replies. */
export async function personaRoom(
  replies: readonly string[],
  options: Pick<ChatRootOptions, "characters" | "promptConfig" | "group"> & { readonly model?: string } = {},
): Promise<ChatRoot> {
  await using construction = new AsyncDisposableStack();
  const { model = MODEL, ...roomOptions } = options;
  const endpoint = builtinProvider("anthropic")?.baseUrl;
  if (endpoint === undefined) {
    throw new Error("the canonical Anthropic provider has no endpoint");
  }
  const hostname = new URL(endpoint).hostname;
  let next = 0;
  const corpus = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "unused persona corpus reply",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  const h = construction.use(
    await createChatRoot({
      ...roomOptions,
      memoryEnabled: false,
      server: {
        secretBoxKey: Buffer.alloc(32, 1),
        networkExecution: {
          resolver: (host): Promise<readonly string[]> =>
            host === hostname ? Promise.resolve(["93.184.215.14"]) : Promise.reject(new Error(`unscripted persona provider address: ${host}`)),
        },
      },
      providerFetch: async (input, init) => {
        const request = new Request(input, init);
        if (request.method === "POST" && new URL(request.url).pathname.endsWith("/messages")) {
          request.signal.throwIfAborted();
          const text = replies[next++];
          if (text === undefined) {
            throw new Error("the persona physical reply plan is exhausted");
          }
          return reply(text, model);
        }
        return await corpus.execute(request);
      },
    }),
  );
  const credential = await h.root.services.credentials.add({ principal: h.owner, provider: "anthropic", key: "controlled-persona-cache-key" });
  const connection = await h.root.services.connection.create({
    principal: h.owner,
    providerId: "anthropic",
    credentialId: credential.id,
    baseUrl: null,
    model,
    promptCache: SHIPPED_PROMPT_CACHE,
  });
  await h.caller.connection.setBinding({ task: "chat", connectionId: connection.id });
  const lifetime = construction.move();
  return { ...h, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}

/** Read exactly what the physical provider received, including its actual cache directives. */
export async function personaInputs(h: ChatRoot): Promise<JsonValue[]> {
  return await Promise.all(
    h.requests
      .filter((request) => request.method === "POST" && new URL(request.url).pathname.endsWith("/messages"))
      .map(async (request) => jsonValueSchema.parse(JSON.parse(await request.clone().text()))),
  );
}

/** Decode the native text-only vendor body without reconstructing a TurnRequest. */
export function inputMessages(body: JsonValue): JsonValue[] {
  if (body === null || typeof body !== "object" || Array.isArray(body) || !Array.isArray(body["messages"])) {
    throw new Error("the native persona input has no message array");
  }
  return body["messages"];
}

/** Cache controls advance independently from the cached content they delimit. */
export function withoutCacheDirective(value: JsonValue): JsonValue {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(withoutCacheDirective);
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "cache_control")
      .map(([key, entry]) => [key, withoutCacheDirective(entry)]),
  );
}

/** The last native history breakpoint makes a prefix comparison non-vacuous. */
export function lastMarkedRow(rows: readonly JsonValue[]): number {
  return rows.findLastIndex(
    (row) =>
      row !== null &&
      typeof row === "object" &&
      !Array.isArray(row) &&
      Array.isArray(row["content"]) &&
      row["content"].some((part) => part !== null && typeof part === "object" && !Array.isArray(part) && part["cache_control"] !== undefined),
  );
}

/** Read static native system content separately from per-turn message and cache controls. */
export function inputSystem(body: JsonValue): string {
  if (body === null || typeof body !== "object" || Array.isArray(body) || !Array.isArray(body["system"])) {
    throw new Error("the native persona input has no system blocks");
  }
  return body["system"]
    .map((part) => {
      if (part === null || typeof part !== "object" || Array.isArray(part) || typeof part["text"] !== "string") {
        throw new Error("the native persona system contains a non-text block");
      }
      return part["text"];
    })
    .join("\n\n");
}

/** Preserve the vendor's actual leading blocks when cache partition boundaries are the subject. */
export function inputSystemBlocks(body: JsonValue): JsonValue[] {
  if (body === null || typeof body !== "object" || Array.isArray(body) || !Array.isArray(body["system"])) {
    throw new Error("the native persona input has no system blocks");
  }
  return body["system"];
}

/** Read native text blocks without reconstructing the application's history shape. */
export function nativeText(value: JsonValue): string {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(nativeText).join("");
  }
  return value !== null && typeof value === "object" && typeof value["text"] === "string" ? value["text"] : "";
}

/** Label and placement assertions consume the actual vendor messages, including native mid-history system rows. */
export function messageText(row: JsonValue): string {
  if (row === null || typeof row !== "object" || Array.isArray(row)) {
    throw new Error("the native persona input contains a non-message");
  }
  return nativeText(row["content"] ?? null);
}

/** The room's real invite and acceptance establish a consenting actor, not a synthesized Principal. */
export async function invitePerson(h: ChatRoot): Promise<ChatRoot["owner"]> {
  const person = await h.root.principalFor((await h.root.actor()).id);
  const invite = await h.root.services.chat.createInvite({ principal: h.owner, chatId: h.chatId, input: { invitedHandle: person.handle } });
  await h.root.services.chat.acceptInvite({ principal: person, inviteId: invite.invite.id });
  return person;
}

/** Persona authorship and seating run the same owned writes as the application. */
export async function seatPersona(
  h: ChatRoot,
  principal: ChatRoot["owner"],
  name: string,
  description: string,
): Promise<Awaited<ReturnType<ChatRoot["root"]["services"]["persona"]["create"]>>> {
  const persona = await h.root.services.persona.create({ principal, input: createPersonaSchema.parse({ name, description }) });
  await h.root.services.persona.setActivePersona({ principal, chatId: h.chatId, personaId: persona.id });
  return persona;
}

/** Lore enters through the book owner's operations and the real persona attachment guard. */
export async function attachPersonaLore(
  h: ChatRoot,
  principal: ChatRoot["owner"],
  personaId: Parameters<ChatRoot["root"]["services"]["worldInfo"]["attachToPersona"]>[0]["personaId"],
  content: string,
): Promise<void> {
  const book = await h.root.services.worldInfo.createBook({ principal, input: createBookSchema.parse({ name: "Persona probe lore" }) });
  await h.root.services.worldInfo.createEntry({ principal, bookId: book.id, input: createEntrySchema.parse({ title: "Persona probe", content }) });
  await h.root.services.worldInfo.attachToPersona({ principal, personaId, bookId: book.id });
}

/** A real host-authored manual automation arm reaches the non-human turn entry; no requestTurn test door. */
export async function personaAutoTurn(h: ChatRoot): Promise<void> {
  const rule = await h.root.services.automation.createRule({
    principal: h.owner,
    chatId: h.chatId,
    name: "Persona automatic turn",
    trigger: { bus: "chat", type: "chatOpened" },
    actions: [{ type: "trigger_turn", confirmFirst: false }],
    timeZone: UTC_TIME_ZONE,
  });
  await h.root.services.automation.setRuleEnabled({ principal: h.owner, ruleId: rule.id, enabled: true });
  const result = await h.root.services.automation.runRuleNow({ principal: h.owner, ruleId: rule.id });
  if (result.outcome !== "fired") {
    throw new Error(`the real persona automation arm did not fire: ${result.outcome}`);
  }
}
