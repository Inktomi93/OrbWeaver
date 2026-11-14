// Portable chat shapes as the chat-bundle serde reads them: empty-but-valid defaults stamped at the frozen epoch, so a
// case overrides only the plane it is about. The shapes are the serde's own types and the sub-schemas are the contracts'.
import { rpgGameConfigSchema, rpgSnapshotStateSchema } from "@orb/contracts/rpg";
import type { PortableChat, PortableChatMessage, PortableRpgGame } from "@orb/server/primitives/serde/chat-bundle";
import { FROZEN_AT_MS } from "../../iso/clock.ts";

/** One message with a single variant; `over` replaces any message field, including the variant list. */
export function makePortableMessage(role: PortableChatMessage["role"], content: string, over: Partial<PortableChatMessage> = {}): PortableChatMessage {
  return {
    role,
    kind: "standard",
    speakerHandle: null,
    personaName: null,
    createdAt: FROZEN_AT_MS,
    selectedIdx: 0,
    variants: [
      {
        idx: 0,
        content,
        model: null,
        provider: null,
        tokensIn: null,
        tokensOut: null,
        tokenProvenance: "unrecorded",
        reasoning: null,
        ttftMs: null,
        genStartedAt: null,
        genFinishedAt: null,
        variableDelta: null,
        metadata: null,
      },
    ],
    ...over,
  };
}

/** One committed turn snapshot at `messages[messageIndex]`'s variant `variantIdx`, recording `location`. */
export function makePortableTurnSnapshot(messageIndex: number, variantIdx: number, location: string): PortableRpgGame["snapshots"][number] {
  return {
    messageIndex,
    variantIdx,
    asOfMessageIndex: null,
    bookmark: false,
    committed: true,
    createdAt: FROZEN_AT_MS,
    state: rpgSnapshotStateSchema.parse({ clock: null, calendarDate: null, weather: null, fieldLocks: null, location }),
  };
}

/** A lite campaign with no sheets, snapshots, journal, tool calls or checkpoints. */
export function makePortableGame(over: Partial<PortableRpgGame> = {}): PortableRpgGame {
  return {
    mode: "lite",
    status: "active",
    sessionNumber: 1,
    config: rpgGameConfigSchema.parse({}),
    createdAt: FROZEN_AT_MS,
    sheets: [],
    snapshots: [],
    journal: [],
    turnToolCalls: [],
    checkpoints: [],
    ...over,
  };
}

/** An empty room with no character, tag, injection, message or campaign. */
export function makePortableChat(over: Partial<PortableChat> = {}): PortableChat {
  return {
    title: "Portable chat",
    createdAt: FROZEN_AT_MS,
    updatedAt: FROZEN_AT_MS,
    starred: false,
    archived: false,
    everShared: false,
    compactSummary: null,
    compactedAtSeq: null,
    metadata: null,
    variableValues: null,
    userMacroValues: null,
    anchorPersonaName: null,
    characterHandles: [],
    tagNames: [],
    injections: [],
    messages: [],
    rpg: null,
    ...over,
  };
}
