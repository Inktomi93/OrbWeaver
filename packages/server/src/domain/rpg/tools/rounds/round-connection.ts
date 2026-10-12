// The state rounds' connection seam: the one structured-output call, the unresolvable-connection classification,
// the room preset window, and the funder's chat connection resolved the way the turn resolves its own.

import type { Resolved } from "@orb/inference";
import { NoConnectionError, ProviderError, runStructuredChat, withPresetWindow } from "@orb/inference";
import type { ChatId, UserId } from "@orb/kit/ids";
import type { ExtractCtx, RpgRoundsDeps } from "#src/domain/rpg/contract/rounds.ts";

/** The structured-output schema NAME the structured extraction passes as `responseFormat.name` (OpenAI
 *  `json_schema.name`; Anthropic tool name). One home — no scattered magic string. */
const EXTRACTION_SCHEMA_NAME = "rpg_state_extraction";

/** Emit the extraction JSON TEXT: a READ-ONLY structured emission (no tools mounted — extraction never mutates
 *  through a tool turn) on the CHARACTER turn's own row, never a re-resolve. How the request rides the connection's
 *  backend is `@orb/inference`'s choice; the format rides untouched, so no vehicle is asked for. */
export function extractStructured(deps: RpgRoundsDeps, ctx: ExtractCtx): Promise<string> {
  return runStructuredChat(deps.executor, {
    connection: ctx.conn,
    chatId: ctx.chatId,
    systemPrompt: ctx.systemPrompt,
    userPrompt: ctx.userPrompt,
    responseFormat: { name: EXTRACTION_SCHEMA_NAME, schema: ctx.schema },
    signal: ctx.signal,
  });
}

/** A resolve that ended in NO row / an unservable row — the pill and the two host doors degrade on it (readonly,
 *  no round) rather than 500; any other failure is a real fault and rethrows. */
export function isUnresolvable(err: unknown): boolean {
  return err instanceof NoConnectionError || (err instanceof ProviderError && err.kind === "forbidden");
}

export function withGenerationObservation(
  deps: RpgRoundsDeps,
  parent: Parameters<RpgRoundsDeps["rpgChatOps"]["beginGenerationObservation"]>[0],
): RpgRoundsDeps {
  const onObservedResult = deps.rpgChatOps.beginGenerationObservation(parent);
  return { ...deps, executor: { runChatTurn: (request) => deps.executor.runChatTurn({ ...request, onObservedResult }) } };
}

/** A send on the room's chat connection outside the turn carries the window the turn sends: on a route whose request
 *  sets it (Ollama's native `num_ctx`), the room preset's Max context, read through chat's one ladder. */
export async function roomWindowed(deps: RpgRoundsDeps, chatId: ChatId, conn: Resolved<"chat">): Promise<Resolved<"chat">> {
  return withPresetWindow(conn, (await deps.rpgChatOps.resolveChatPresetParams(chatId)).maxContextTokens);
}

/** The FUNDER's chat connection, resolved the way the turn resolves its own (chat's `resolveChatFor`: the same
 *  connection service, under the same real principal). A turn is funded by the room host whoever sends it
 *  (`resolveTurnIdentity`), and the state round rides that turn's connection, so this is the connection a
 *  delivery verdict describes. `null` on a `no-connection` / requirement refusal; anything else (a DB fault)
 *  RETHROWS. */
export async function resolveFunderChat(deps: RpgRoundsDeps, funderUserId: UserId): Promise<Resolved<"chat"> | null> {
  const funder = await deps.resolveHostPrincipal(funderUserId);
  try {
    return (await deps.connection.resolve({ task: "chat", principal: funder })).resolved as Resolved<"chat">;
  } catch (err) {
    if (isUnresolvable(err)) {
      return null;
    }
    throw err;
  }
}
