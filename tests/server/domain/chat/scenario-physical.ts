// Only vendor response bytes vary; room policy, persistence and assembly belong to the real graph.
import { resolveProseText } from "@orb/contracts/prose";
import { messages, messageVariants } from "@orb/db";
import type { ChatId } from "@orb/kit/ids";
import type { JsonValue } from "@orb/kit/json";
import { jsonValueSchema } from "@orb/kit/json";
import type { ChatRoot, ChatRootOptions } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
} from "@orb/testkit/node/composed";
import { asc, eq, sql } from "drizzle-orm";

/** Supply a finite physical reply plan without substituting a domain operation. */
export async function textRoom(replies: readonly string[], options: Omit<ChatRootOptions, "providerFetch"> = {}): Promise<ChatRoot> {
  let next = 0;
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "unused finite reply fallback",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
    completion: () => {
      const text = replies[next++];
      if (text === undefined) {
        throw new Error("the scenario physical reply plan is exhausted");
      }
      return { text, toolCalls: [], usage: { promptTokens: 4, completionTokens: 2 } };
    },
  });
  return await createChatRoot({ memoryEnabled: false, ...options, providerFetch: provider.execute });
}

/** The JSON bodies of the room's recorded chat-completions requests, oldest first. */
export async function wireBodies(h: ChatRoot): Promise<JsonValue[]> {
  return await Promise.all(
    h.requests
      .filter((request) => request.method === "POST" && new URL(request.url).pathname.endsWith("/chat/completions"))
      .map(async (request) => jsonValueSchema.parse(JSON.parse(await request.clone().text()))),
  );
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
  const [landed] = await h.root.db
    .select({ chatId: messages.chatId })
    .from(messages)
    .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
    .where(eq(messageVariants.content, first.text));
  if (landed === undefined) {
    throw new Error("the production chat import landed no first line");
  }
  return landed.chatId;
}

/** A room as imported today, and the same room as launched data holds it: numbered from seq 0. */
export const LEGACY_IMPORT_ARMS = [
  { title: "a room imported today", legacy: false },
  { title: "a launched room numbered from seq 0", legacy: true },
] as const;

/** Re-number a room's canon to start at seq 0, the shape the earlier import writer left in launched databases. */
export async function renumberFromZero(h: ChatRoot, chatId: ChatId): Promise<void> {
  const [oldest] = await importedSeqs(h, chatId);
  if (oldest === undefined) {
    throw new Error("the room has no canon to re-number");
  }
  await h.root.db
    .update(messages)
    .set({ seq: sql`${messages.seq} - ${oldest}` })
    .where(eq(messages.chatId, chatId));
}

/** The room's canon seqs, oldest first. */
export async function importedSeqs(h: ChatRoot, chatId: ChatId): Promise<number[]> {
  const rows = await h.root.db.select({ seq: messages.seq }).from(messages).where(eq(messages.chatId, chatId)).orderBy(asc(messages.seq));
  return rows.map(({ seq }) => seq);
}
