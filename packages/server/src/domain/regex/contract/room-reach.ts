import type { ChatId, RegexScriptId } from "@orb/kit/ids";

export interface RegexRoomReach {
  readonly script: (scriptId: RegexScriptId) => Promise<ChatId[]>;
  readonly scripts: (scriptIds: readonly RegexScriptId[]) => Promise<Map<RegexScriptId, ChatId[]>>;
}
