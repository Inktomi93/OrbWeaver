// The registry receives model-facing legality and repeat status without changing the character-seat attribution.
import type { ReactToolHandler, ReactToolHandlerDeps } from "../contract/react-tool.ts";

export function createReactToolHandler(deps: ReactToolHandlerDeps): ReactToolHandler {
  return async (args, exec) => {
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
  };
}
