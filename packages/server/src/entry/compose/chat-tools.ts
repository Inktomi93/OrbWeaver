// entry/compose/chat-tools — the B7 `react` tool definition: the
// FIRST tool the S2 attach axis carries onto a chat turn.
//
// HOMED AT THE COMPOSITION ROOT, not in `domain/chat` — and the reason is a real cycle, not taste: a
// domain-side definition file must import `ToolDefinition` from `#domain/tool-use`, whose front door also
// exports its teaching contribution, which imports chat's teaching types — `no-circular` REDS the loop
// (probed). The constitution's own rule resolves it: the runtime wiring of a cross-feature op belongs at
// the composition root (§2 — "the runtime op is wired at the composition root"). The BEHAVIOR stays
// chat's: the handler is a thin projection over the injected `createReactAsCharacter` op
// (`domain/chat/verbs/reactions.ts`), which owns every gate and every refusal word.
//
// REACHABILITY is the attach axis alone: `run_tool` admits only plugin-sourced tools (the D146-d
// narrowing, `automation/engine/arm-executors.ts`), and a builtin is not host-drivable, so the ONLY path
// to this handler is a turn whose teaching collection attached `CHAT_REACT_TOOL_NAME` — which chat's own
// contribution emits exactly when the room's `charactersCanReact` AND `reactionsEnabled` both resolve ON.
// The verb re-checks the same posture at write time (the mid-turn-flip belt), so an OFF room cannot be
// reached even by a stale attach.
//
// The capability ceiling is `null` (member floor — the imagery `generate_image` precedent): the executing
// principal is the TURN's resolved host (`buildChatToolOps` mints it from `frame.runAsUserId`), the verb's
// own membership guard is the gate, and the ATTRIBUTED seat is the named character's — never the
// principal's.

import { CHAT_REACT_TOOL_DESCRIPTION, CHAT_REACT_TOOL_NAME, REACTION_SPEAKER_NAME_MAX, reactionEmojiSchema } from "@orb/contracts/chat";
import { z } from "zod";
import type { ReactAsCharacterOp } from "#domain/chat";
import type { ToolDefinition, ToolExecutionContext, ToolHandlerResult } from "#domain/tool-use";

/** The model-facing args. `character` and `toSpeaker` are NAMES (the model cannot know ids — Marinara's
 *  `[react: … to "Name"]` precedent) under the contracts name bound; `emoji` is the closed wire
 *  vocabulary, so an off-vocabulary ask fails the args parse and returns to the model as a schema error
 *  it can correct. */
const reactToolArgsSchema = z.object({
  character: z.string().min(1).max(REACTION_SPEAKER_NAME_MAX),
  emoji: reactionEmojiSchema,
  toSpeaker: z.string().min(1).max(REACTION_SPEAKER_NAME_MAX).optional(),
});

type ReactToolArgs = z.infer<typeof reactToolArgsSchema>;

/** The `react` builtin — registered once at the composition root (`compose/services.ts` /
 *  `compose/chat.ts`'s caller) into the ONE tool-use registry. */
export function createReactToolDefinition(deps: { readonly reactAsCharacter: ReactAsCharacterOp }): ToolDefinition<ReactToolArgs> {
  return {
    name: CHAT_REACT_TOOL_NAME,
    // PROSE slot `chat.tool.reactDescription`, resolved to its shipped default at module load (no user in
    // scope at compose registration — the `IMAGERY_GENERATE_IMAGE_TOOL_DESCRIPTION` posture). The
    // description IS the teach: the attach contribution ships no prose injection beside it (the tool-use
    // teaching contribution's documented reasoning — the wire `tools` array is the model's native channel).
    description: CHAT_REACT_TOOL_DESCRIPTION,
    argsSchema: reactToolArgsSchema,
    capability: null,
    source: "builtin",
    handler: async (args: ReactToolArgs, exec: ToolExecutionContext): Promise<ToolHandlerResult> => {
      if (exec.chatId === null) {
        return { ok: false, error: "react requires a chat context" };
      }
      const result = await deps.reactAsCharacter({
        principal: exec.principal,
        chatId: exec.chatId,
        characterName: args.character,
        emoji: args.emoji,
        ...(args.toSpeaker !== undefined ? { toSpeaker: args.toSpeaker } : {}),
      });
      if (!result.ok) {
        return { ok: false, error: result.reason };
      }
      return {
        ok: true,
        value: {
          reacted: !result.alreadyReacted,
          alreadyReacted: result.alreadyReacted,
          character: result.character,
          emoji: result.emoji,
          target: result.target,
        },
      };
    },
  };
}
