// Only vendor response bytes vary; room policy, persistence and assembly belong to the real graph.
import { resolveProseText } from "@orb/contracts/prose";
import type { ChatId } from "@orb/kit/ids";
import type { JsonValue } from "@orb/kit/json";
import { jsonValueSchema } from "@orb/kit/json";
import { finiteReplies } from "@orb/testkit/iso";
import type { ChatRoot, ChatRootOptions } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
  readRoomCanon,
} from "@orb/testkit/node/composed";

interface TextProvider extends Disposable {
  readonly execute: typeof fetch;
}

/** A finite physical reply plan as provider execution, for a room or a test that wraps the provider's own timing. */
export function textProvider(replies: readonly string[]): TextProvider {
  using construction = new DisposableStack();
  const nextReply = construction.use(finiteReplies("scenario physical", replies)).take;
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "unused finite reply fallback",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
    completion: () => ({ text: nextReply(), toolCalls: [], usage: { promptTokens: 4, completionTokens: 2 } }),
  });
  const lifetime = construction.move();
  return { execute: provider.execute, [Symbol.dispose]: () => lifetime.dispose() };
}

/** Supply a finite physical reply plan without substituting a domain operation. */
export async function textRoom(replies: readonly string[], options: Omit<ChatRootOptions, "providerFetch"> = {}): Promise<ChatRoot> {
  await using construction = new AsyncDisposableStack();
  const execute = construction.use(textProvider(replies)).execute;
  const h = construction.use(await createChatRoot({ memoryEnabled: false, ...options, providerFetch: execute }));
  const lifetime = construction.move();
  return { ...h, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}

function chatBodies(requests: readonly Request[]): Promise<JsonValue[]> {
  return Promise.all(
    requests
      .filter((request) => request.method === "POST" && new URL(request.url).pathname.endsWith("/chat/completions"))
      .map(async (request) => jsonValueSchema.parse(JSON.parse(await request.clone().text()))),
  );
}

/** What one act sent the provider, with the act's own outcome. */
export interface WireOf<T> {
  readonly outcome: T;
  /** The act's chat-completions bodies, oldest first. */
  readonly bodies: readonly [JsonValue, ...JsonValue[]];
}

/** Run the act and read only the chat-completions bodies it sent. A tail of the room's whole history would hand an
 *  act that sent nothing the previous round's body, so this throws when the act sent none. */
export async function wireOf<T>(h: ChatRoot, act: () => Promise<T>): Promise<WireOf<T>> {
  const mark = h.requests.length;
  const outcome = await act();
  const [first, ...rest] = await chatBodies(h.requests.slice(mark));
  if (first === undefined) {
    throw new Error("the act made no chat-completions request");
  }
  return { outcome, bodies: [first, ...rest] };
}

/** Run an act that must reach no provider, and throw when it sent a chat-completions request. */
export async function quietOf<T>(h: ChatRoot, act: () => Promise<T>): Promise<T> {
  const mark = h.requests.length;
  const outcome = await act();
  const sent = await chatBodies(h.requests.slice(mark));
  if (sent.length > 0) {
    throw new Error(`the act made ${String(sent.length)} chat-completions request(s); it must make none`);
  }
  return outcome;
}

function leaves(value: JsonValue): readonly string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (value === null || typeof value !== "object") {
    return [];
  }
  return (Array.isArray(value) ? value : Object.values(value)).flatMap(leaves);
}

/** Every string the provider received in one request, one per line. */
export function wireText(body: JsonValue): string {
  return leaves(body).join("\n");
}

/** The first non-system message text of a physical request: a seeded history's opening row, behind the new-chat marker. */
export function openingText(body: JsonValue | undefined): string {
  if (body === undefined || body === null || typeof body !== "object" || Array.isArray(body) || !Array.isArray(body["messages"])) {
    throw new Error("the actual native request has no messages");
  }
  const row = body["messages"].find((message) => message !== null && typeof message === "object" && !Array.isArray(message) && message["role"] !== "system");
  if (row === null || typeof row !== "object" || Array.isArray(row) || typeof row["content"] !== "string") {
    throw new Error("the actual native request has no text history row");
  }
  return row["content"];
}

/** The opening row's text when the history's first line is `text`. */
export function openingOf(text: string): string {
  return `${resolveProseText("preset.format.newChatMarker", {})}\n\n${text}`;
}

/** One SillyTavern transcript line: the user's turn or the room character's reply. */
export interface TranscriptLine {
  readonly user: boolean;
  readonly text: string;
}

/** Land a SillyTavern transcript for the room's first character through the production chat import door and
 *  return the import-born room. */
export async function importTranscript(h: ChatRoot, lines: readonly TranscriptLine[]): Promise<ChatId> {
  const descriptor = h.root.app.portability.find((entity) => entity.kind === "chat");
  const card = h.characters[0];
  const first = lines[0];
  if (descriptor === undefined || card === undefined || first === undefined) {
    throw new Error("the transcript import needs the production chat descriptor, a seated character and a first line");
  }
  const sentAt = JSON.stringify(new Date(h.root.clock.now()).toISOString());
  const header = `{"character_name":${JSON.stringify(card.name)},"user_name":${JSON.stringify(h.owner.handle)},"create_date":${sentAt}}`;
  const body = lines.map(
    (line) =>
      `{"name":${JSON.stringify(line.user ? h.owner.handle : card.name)},"is_user":${line.user},"is_system":false,"mes":${JSON.stringify(line.text)},"send_date":${sentAt}}`,
  );
  const outcome = await descriptor.importFile(h.owner.userId, {
    filename: `${card.handle}/imported.jsonl`,
    bytes: new TextEncoder().encode([header, ...body].join("\n")),
  });
  if (!outcome.ok) {
    throw new Error(`the production chat import refused the transcript: ${JSON.stringify(outcome)}`);
  }
  for (const room of (await h.root.services.chat.listChats({ principal: h.owner })).items) {
    if ((await readRoomCanon(h.root, h.owner, room.id))[0]?.content === first.text) {
      return room.id;
    }
  }
  throw new Error("the production chat import landed no first line");
}

/** A room as imported today, and the same room as launched data holds it: numbered from seq 0. */
export const LEGACY_IMPORT_ARMS = [
  { title: "a room imported today", legacy: false },
  { title: "a launched room numbered from seq 0", legacy: true },
] as const;

/** The room's canon seqs, oldest first. */
export async function importedSeqs(h: ChatRoot, chatId: ChatId): Promise<number[]> {
  return (await readRoomCanon(h.root, h.owner, chatId)).map(({ seq }) => seq);
}
