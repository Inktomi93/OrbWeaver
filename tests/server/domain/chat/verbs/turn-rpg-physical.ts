// Real room authoring and finite native bytes; the production graph owns RPG state and tool attachment.
import "@orb/testkit/node/composed-real.ts";
import { RPG_LITE_TOOL_NAMES, RPG_NO_CHANGES_TOOL } from "@orb/contracts/rpg";
import type { JsonValue } from "@orb/kit/json";
import { jsonValueSchema } from "@orb/kit/json";
import type { ChatRoot, ChatRootOptions } from "@orb/testkit/node/chat/composed.ts";
import { CORPUS_PROVIDER_ENDPOINT, CORPUS_TEXT_MODEL } from "@orb/testkit/node/corpus-provider.ts";
import { terminalSseLine } from "@orb/testkit/node/provider-stream.ts";
import type { CoreWireReply } from "../engine/core-physical.ts";
import { coreFrame, coreHttpRoom, coreSse } from "../engine/core-physical.ts";

export const TURN_SCENE_TOOL = RPG_LITE_TOOL_NAMES[2];

/** Persist and bind the actual tools-capable model; no resolved connection is fabricated. */
export async function turnToolsRoom(replies: readonly CoreWireReply[], options: Omit<ChatRootOptions, "providerFetch"> = {}): Promise<ChatRoot> {
  await using construction = new AsyncDisposableStack();
  const h = construction.use(await coreHttpRoom(replies, options));
  const connection = await h.root.services.connection.create({
    principal: h.owner,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: CORPUS_TEXT_MODEL,
    declared: {
      kind: "generation",
      generation: { input: ["text"], context: { window: 32_000 }, tools: { parallel: true, silencesProse: false } },
      features: { detectServer: false },
    },
  });
  await h.caller.connection.setBinding({ task: "chat", connectionId: connection.id });
  const lifetime = construction.move();
  return { ...h, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}

/** Create the engaged game through its host-only door after the actual model binding exists. */
export async function turnRpgRoom(
  replies: readonly CoreWireReply[],
  options: Omit<ChatRootOptions, "providerFetch"> = {},
  extractionMode = "folded",
): Promise<ChatRoot> {
  await using construction = new AsyncDisposableStack();
  const h = construction.use(await turnToolsRoom(replies, { ...options, server: { rpgTrace: true, ...options.server } }));
  await h.root.services.rpg.createGame({ principal: h.owner, chatId: h.chatId, mode: "lite" });
  await h.root.services.rpg.updateConfig({
    principal: h.owner,
    chatId: h.chatId,
    extractionMode,
    patch: { stateCaptureVehicle: "tools" },
  });
  const lifetime = construction.move();
  return { ...h, [Symbol.asyncDispose]: () => lifetime.disposeAsync() };
}

/** Read actual provider request bytes without defining a second native request shape. */
export async function turnWireBody(request: Request): Promise<Exclude<JsonValue, JsonValue[] | null | string | number | boolean>> {
  const value = jsonValueSchema.parse(await request.clone().json());
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("the native turn body is not a JSON object");
  }
  return value;
}

/** Emit a terminal native call alongside prose, or an explicit no-change call when no scene changed. */
export function turnRpgReply(text: string, location?: string): Response {
  return coreSse([
    coreFrame({
      choices: [
        {
          delta: {
            content: text,
            ["tool_calls"]: [
              {
                index: 0,
                id: "turn-rpg-terminal",
                type: "function",
                function: {
                  name: location === undefined ? RPG_NO_CHANGES_TOOL : TURN_SCENE_TOOL,
                  arguments: JSON.stringify(location === undefined ? {} : { location }),
                },
              },
            ],
          },
        },
      ],
    }),
    terminalSseLine({ finishReason: "tool_calls", usage: { promptTokens: 12, completionTokens: 8 } }),
  ]);
}
