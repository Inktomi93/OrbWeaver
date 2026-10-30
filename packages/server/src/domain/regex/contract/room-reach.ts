import type { ResolveRegexScriptRoomsOp } from "@orb/contracts/regex";
import type { ChatId, RegexScriptId } from "@orb/kit/ids";

export interface RegexRoomReach {
  readonly script: (scriptId: RegexScriptId) => Promise<ChatId[]>;
  readonly scripts: ResolveRegexScriptRoomsOp;
}
